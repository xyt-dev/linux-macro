use crate::{
    MacroProgram, MacroSpec, MacroStep, MacroTaskSpec,
    backend::{
        KeyBackend, MacroRuntimeError, MouseButtonBackend, RuntimeResult, choose_backend,
        create_backend, create_mouse_button_backend,
    },
    input,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

#[derive(Clone)]
pub struct RuntimeState {
    inner: Arc<RuntimeStateInner>,
}

struct RuntimeStateInner {
    running: AtomicBool,
    stopped: AtomicBool,
    last_event: Mutex<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct RuntimeSnapshot {
    pub running: bool,
    pub stopped: bool,
    pub last_event: String,
}

pub struct ProgramHandle {
    program: MacroProgram,
    workers: Vec<MacroWorker>,
}

struct MacroWorker {
    name: String,
    state: RuntimeState,
    worker: Option<JoinHandle<()>>,
}

struct ScheduledTask {
    spec: MacroTaskSpec,
    backends: HashMap<String, KeyBackend>,
    mouse_backends: HashMap<String, MouseButtonBackend>,
    next_time: Instant,
}

impl RuntimeState {
    pub fn new(running: bool) -> Self {
        Self {
            inner: Arc::new(RuntimeStateInner {
                running: AtomicBool::new(running),
                stopped: AtomicBool::new(false),
                last_event: Mutex::new(if running {
                    "started running".to_string()
                } else {
                    "started paused".to_string()
                }),
            }),
        }
    }

    pub fn is_running(&self) -> bool {
        self.inner.running.load(Ordering::SeqCst)
    }

    pub fn is_stopped(&self) -> bool {
        self.inner.stopped.load(Ordering::SeqCst)
    }

    pub fn set_message(&self, message: impl Into<String>) {
        *self
            .inner
            .last_event
            .lock()
            .expect("last_event mutex poisoned") = message.into();
    }

    pub fn toggle(&self, reason: &str) -> bool {
        let running = !self.inner.running.fetch_xor(true, Ordering::SeqCst);
        let state = if running { "running" } else { "paused" };
        self.set_message(format!("{state} by {reason}"));
        running
    }

    pub fn set_running(&self, running: bool, reason: &str) {
        self.inner.running.store(running, Ordering::SeqCst);
        let state = if running { "running" } else { "paused" };
        self.set_message(format!("{state} by {reason}"));
    }

    pub fn stop(&self, reason: impl Into<String>) {
        self.set_message(reason);
        self.inner.stopped.store(true, Ordering::SeqCst);
    }

    pub fn snapshot(&self) -> RuntimeSnapshot {
        RuntimeSnapshot {
            running: self.is_running(),
            stopped: self.is_stopped(),
            last_event: self
                .inner
                .last_event
                .lock()
                .expect("last_event mutex poisoned")
                .clone(),
        }
    }
}

pub fn run_program(program: MacroProgram) -> RuntimeResult<()> {
    let mut handle = spawn_program(program)?;
    while !handle.is_stopped() {
        thread::sleep(Duration::from_millis(100));
    }
    handle.join();
    Ok(())
}

pub fn spawn_program(mut program: MacroProgram) -> RuntimeResult<ProgramHandle> {
    let enabled_macros = program
        .macros
        .iter()
        .filter(|macro_spec| macro_spec.enabled)
        .collect::<Vec<_>>();
    if enabled_macros.is_empty() {
        return Err(MacroRuntimeError::new(
            "no enabled macros; enable at least one macro in the graphical editor before starting",
        ));
    }

    let backend_name = choose_backend(&program.backend)?;
    program.backend = backend_name.clone();
    let mut prepared = Vec::with_capacity(enabled_macros.len());
    for macro_spec in enabled_macros {
        let tasks = build_tasks(&backend_name, &macro_spec.tasks)?;
        prepared.push((macro_spec.clone(), tasks));
    }

    let mut workers: Vec<MacroWorker> = Vec::with_capacity(prepared.len());
    let mut bindings = Vec::with_capacity(prepared.len());
    for (index, (macro_spec, tasks)) in prepared.into_iter().enumerate() {
        let state = RuntimeState::new(macro_spec.start_running);
        bindings.push(input::ToggleBinding {
            macro_name: macro_spec.name.clone(),
            trigger_names: macro_spec.trigger_buttons.clone(),
            state: state.clone(),
        });

        let worker_state = state.clone();
        let worker_name = thread_name(&macro_spec, index);
        let worker = match thread::Builder::new().name(worker_name).spawn(move || {
            if let Err(error) = run_program_schedule(tasks, &worker_state) {
                worker_state.stop(format!("runtime error: {error}"));
            }
        }) {
            Ok(worker) => worker,
            Err(error) => {
                for worker in &workers {
                    worker.state.stop("failed to start all macro workers");
                }
                return Err(MacroRuntimeError::from(error));
            }
        };

        workers.push(MacroWorker {
            name: macro_spec.name,
            state,
            worker: Some(worker),
        });
    }

    input::start_toggle_listener(bindings);

    Ok(ProgramHandle { program, workers })
}

impl ProgramHandle {
    pub fn program(&self) -> &MacroProgram {
        &self.program
    }

    pub fn is_stopped(&self) -> bool {
        self.workers.iter().all(|worker| worker.state.is_stopped())
    }

    pub fn snapshot(&self) -> RuntimeSnapshot {
        let snapshots = self
            .workers
            .iter()
            .map(|worker| (worker.name.as_str(), worker.state.snapshot()))
            .collect::<Vec<_>>();

        RuntimeSnapshot {
            running: snapshots.iter().any(|(_, snapshot)| snapshot.running),
            stopped: snapshots.is_empty() || snapshots.iter().all(|(_, snapshot)| snapshot.stopped),
            last_event: snapshots
                .iter()
                .map(|(name, snapshot)| format!("{name}: {}", snapshot.last_event))
                .collect::<Vec<_>>()
                .join("; "),
        }
    }

    pub fn set_running(&self, running: bool, reason: &str) {
        for worker in &self.workers {
            worker.state.set_running(running, reason);
        }
    }

    pub fn toggle(&self, reason: &str) -> bool {
        let running = !self.workers.iter().any(|worker| worker.state.is_running());
        self.set_running(running, reason);
        running
    }

    pub fn stop(&self, reason: impl Into<String>) {
        let reason = reason.into();
        for worker in &self.workers {
            worker.state.stop(reason.clone());
        }
    }

    pub fn join(&mut self) {
        for worker in &mut self.workers {
            if let Some(handle) = worker.worker.take() {
                let _ = handle.join();
            }
        }
    }
}

impl Drop for ProgramHandle {
    fn drop(&mut self) {
        self.stop("desktop app stopped macro");
        self.join();
    }
}

fn thread_name(macro_spec: &MacroSpec, index: usize) -> String {
    let suffix = macro_spec
        .name
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || *character == '-' || *character == '_'
        })
        .take(24)
        .collect::<String>();
    if suffix.is_empty() {
        format!("linuxmacro-scheduler-{index}")
    } else {
        format!("linuxmacro-scheduler-{index}-{suffix}")
    }
}

