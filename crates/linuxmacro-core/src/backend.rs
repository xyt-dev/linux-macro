use serde::{Deserialize, Serialize};
use std::{
    env,
    error::Error,
    fmt, fs, io,
    path::PathBuf,
    process::{Command, Output, Stdio},
};

#[derive(Debug, Clone)]
pub struct MacroRuntimeError {
    pub message: String,
}

impl MacroRuntimeError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for MacroRuntimeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for MacroRuntimeError {}

impl From<io::Error> for MacroRuntimeError {
    fn from(error: io::Error) -> Self {
        Self::new(error.to_string())
    }
}

pub type RuntimeResult<T> = Result<T, MacroRuntimeError>;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BackendHealth {
    pub session_type: String,
    pub wayland: bool,
    pub display: bool,
    pub ydotool_installed: bool,
    pub xdotool_installed: bool,
    pub pkexec_installed: bool,
    pub systemctl_installed: bool,
    pub recommended_backend: String,
    pub install_command: Option<String>,
    pub service_command: String,
    pub notes: Vec<String>,
}

#[derive(Clone, Debug)]
pub enum KeyBackend {
    Ydotool { code: u16 },
    Xdotool { key_name: String },
}

#[derive(Clone, Debug)]
pub enum MouseButtonBackend {
    Ydotool { button: String },
    Xdotool { button: String },
}

#[derive(Clone, Copy, Debug)]
struct InstallPlan {
    shell_command: &'static str,
    manual_command: &'static str,
    needs_pkexec: bool,
}

impl KeyBackend {
    pub fn press_once(&self) -> RuntimeResult<()> {
        self.key_down()?;
        self.key_up()
    }

    pub fn key_down(&self) -> RuntimeResult<()> {
        match self {
            Self::Ydotool { code } => run_command(
                "ydotool",
                &["key".to_string(), format!("{code}:1")],
                "ydotool failed. Make sure ydotoold is running:\n  systemctl --user enable --now ydotool.service",
            ),
            Self::Xdotool { key_name } => run_command(
                "xdotool",
                &[
                    "keydown".to_string(),
                    "--clearmodifiers".to_string(),
                    key_name.clone(),
                ],
                "xdotool failed",
            ),
        }
    }

    pub fn key_up(&self) -> RuntimeResult<()> {
        match self {
            Self::Ydotool { code } => run_command(
                "ydotool",
                &["key".to_string(), format!("{code}:0")],
                "ydotool failed. Make sure ydotoold is running:\n  systemctl --user enable --now ydotool.service",
            ),
            Self::Xdotool { key_name } => run_command(
                "xdotool",
                &[
                    "keyup".to_string(),
                    "--clearmodifiers".to_string(),
                    key_name.clone(),
                ],
                "xdotool failed",
            ),
        }
    }
}

impl MouseButtonBackend {
    pub fn click_once(&self) -> RuntimeResult<()> {
        self.button_down()?;
        self.button_up()
    }

    pub fn button_down(&self) -> RuntimeResult<()> {
        match self {
            Self::Ydotool { button } => run_command(
                "ydotool",
                &["click".to_string(), ydotool_button_down(button).to_string()],
                "ydotool click failed. Make sure ydotoold is running:\n  systemctl --user enable --now ydotool.service",
            ),
            Self::Xdotool { button } => run_command(
                "xdotool",
                &[
                    "mousedown".to_string(),
                    "--clearmodifiers".to_string(),
                    button.clone(),
                ],
                "xdotool click failed",
            ),
        }
    }

    pub fn button_up(&self) -> RuntimeResult<()> {
        match self {
            Self::Ydotool { button } => run_command(
                "ydotool",
                &["click".to_string(), ydotool_button_up(button).to_string()],
                "ydotool click failed. Make sure ydotoold is running:\n  systemctl --user enable --now ydotool.service",
            ),
            Self::Xdotool { button } => run_command(
                "xdotool",
                &[
                    "mouseup".to_string(),
                    "--clearmodifiers".to_string(),
                    button.clone(),
                ],
                "xdotool click failed",
            ),
        }
    }
}

