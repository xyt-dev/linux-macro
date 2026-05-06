use crate::{parser::normalize_evdev_trigger, runtime::RuntimeState};
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

#[derive(Clone)]
pub struct ToggleBinding {
    pub macro_name: String,
    pub trigger_names: Vec<String>,
    pub state: RuntimeState,
}

#[derive(Clone)]
struct TriggerTarget {
    macro_name: String,
    trigger_name: String,
    state: RuntimeState,
}

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
    if let Some(function_key) = normalized
        .strip_prefix("KEY_F")
        .and_then(|number| number.parse::<u8>().ok())
    {
        return linux_function_code(function_key);
    }

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
        "BTN_LEFT" => 272,
        "BTN_RIGHT" => 273,
        "BTN_MIDDLE" => 274,
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

pub fn start_toggle_listener(bindings: Vec<ToggleBinding>) {
    let states = bindings
        .iter()
        .map(|binding| binding.state.clone())
        .collect::<Vec<_>>();
    let mut trigger_codes = HashMap::<u16, Vec<TriggerTarget>>::new();
    let mut trigger_names = Vec::new();

    for binding in bindings {
        for trigger_name in binding.trigger_names {
            if let Some(code) = trigger_code(&trigger_name) {
                if !trigger_names.contains(&trigger_name) {
                    trigger_names.push(trigger_name.clone());
                }
                trigger_codes.entry(code).or_default().push(TriggerTarget {
                    macro_name: binding.macro_name.clone(),
                    trigger_name,
                    state: binding.state.clone(),
                });
            }
        }
    }

    if trigger_codes.is_empty() {
        set_all_messages(
            &states,
            "toggle listener unavailable: no valid trigger names",
        );
        return;
    }

    let trigger_codes = Arc::new(trigger_codes);
    let last_toggle = Arc::new(Mutex::new(HashMap::new()));
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
            set_all_messages(
                &states,
                "toggle listener unavailable: no /dev/input/event* devices",
            );
        } else {
            set_all_messages(&states, format!("toggle listener unavailable ({detail})"));
        }
        return;
    }

    set_all_messages(
        &states,
        format!("listening for {}", trigger_names.join(", ")),
    );
}

fn spawn_reader_thread(
    path: PathBuf,
    mut file: File,
    trigger_codes: Arc<HashMap<u16, Vec<TriggerTarget>>>,
    last_toggle: Arc<Mutex<HashMap<u16, Instant>>>,
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
            while !all_targets_stopped(trigger_codes.as_ref()) {
                match file.read_exact(&mut buffer) {
                    Ok(()) => {
                        if let Some((event_type, code, value)) = parse_input_event(&buffer) {
                            if event_type == EV_KEY && value == KEY_DOWN {
                                if let Some(targets) = trigger_codes.get(&code) {
                                    toggle_with_debounce(targets, code, Arc::clone(&last_toggle));
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

fn set_all_messages(states: &[RuntimeState], message: impl Into<String>) {
    let message = message.into();
    for state in states {
        state.set_message(message.clone());
    }
}

fn all_targets_stopped(trigger_codes: &HashMap<u16, Vec<TriggerTarget>>) -> bool {
    trigger_codes
        .values()
        .flat_map(|targets| targets.iter())
        .all(|target| target.state.is_stopped())
}

fn toggle_with_debounce(
    targets: &[TriggerTarget],
    code: u16,
    last_toggle: Arc<Mutex<HashMap<u16, Instant>>>,
) {
    let now = Instant::now();
    let should_toggle = {
        let mut last_toggle = last_toggle.lock().expect("last_toggle mutex poisoned");
        if last_toggle
            .get(&code)
            .is_none_or(|previous| now.duration_since(*previous) >= Duration::from_millis(250))
        {
            last_toggle.insert(code, now);
            true
        } else {
            false
        }
    };

    if should_toggle {
        for target in targets {
            target
                .state
                .toggle(&format!("{} ({})", target.trigger_name, target.macro_name));
        }
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

fn linux_function_code(number: u8) -> Option<u16> {
    Some(match number {
        1 => 59,
        2 => 60,
        3 => 61,
        4 => 62,
        5 => 63,
        6 => 64,
        7 => 65,
        8 => 66,
        9 => 67,
        10 => 68,
        11 => 87,
        12 => 88,
        13 => 183,
        14 => 184,
        15 => 185,
        16 => 186,
        17 => 187,
        18 => 188,
        19 => 189,
        20 => 190,
        21 => 191,
        22 => 192,
        23 => 193,
        24 => 194,
        _ => return None,
    })
}
