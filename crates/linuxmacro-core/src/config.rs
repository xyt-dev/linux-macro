use std::{
    env, fs, io,
    path::{Path, PathBuf},
};

pub const APP_DIR_NAME: &str = "linuxmacro";
pub const LEGACY_APP_DIR_NAME: &str = "mousemacro";
pub const CONFIG_FILE_NAME: &str = "config.macro";

pub const DEFAULT_CONFIG: &str = r#"# LinuxMacro configuration
# This file is edited live by the Tauri UI.

backend auto

macro "Left clicker" {
  description Toggle left click every 50ms with the side button.
  enabled on
  trigger side
  every 50ms click left
}

macro "R burst" {
  description Toggle r every 100ms with the extra button.
  enabled off
  trigger extra
  every 100ms press r
}

# Sequence example:
#
# macro "R then A" {
#   enabled off
#   trigger browserforward
#   sequence 3s {
#     press r
#     wait 200ms
#     press a
#   }
# }
"#;

pub fn config_dir() -> io::Result<PathBuf> {
    Ok(config_base_dir()?.join(APP_DIR_NAME))
}

pub fn legacy_config_file_path() -> io::Result<PathBuf> {
    Ok(config_base_dir()?
        .join(LEGACY_APP_DIR_NAME)
        .join(CONFIG_FILE_NAME))
}

fn config_base_dir() -> io::Result<PathBuf> {
    let home = env::var_os("HOME").ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            "HOME is not set; cannot resolve ~/.config/linuxmacro",
        )
    })?;

    Ok(PathBuf::from(home).join(".config"))
}

pub fn config_file_path() -> io::Result<PathBuf> {
    Ok(config_dir()?.join(CONFIG_FILE_NAME))
}

pub fn ensure_config_file() -> io::Result<PathBuf> {
    let path = config_file_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    if !path.exists() {
        let legacy_path = legacy_config_file_path()?;
        if legacy_path.exists() {
            fs::copy(legacy_path, &path)?;
        } else {
            fs::write(&path, DEFAULT_CONFIG)?;
        }
    }
    Ok(path)
}

pub fn read_config() -> io::Result<(PathBuf, String)> {
    let path = ensure_config_file()?;
    let content = fs::read_to_string(&path)?;
    Ok((path, content))
}

pub fn write_config(content: &str) -> io::Result<PathBuf> {
    let path = config_file_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    atomic_write(&path, content)?;
    Ok(path)
}

fn atomic_write(path: &Path, content: &str) -> io::Result<()> {
    let mut temporary = path.to_path_buf();
    temporary.set_extension("macro.tmp");
    fs::write(&temporary, content)?;
    fs::rename(&temporary, path)?;
    Ok(())
}