fn build_tasks(
    backend_name: &str,
    task_specs: &[MacroTaskSpec],
) -> RuntimeResult<Vec<ScheduledTask>> {
    let now = Instant::now();
    let mut tasks = Vec::with_capacity(task_specs.len());

    for spec in task_specs {
        let keys = spec
            .steps
            .iter()
            .filter_map(|step| match step {
                MacroStep::Press { key } => Some(key.clone()),
                MacroStep::HoldKey { key, .. } => Some(key.clone()),
                MacroStep::Click { .. } | MacroStep::HoldClick { .. } | MacroStep::Wait { .. } => {
                    None
                }
            })
            .collect::<HashSet<_>>();
        let mouse_buttons = spec
            .steps
            .iter()
            .filter_map(|step| match step {
                MacroStep::Click { button } => Some(button.clone()),
                MacroStep::HoldClick { button, .. } => Some(button.clone()),
                MacroStep::Wait { .. } | MacroStep::Press { .. } | MacroStep::HoldKey { .. } => {
                    None
                }
            })
            .collect::<HashSet<_>>();

        let mut backends = HashMap::with_capacity(keys.len());
        for key in keys {
            backends.insert(key.clone(), create_backend(backend_name, &key)?);
        }
        let mut mouse_backends = HashMap::with_capacity(mouse_buttons.len());
        for button in mouse_buttons {
            mouse_backends.insert(
                button.clone(),
                create_mouse_button_backend(backend_name, &button)?,
            );
        }

        tasks.push(ScheduledTask {
            spec: spec.clone(),
            backends,
            mouse_backends,
            next_time: now,
        });
    }

    Ok(tasks)
}