pub fn create_backend(backend_name: &str, key: &str) -> RuntimeResult<KeyBackend> {
    match backend_name {
        "ydotool" => {
            let code = ydotool_key_code(key).ok_or_else(|| {
                MacroRuntimeError::new(format!(
                    "ydotool backend does not support key {key:?}; use a-z, 0-9, punctuation, or named keys"
                ))
            })?;
            Ok(KeyBackend::Ydotool { code })
        }
        "xdotool" => Ok(KeyBackend::Xdotool {
            key_name: xdotool_key_name(key).to_string(),
        }),
        "pynput" => Err(MacroRuntimeError::new(
            "pynput is a Python backend and is not available in the Rust rewrite; use ydotool or xdotool",
        )),
        other => Err(MacroRuntimeError::new(format!(
            "unsupported backend {other:?}"
        ))),
    }
}

pub fn create_mouse_button_backend(
    backend_name: &str,
    button: &str,
) -> RuntimeResult<MouseButtonBackend> {
    match backend_name {
        "ydotool" => {
            let button = ydotool_click_button(button).ok_or_else(|| {
                MacroRuntimeError::new(format!(
                    "ydotool backend does not support mouse button {button:?}; use left, right, middle, side, or extra"
                ))
            })?;
            Ok(MouseButtonBackend::Ydotool {
                button: button.to_string(),
            })
        }
        "xdotool" => {
            let button = xdotool_click_button(button).ok_or_else(|| {
                MacroRuntimeError::new(format!(
                    "xdotool backend does not support mouse button {button:?}; use left, right, middle, side, or extra"
                ))
            })?;
            Ok(MouseButtonBackend::Xdotool {
                button: button.to_string(),
            })
        }
        "pynput" => Err(MacroRuntimeError::new(
            "pynput is a Python backend and is not available in the Rust rewrite; use ydotool or xdotool",
        )),
        other => Err(MacroRuntimeError::new(format!(
            "unsupported backend {other:?}"
        ))),
    }
}

pub fn choose_backend(requested: &str) -> RuntimeResult<String> {
    match requested {
        "ydotool" => require_command("ydotool").map(|_| "ydotool".to_string()),
        "xdotool" => require_command("xdotool").map(|_| "xdotool".to_string()),
        "pynput" => Err(MacroRuntimeError::new(
            "pynput is a Python backend and is not available in the Rust rewrite; use ydotool or xdotool",
        )),
        "auto" => choose_auto_backend(),
        other => Err(MacroRuntimeError::new(format!(
            "unsupported backend {other:?}"
        ))),
    }
}

pub fn command_exists(command: &str) -> bool {
    let Some(path) = env::var_os("PATH") else {
        return false;
    };

    env::split_paths(&path).any(|directory| executable_candidate(directory, command).is_file())
}

pub fn backend_health() -> BackendHealth {
    let wayland = is_linux_wayland();
    let display = env::var_os("DISPLAY").is_some();
    let ydotool_installed = command_exists("ydotool");
    let xdotool_installed = command_exists("xdotool");
    let pkexec_installed = command_exists("pkexec");
    let systemctl_installed = command_exists("systemctl");
    let install_command = ydotool_install_plan().map(|plan| plan.manual_command.to_string());
    let recommended_backend = if wayland {
        "ydotool"
    } else if display && xdotool_installed {
        "xdotool"
    } else {
        "ydotool"
    }
    .to_string();

    let mut notes = Vec::new();
    if wayland && !ydotool_installed {
        notes.push("Wayland needs ydotool for reliable key injection.".to_string());
    }
    if ydotool_installed && systemctl_installed {
        notes.push("If key injection fails, ensure ydotool.service is running.".to_string());
    }
    if !pkexec_installed {
        notes.push(
            "pkexec is unavailable, so the app cannot request GUI admin authorization.".to_string(),
        );
    }

    BackendHealth {
        session_type: env::var("XDG_SESSION_TYPE").unwrap_or_else(|_| "unknown".to_string()),
        wayland,
        display,
        ydotool_installed,
        xdotool_installed,
        pkexec_installed,
        systemctl_installed,
        recommended_backend,
        install_command,
        service_command: "systemctl --user enable --now ydotool.service".to_string(),
        notes,
    }
}

