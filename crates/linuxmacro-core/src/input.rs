use crate::{MacroProgram, parser::normalize_evdev_trigger, runtime::RuntimeState};
use std::{
    collections::HashMap,
    fs::{self, File},
    io::{self, Read},
    os::fd::AsRawFd,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

const EV_KEY: u16 = 1;
const KEY_DOWN: i32 = 1;

#[cfg(target_pointer_width = "64")]
const TIMEVAL_BYTES: usize = 16;

#[cfg(target_pointer_width = "32")]
const TIMEVAL_BYTES: usize = 8;

const INPUT_EVENT_BYTES: usize = TIMEVAL_BYTES + 8;

pub fn input_event_paths() -> Vec<PathBuf> {
    let mut paths = fs::read_dir("/dev/input")
        .into_iter()
        .flat_map(|entries| entries.filter_map(Result::ok))
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("event"))
        })
        .collect::<Vec<_>>();
    paths.sort();
    paths
}

pub fn event_device_name(path: &Path) -> Option<String> {
    let event_name = path.file_name()?.to_str()?;
    let sysfs_name = Path::new("/sys/class/input")
        .join(event_name)
        .join("device/name");
    fs::read_to_string(sysfs_name)
        .ok()
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
}

pub fn trigger_code(trigger_name: &str) -> Option<u16> {
    let normalized = normalize_evdev_trigger(trigger_name);
    if let Some(letter) = normalized.strip_prefix("KEY_") {
        if letter.len() == 1 {
            let character = letter.chars().next()?;
            if character.is_ascii_alphabetic() {
                return linux_letter_code(character);
            }
            if character.is_ascii_digit() {
                return linux_digit_code(character);
            }
        }
    }

    Some(match normalized.as_str() {
        "BTN_SIDE" => 275,
        "BTN_EXTRA" => 276,
        "KEY_SPACE" => 57,
        "KEY_ENTER" => 28,
        "KEY_TAB" => 15,
        "KEY_ESC" => 1,
        "KEY_BACK" => 158,
        "KEY_FORWARD" => 159,
        _ => return None,
    })
}

pub fn start_toggle_listener(program: &MacroProgram, state: &RuntimeState) {
    let trigger_codes = program
        .toggle_buttons
        .iter()
        .filter_map(|name| trigger_code(name).map(|code| (code, name.clone())))
        .collect::<HashMap<_, _>>();

    if trigger_codes.is_empty() {
        state.set_message("toggle listener unavailable: no valid trigger names");
        return;
    }

    let trigger_codes = Arc::new(trigger_codes);
    let last_toggle = Arc::new(Mutex::new(None));
    let mut opened = 0usize;
    let mut errors = Vec::new();

    for path in input_event_paths() {
        if event_device_name(&path)
            .is_some_and(|name| name.to_ascii_lowercase().contains("ydotool"))
        {
            continue;
        }

        match File::open(&path) {
            Ok(file) => {
                let _ = set_nonblocking(&file);
                opened += 1;
                spawn_reader_thread(
                    path,
                    file,
                    Arc::clone(&trigger_codes),
                    state.clone(),
                    Arc::clone(&last_toggle),
                );
            }
            Err(error) => {
                errors.push(format!("{}: {error}", path.display()));
            }
        }
    }

    if opened == 0 {
        let detail = errors.into_iter().take(3).collect::<Vec<_>>().join("; ");
        if detail.is_empty() {
            state.set_message("toggle listener unavailable: no /dev/input/event* devices");
        } else {
            state.set_message(format!("toggle listener unavailable ({detail})"));
        }
        return;
    }

    state.set_message(format!(
        "listening for {}",
        program.toggle_buttons.join(", ")
    ));
}

fn spawn_reader_thread(
    path: PathBuf,
    mut file: File,
    trigger_codes: Arc<HashMap<u16, String>>,
    state: RuntimeState,
    last_toggle: Arc<Mutex<Option<Instant>>>,
) {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("event")
        .to_string();

    let _ = thread::Builder::new()
        .name(format!("linuxmacro-toggle-{name}"))
        .spawn(move || {
            let mut buffer = [0u8; INPUT_EVENT_BYTES];
            while !state.is_stopped() {
                match file.read_exact(&mut buffer) {
                    Ok(()) => {
                        if let Some((event_type, code, value)) = parse_input_event(&buffer) {
                            if event_type == EV_KEY && value == KEY_DOWN {
                                if let Some(trigger_name) = trigger_codes.get(&code) {
                                    toggle_with_debounce(
                                        &state,
                                        trigger_name,
                                        Arc::clone(&last_toggle),
                                    );
                                }
                            }
                        }
                    }
                    Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(30));
                    }
                    Err(_) => break,
                }
            }
        });
}

fn set_nonblocking(file: &File) -> io::Result<()> {
    let fd = file.as_raw_fd();
    let flags = unsafe { libc::fcntl(fd, libc::F_GETFL) };
    if flags < 0 {
        return Err(io::Error::last_os_error());
    }
    let result = unsafe { libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK) };
    if result < 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

fn parse_input_event(buffer: &[u8; INPUT_EVENT_BYTES]) -> Option<(u16, u16, i32)> {
    let event_type = u16::from_ne_bytes(buffer[TIMEVAL_BYTES..TIMEVAL_BYTES + 2].try_into().ok()?);
    let code = u16::from_ne_bytes(
        buffer[TIMEVAL_BYTES + 2..TIMEVAL_BYTES + 4]
            .try_into()
            .ok()?,
    );
    let value = i32::from_ne_bytes(
        buffer[TIMEVAL_BYTES + 4..TIMEVAL_BYTES + 8]
            .try_into()
            .ok()?,
    );
    Some((event_type, code, value))
}

fn toggle_with_debounce(
    state: &RuntimeState,
    trigger_name: &str,
    last_toggle: Arc<Mutex<Option<Instant>>>,
) {
    let now = Instant::now();
    let should_toggle = {
        let mut last_toggle = last_toggle.lock().expect("last_toggle mutex poisoned");
        if last_toggle
            .is_none_or(|previous| now.duration_since(previous) >= Duration::from_millis(250))
        {
            *last_toggle = Some(now);
            true
        } else {
            false
        }
    };

    if should_toggle {
        state.toggle(trigger_name);
    }
}

fn linux_letter_code(character: char) -> Option<u16> {
    Some(match character.to_ascii_uppercase() {
        'A' => 30,
        'B' => 48,
        'C' => 46,
        'D' => 32,
        'E' => 18,
        'F' => 33,
        'G' => 34,
        'H' => 35,
        'I' => 23,
        'J' => 36,
        'K' => 37,
        'L' => 38,
        'M' => 50,
        'N' => 49,
        'O' => 24,
        'P' => 25,
        'Q' => 16,
        'R' => 19,
        'S' => 31,
        'T' => 20,
        'U' => 22,
        'V' => 47,
        'W' => 17,
        'X' => 45,
        'Y' => 21,
        'Z' => 44,
        _ => return None,
    })
}

fn linux_digit_code(character: char) -> Option<u16> {
    Some(match character {
        '1' => 2,
        '2' => 3,
        '3' => 4,
        '4' => 5,
        '5' => 6,
        '6' => 7,
        '7' => 8,
        '8' => 9,
        '9' => 10,
        '0' => 11,
        _ => return None,
    })
}