fn run_program_schedule(mut tasks: Vec<ScheduledTask>, state: &RuntimeState) -> RuntimeResult<()> {
    if tasks.is_empty() {
        return Err(MacroRuntimeError::new("no macro tasks to run"));
    }

    let mut was_running = false;
    while !state.is_stopped() {
        if !state.is_running() {
            was_running = false;
            thread::sleep(Duration::from_millis(50));
            continue;
        }

        let now = Instant::now();
        if !was_running {
            for task in &mut tasks {
                task.next_time = now;
            }
            was_running = true;
        }

        for task in &mut tasks {
            if now >= task.next_time {
                run_task(task, state)?;
                let after_run = Instant::now();
                let interval = seconds_to_duration(task.spec.interval);
                task.next_time += interval;
                if task.next_time <= after_run {
                    task.next_time = after_run + interval;
                }
            }
        }

        let sleep_for = tasks
            .iter()
            .map(|task| task.next_time)
            .min()
            .map(|next_time| next_time.saturating_duration_since(Instant::now()))
            .unwrap_or_else(|| Duration::from_millis(50));

        if !sleep_for.is_zero() {
            thread::sleep(sleep_for.min(Duration::from_millis(50)));
        }
    }

    Ok(())
}

fn run_task(task: &ScheduledTask, state: &RuntimeState) -> RuntimeResult<()> {
    for step in &task.spec.steps {
        if state.is_stopped() || !state.is_running() {
            return Ok(());
        }

        match step {
            MacroStep::Press { key } => {
                let backend = task.backends.get(key).ok_or_else(|| {
                    MacroRuntimeError::new(format!("missing backend for key {key:?}"))
                })?;
                backend.press_once()?;
            }
            MacroStep::Click { button } => {
                let backend = task.mouse_backends.get(button).ok_or_else(|| {
                    MacroRuntimeError::new(format!("missing backend for mouse button {button:?}"))
                })?;
                backend.click_once()?;
            }
            MacroStep::HoldKey { key, seconds } => {
                let backend = task.backends.get(key).ok_or_else(|| {
                    MacroRuntimeError::new(format!("missing backend for key {key:?}"))
                })?;
                hold_key(backend, seconds_to_duration(*seconds), state)?;
            }
            MacroStep::HoldClick { button, seconds } => {
                let backend = task.mouse_backends.get(button).ok_or_else(|| {
                    MacroRuntimeError::new(format!("missing backend for mouse button {button:?}"))
                })?;
                hold_mouse_button(backend, seconds_to_duration(*seconds), state)?;
            }
            MacroStep::Wait { seconds } => {
                if !interruptible_sleep(seconds_to_duration(*seconds), state) {
                    return Ok(());
                }
            }
        }
    }

    Ok(())
}

fn hold_key(backend: &KeyBackend, duration: Duration, state: &RuntimeState) -> RuntimeResult<()> {
    backend.key_down()?;
    let completed = interruptible_sleep(duration, state);
    let release_result = backend.key_up();
    release_result?;
    if !completed {
        return Ok(());
    }
    Ok(())
}

fn hold_mouse_button(
    backend: &MouseButtonBackend,
    duration: Duration,
    state: &RuntimeState,
) -> RuntimeResult<()> {
    backend.button_down()?;
    let completed = interruptible_sleep(duration, state);
    let release_result = backend.button_up();
    release_result?;
    if !completed {
        return Ok(());
    }
    Ok(())
}

fn interruptible_sleep(duration: Duration, state: &RuntimeState) -> bool {
    let deadline = Instant::now() + duration;
    while !state.is_stopped() {
        if !state.is_running() {
            return false;
        }

        let now = Instant::now();
        if now >= deadline {
            return true;
        }

        thread::sleep((deadline - now).min(Duration::from_millis(50)));
    }

    false
}

fn seconds_to_duration(seconds: f64) -> Duration {
    Duration::from_secs_f64(seconds.max(0.001))
}