pub fn install_ydotool() -> RuntimeResult<String> {
    let install_plan = ydotool_install_plan().ok_or_else(|| {
        MacroRuntimeError::new(
            "could not detect a supported package manager. Install ydotool manually, then run: systemctl --user enable --now ydotool.service",
        )
    })?;

    let mut messages = Vec::new();
    if command_exists("ydotool") {
        messages.push("ydotool is already installed.".to_string());
    } else {
        if install_plan.needs_pkexec && !command_exists("pkexec") {
            return Err(MacroRuntimeError::new(format!(
                "pkexec is not installed, so LinuxMacro cannot request admin authorization.\nRun manually:\n  {}\n  systemctl --user enable --now ydotool.service",
                install_plan.manual_command,
            )));
        }

        let output = run_install_plan(install_plan)?;

        if !output.status.success() {
            return Err(MacroRuntimeError::new(format!(
                "ydotool install command failed:\n{}",
                command_output_detail(&output)
            )));
        }
        messages.push("ydotool installed successfully.".to_string());
    }

    match enable_ydotool_service() {
        Ok(message) => messages.push(message),
        Err(error) => messages.push(format!(
            "ydotool installed, but service setup needs manual action: {error}"
        )),
    }

    Ok(messages.join("\n"))
}

fn choose_auto_backend() -> RuntimeResult<String> {
    if is_linux_wayland() {
        if command_exists("ydotool") {
            return Ok("ydotool".to_string());
        }
        return Err(MacroRuntimeError::new(
            "Wayland session detected, but ydotool is not installed.\n\nInstall and start it on Arch Linux:\n  sudo pacman -S --needed --noconfirm ydotool\n  systemctl --user enable --now ydotool.service",
        ));
    }

    if env::var_os("DISPLAY").is_some() && command_exists("xdotool") {
        return Ok("xdotool".to_string());
    }

    if command_exists("ydotool") {
        return Ok("ydotool".to_string());
    }

    Err(MacroRuntimeError::new(
        "no supported input backend found; install ydotool for Wayland or xdotool for X11",
    ))
}

fn ydotool_install_plan() -> Option<InstallPlan> {
    if command_exists("pacman") {
        Some(InstallPlan {
            shell_command: "pacman -S --needed --noconfirm ydotool",
            manual_command: "sudo pacman -S --needed --noconfirm ydotool",
            needs_pkexec: true,
        })
    } else if command_exists("apt-get") {
        Some(InstallPlan {
            shell_command: "apt-get update && apt-get install -y ydotool",
            manual_command: "sudo sh -lc 'apt-get update && apt-get install -y ydotool'",
            needs_pkexec: true,
        })
    } else if command_exists("dnf") {
        Some(InstallPlan {
            shell_command: "dnf install -y ydotool",
            manual_command: "sudo dnf install -y ydotool",
            needs_pkexec: true,
        })
    } else if command_exists("zypper") {
        Some(InstallPlan {
            shell_command: "zypper --non-interactive install -y ydotool",
            manual_command: "sudo zypper --non-interactive install -y ydotool",
            needs_pkexec: true,
        })
    } else if command_exists("apk") {
        Some(InstallPlan {
            shell_command: "apk add ydotool",
            manual_command: "sudo apk add ydotool",
            needs_pkexec: true,
        })
    } else if command_exists("xbps-install") {
        Some(InstallPlan {
            shell_command: "xbps-install -Sy ydotool",
            manual_command: "sudo xbps-install -Sy ydotool",
            needs_pkexec: true,
        })
    } else if command_exists("eopkg") {
        Some(InstallPlan {
            shell_command: "eopkg install -y ydotool",
            manual_command: "sudo eopkg install -y ydotool",
            needs_pkexec: true,
        })
    } else if command_exists("pkcon") {
        Some(InstallPlan {
            shell_command: "pkcon install -y ydotool",
            manual_command: "pkcon install -y ydotool",
            needs_pkexec: false,
        })
    } else {
        os_release_like_install_plan()
    }
}

