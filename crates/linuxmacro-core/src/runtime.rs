use crate::{
    MacroProgram, MacroStep, MacroTaskSpec,
    backend::{KeyBackend, MacroRuntimeError, RuntimeResult, choose_backend, create_backend},
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
    state: RuntimeState,
    worker: Option<JoinHandle<()>>,
}

struct ScheduledTask {
    spec: MacroTaskSpec,
    backends: HashMap<String, KeyBackend>,
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
    while !handle.state().is_stopped() {
        thread::sleep(Duration::from_millis(100));
    }
    handle.join();
    Ok(())
}

pub fn spawn_program(mut program: MacroProgram) -> RuntimeResult<ProgramHandle> {
    if !program.enabled {
        return Err(MacroRuntimeError::new(
            "macro is disabled; enable it in the graphical editor before starting",
        ));
    }

    let backend_name = choose_backend(&program.backend)?;
    program.backend = backend_name.clone();
    let tasks = build_tasks(&backend_name, &program.tasks)?;
    let state = RuntimeState::new(program.start_running);

    input::start_toggle_listener(&program, &state);
    let worker_state = state.clone();
    let worker = thread::Builder::new()
        .name("linuxmacro-scheduler".to_string())
        .spawn(move || {
            if let Err(error) = run_program_schedule(tasks, &worker_state) {
                worker_state.stop(format!("runtime error: {error}"));
            }
        })
        .map_err(MacroRuntimeError::from)?;

    Ok(ProgramHandle {
        program,
        state,
        worker: Some(worker),
    })
}

impl ProgramHandle {
    pub fn program(&self) -> &MacroProgram {
        &self.program
    }

    pub fn state(&self) -> &RuntimeState {
        &self.state
    }

    pub fn snapshot(&self) -> RuntimeSnapshot {
        self.state.snapshot()
    }

    pub fn set_running(&self, running: bool, reason: &str) {
        self.state.set_running(running, reason);
    }

    pub fn toggle(&self, reason: &str) -> bool {
        self.state.toggle(reason)
    }

    pub fn stop(&self, reason: impl Into<String>) {
        self.state.stop(reason);
    }

    pub fn join(&mut self) {
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl Drop for ProgramHandle {
    fn drop(&mut self) {
        self.state.stop("desktop app stopped macro");
        self.join();
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
                MacroStep::Wait { .. } => None,
            })
            .collect::<HashSet<_>>();

        let mut backends = HashMap::with_capacity(keys.len());
        for key in keys {
            backends.insert(key.clone(), create_backend(backend_name, &key)?);
        }

        tasks.push(ScheduledTask {
            spec: spec.clone(),
            backends,
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
            MacroStep::Wait { seconds } => {
                if !interruptible_sleep(seconds_to_duration(*seconds), state) {
                    return Ok(());
                }
            }
        }
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
