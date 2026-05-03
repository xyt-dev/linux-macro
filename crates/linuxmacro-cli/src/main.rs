use linuxmacro_core::{config, input, parser, runtime};
use std::{env, error::Error, fs::File, process::ExitCode};

type CliResult<T> = Result<T, Box<dyn Error>>;

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("error: {error}");
            ExitCode::from(2)
        }
    }
}

fn run() -> CliResult<()> {
    let command = env::args().nth(1).unwrap_or_else(|| "run".to_string());

    match command.as_str() {
        "run" => run_default_config(),
        "check" => check_default_config(),
        "path" | "config-path" => print_config_path(),
        "init" => init_config(),
        "list-inputs" => list_inputs(),
        "-h" | "--help" | "help" => {
            print_help();
            Ok(())
        }
        other => Err(format!("unknown command {other:?}; run `linuxmacro help`").into()),
    }
}

fn run_default_config() -> CliResult<()> {
    let path = config::ensure_config_file()?;
    let program = parser::parse_macro_file(&path)?;
    println!("LinuxMacro config: {}", path.display());
    println!("Macro: {}", program.name);
    println!(
        "Status: {}",
        if program.start_running {
            "running"
        } else {
            "paused"
        }
    );
    println!("Toggle: {}", program.toggle_buttons.join(", "));
    println!("Press Ctrl+C to stop the process.");
    runtime::run_program(program)?;
    Ok(())
}

fn check_default_config() -> CliResult<()> {
    let path = config::ensure_config_file()?;
    let program = parser::parse_macro_file(&path)?;
    println!("OK: {}", path.display());
    println!("Macro: {}", program.name);
    println!("Enabled: {}", program.enabled);
    println!("Backend: {}", program.backend);
    println!("Tasks: {}", program.tasks.len());
    for task in &program.tasks {
        println!("  - {}", task.description);
    }
    Ok(())
}

fn print_config_path() -> CliResult<()> {
    println!("{}", config::config_file_path()?.display());
    Ok(())
}

fn init_config() -> CliResult<()> {
    let path = config::config_file_path()?;
    let existed = path.exists();
    let path = config::ensure_config_file()?;
    if existed {
        println!("Config already exists: {}", path.display());
    } else {
        println!("Created config: {}", path.display());
    }
    Ok(())
}

fn list_inputs() -> CliResult<()> {
    println!("Input devices:");
    for path in input::input_event_paths() {
        let readable = File::open(&path).is_ok();
        let state = if readable { "readable" } else { "unreadable" };
        let name = input::event_device_name(&path).unwrap_or_else(|| "unknown".to_string());
        println!("  {}: {name} ({state})", path.display());
    }
    Ok(())
}

fn print_help() {
    println!(
        r#"linuxmacro - Linux keyboard macro runner

Usage:
  linuxmacro run          Run ~/.config/linuxmacro/config.macro
  linuxmacro check        Validate and summarize the config
  linuxmacro init         Create the default config if missing
  linuxmacro path         Print the config path
  linuxmacro list-inputs  List Linux /dev/input event devices

The macro file is always read from ~/.config/linuxmacro/config.macro.
"#
    );
}