fn os_release_like_install_plan() -> Option<InstallPlan> {
    let os_release = fs::read_to_string("/etc/os-release").ok()?;
    let lower = os_release.to_ascii_lowercase();
    if lower.contains("id_like=arch") {
        Some(InstallPlan {
            shell_command: "pacman -S --needed --noconfirm ydotool",
            manual_command: "sudo pacman -S --needed --noconfirm ydotool",
            needs_pkexec: true,
        })
    } else if lower.contains("id_like=debian") || lower.contains("id=ubuntu") {
        Some(InstallPlan {
            shell_command: "apt-get update && apt-get install -y ydotool",
            manual_command: "sudo sh -lc 'apt-get update && apt-get install -y ydotool'",
            needs_pkexec: true,
        })
    } else if lower.contains("id_like=fedora") {
        Some(InstallPlan {
            shell_command: "dnf install -y ydotool",
            manual_command: "sudo dnf install -y ydotool",
            needs_pkexec: true,
        })
    } else if lower.contains("id_like=suse") {
        Some(InstallPlan {
            shell_command: "zypper --non-interactive install -y ydotool",
            manual_command: "sudo zypper --non-interactive install -y ydotool",
            needs_pkexec: true,
        })
    } else {
        None
    }
}

fn run_install_plan(plan: InstallPlan) -> RuntimeResult<Output> {
    if plan.needs_pkexec {
        Command::new("pkexec")
            .args(["sh", "-lc", plan.shell_command])
            .stdin(Stdio::null())
            .output()
            .map_err(|error| {
                MacroRuntimeError::new(format!("failed to start pkexec installer: {error}"))
            })
    } else {
        Command::new("sh")
            .args(["-lc", plan.shell_command])
            .stdin(Stdio::null())
            .output()
            .map_err(|error| {
                MacroRuntimeError::new(format!("failed to start package installer: {error}"))
            })
    }
}

fn enable_ydotool_service() -> RuntimeResult<String> {
    if !command_exists("systemctl") {
        return Err(MacroRuntimeError::new(
            "systemctl is not installed; start ydotoold manually",
        ));
    }

    let output = Command::new("systemctl")
        .args(["--user", "enable", "--now", "ydotool.service"])
        .stdin(Stdio::null())
        .output()
        .map_err(|error| {
            MacroRuntimeError::new(format!("failed to run systemctl --user: {error}"))
        })?;

    if output.status.success() {
        Ok("ydotool.service enabled and started for the current user.".to_string())
    } else {
        Err(MacroRuntimeError::new(command_output_detail(&output)))
    }
}

fn require_command(command: &str) -> RuntimeResult<()> {
    if command_exists(command) {
        Ok(())
    } else {
        Err(MacroRuntimeError::new(format!(
            "{command} is not installed"
        )))
    }
}

fn is_linux_wayland() -> bool {
    cfg!(target_os = "linux")
        && (env::var("XDG_SESSION_TYPE")
            .map(|value| value.eq_ignore_ascii_case("wayland"))
            .unwrap_or(false)
            || env::var_os("WAYLAND_DISPLAY").is_some())
}

fn executable_candidate(directory: PathBuf, command: &str) -> PathBuf {
    let mut candidate = directory;
    candidate.push(command);
    candidate
}

fn run_command(command: &str, args: &[String], context: &str) -> RuntimeResult<()> {
    let output = Command::new(command).args(args).output()?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = [stderr, stdout]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    let detail = if detail.is_empty() {
        format!("exit code {}", output.status)
    } else {
        detail
    };

    Err(MacroRuntimeError::new(format!("{context}:\n{detail}")))
}

fn command_output_detail(output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = [stderr, stdout]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("\n");

    if detail.is_empty() {
        format!("exit code {}", output.status)
    } else {
        detail
    }
}

