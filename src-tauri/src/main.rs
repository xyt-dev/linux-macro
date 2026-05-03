#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use linuxmacro_core::{
    ValidationReport,
    backend::{self, BackendHealth},
    config, parser,
    runtime::{self, ProgramHandle},
};
use serde::Serialize;
use std::sync::Mutex;

#[derive(Default)]
struct AppState {
    runner: Mutex<Option<ProgramHandle>>,
}

#[derive(Debug, Serialize)]
struct ConfigPayload {
    path: String,
    content: String,
    validation: ValidationReport,
}

#[derive(Debug, Serialize)]
struct MacroStatus {
    active: bool,
    running: bool,
    stopped: bool,
    last_event: String,
    name: Option<String>,
    enabled: bool,
    backend: Option<String>,
    task_count: usize,
}

#[tauri::command]
fn load_config() -> Result<ConfigPayload, String> {
    let (path, content) = config::read_config().map_err(|error| error.to_string())?;
    Ok(payload(path.display().to_string(), content))
}

#[tauri::command]
fn save_config(content: String) -> Result<ConfigPayload, String> {
    parser::parse_macro_str(&content).map_err(|error| error.to_string())?;
    let path = config::write_config(&content).map_err(|error| error.to_string())?;
    Ok(payload(path.display().to_string(), content))
}

#[tauri::command]
fn validate_macro(content: String) -> ValidationReport {
    parser::validate_content(&content)
}

#[tauri::command]
fn config_path() -> Result<String, String> {
    config::config_file_path()
        .map(|path| path.display().to_string())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn start_macro(state: tauri::State<'_, AppState>) -> Result<MacroStatus, String> {
    replace_macro(&state)
}

#[tauri::command]
fn reload_macro(state: tauri::State<'_, AppState>) -> Result<MacroStatus, String> {
    replace_macro(&state)
}

#[tauri::command]
fn pause_macro(state: tauri::State<'_, AppState>) -> Result<MacroStatus, String> {
    let runner = state
        .runner
        .lock()
        .map_err(|_| "macro state lock poisoned".to_string())?;
    if let Some(runner) = runner.as_ref() {
        runner.set_running(false, "desktop pause");
    }
    Ok(status_from_runner(runner.as_ref()))
}

#[tauri::command]
fn resume_macro(state: tauri::State<'_, AppState>) -> Result<MacroStatus, String> {
    let runner = state
        .runner
        .lock()
        .map_err(|_| "macro state lock poisoned".to_string())?;
    if let Some(runner) = runner.as_ref() {
        runner.set_running(true, "desktop resume");
    }
    Ok(status_from_runner(runner.as_ref()))
}

#[tauri::command]
fn toggle_macro(state: tauri::State<'_, AppState>) -> Result<MacroStatus, String> {
    let runner = state
        .runner
        .lock()
        .map_err(|_| "macro state lock poisoned".to_string())?;
    if let Some(runner) = runner.as_ref() {
        runner.toggle("desktop toggle");
    }
    Ok(status_from_runner(runner.as_ref()))
}

#[tauri::command]
fn stop_macro(state: tauri::State<'_, AppState>) -> Result<MacroStatus, String> {
    let mut runner = state
        .runner
        .lock()
        .map_err(|_| "macro state lock poisoned".to_string())?;
    if let Some(mut active_runner) = runner.take() {
        active_runner.stop("stopped from desktop app");
        active_runner.join();
    }
    Ok(status_from_runner(None))
}

#[tauri::command]
fn macro_status(state: tauri::State<'_, AppState>) -> Result<MacroStatus, String> {
    let runner = state
        .runner
        .lock()
        .map_err(|_| "macro state lock poisoned".to_string())?;
    Ok(status_from_runner(runner.as_ref()))
}

#[tauri::command]
fn backend_health() -> BackendHealth {
    backend::backend_health()
}

#[tauri::command]
async fn install_ydotool() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        backend::install_ydotool().map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("installer task failed: {error}"))?
}

fn payload(path: String, content: String) -> ConfigPayload {
    let validation = parser::validate_content(&content);
    ConfigPayload {
        path,
        content,
        validation,
    }
}

fn replace_macro(state: &tauri::State<'_, AppState>) -> Result<MacroStatus, String> {
    let path = config::ensure_config_file().map_err(|error| error.to_string())?;
    let program = parser::parse_macro_file(&path).map_err(|error| error.to_string())?;
    let new_runner = runtime::spawn_program(program).map_err(|error| error.to_string())?;

    let mut runner = state
        .runner
        .lock()
        .map_err(|_| "macro state lock poisoned".to_string())?;
    if let Some(mut old_runner) = runner.take() {
        old_runner.stop("reloaded from desktop app");
        old_runner.join();
    }

    *runner = Some(new_runner);
    Ok(status_from_runner(runner.as_ref()))
}

fn status_from_runner(runner: Option<&ProgramHandle>) -> MacroStatus {
    if let Some(runner) = runner {
        let snapshot = runner.snapshot();
        MacroStatus {
            active: true,
            running: snapshot.running,
            stopped: snapshot.stopped,
            last_event: snapshot.last_event,
            name: Some(runner.program().name.clone()),
            enabled: runner.program().enabled,
            backend: Some(runner.program().backend.clone()),
            task_count: runner.program().tasks.len(),
        }
    } else {
        MacroStatus {
            active: false,
            running: false,
            stopped: true,
            last_event: "not running".to_string(),
            name: None,
            enabled: true,
            backend: None,
            task_count: 0,
        }
    }
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            validate_macro,
            config_path,
            start_macro,
            reload_macro,
            pause_macro,
            resume_macro,
            toggle_macro,
            stop_macro,
            macro_status,
            backend_health,
            install_ydotool
        ])
        .run(tauri::generate_context!())
        .expect("failed to run LinuxMacro editor");
}