fn ydotool_key_code(key: &str) -> Option<u16> {
    if let Some(function_key) = key
        .strip_prefix('f')
        .and_then(|number| number.parse::<u8>().ok())
    {
        return linux_function_code(function_key);
    }

    Some(match key {
        "a" => 30,
        "b" => 48,
        "c" => 46,
        "d" => 32,
        "e" => 18,
        "f" => 33,
        "g" => 34,
        "h" => 35,
        "i" => 23,
        "j" => 36,
        "k" => 37,
        "l" => 38,
        "m" => 50,
        "n" => 49,
        "o" => 24,
        "p" => 25,
        "q" => 16,
        "r" => 19,
        "s" => 31,
        "t" => 20,
        "u" => 22,
        "v" => 47,
        "w" => 17,
        "x" => 45,
        "y" => 21,
        "z" => 44,
        "1" => 2,
        "2" => 3,
        "3" => 4,
        "4" => 5,
        "5" => 6,
        "6" => 7,
        "7" => 8,
        "8" => 9,
        "9" => 10,
        "0" => 11,
        "-" => 12,
        "=" => 13,
        "[" => 26,
        "]" => 27,
        "\\" => 43,
        ";" => 39,
        "'" => 40,
        "`" => 41,
        "," => 51,
        "." => 52,
        "/" => 53,
        "space" => 57,
        "enter" => 28,
        "tab" => 15,
        "esc" | "escape" => 1,
        "backspace" => 14,
        "delete" => 111,
        "up" => 103,
        "down" => 108,
        "left" => 105,
        "right" => 106,
        "shift" => 42,
        "ctrl" => 29,
        "alt" => 56,
        _ => return None,
    })
}

fn xdotool_key_name(key: &str) -> &str {
    match key {
        "f1" => "F1",
        "f2" => "F2",
        "f3" => "F3",
        "f4" => "F4",
        "f5" => "F5",
        "f6" => "F6",
        "f7" => "F7",
        "f8" => "F8",
        "f9" => "F9",
        "f10" => "F10",
        "f11" => "F11",
        "f12" => "F12",
        "f13" => "F13",
        "f14" => "F14",
        "f15" => "F15",
        "f16" => "F16",
        "f17" => "F17",
        "f18" => "F18",
        "f19" => "F19",
        "f20" => "F20",
        "f21" => "F21",
        "f22" => "F22",
        "f23" => "F23",
        "f24" => "F24",
        "-" => "minus",
        "=" => "equal",
        "[" => "bracketleft",
        "]" => "bracketright",
        "\\" => "backslash",
        ";" => "semicolon",
        "'" => "apostrophe",
        "`" => "grave",
        "," => "comma",
        "." => "period",
        "/" => "slash",
        "enter" => "Return",
        "tab" => "Tab",
        "esc" | "escape" => "Escape",
        "backspace" => "BackSpace",
        "delete" => "Delete",
        "up" => "Up",
        "down" => "Down",
        "left" => "Left",
        "right" => "Right",
        "shift" => "Shift_L",
        "ctrl" => "Control_L",
        "alt" => "Alt_L",
        other => other,
    }
}

fn ydotool_click_button(button: &str) -> Option<&'static str> {
    Some(match button {
        "left" => "0xC0",
        "right" => "0xC1",
        "middle" => "0xC2",
        "side" => "0xC3",
        "extra" => "0xC4",
        _ => return None,
    })
}

fn ydotool_button_down(button: &str) -> &str {
    match button {
        "0xC0" => "0x40",
        "0xC1" => "0x41",
        "0xC2" => "0x42",
        "0xC3" => "0x43",
        "0xC4" => "0x44",
        _ => button,
    }
}

fn ydotool_button_up(button: &str) -> &str {
    match button {
        "0xC0" => "0x80",
        "0xC1" => "0x81",
        "0xC2" => "0x82",
        "0xC3" => "0x83",
        "0xC4" => "0x84",
        _ => button,
    }
}

fn xdotool_click_button(button: &str) -> Option<&'static str> {
    Some(match button {
        "left" => "1",
        "middle" => "2",
        "right" => "3",
        "side" => "8",
        "extra" => "9",
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
