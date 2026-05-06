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
    println!("Backend: {}", program.backend);
    println!(
        "Enabled macros: {} / {}",
        program
            .macros
            .iter()
            .filter(|macro_spec| macro_spec.enabled)
            .count(),
        program.macros.len()
    );
    for macro_spec in &program.macros {
        println!(
            "  - {} [{}] start={} trigger={}",
            macro_spec.name,
            if macro_spec.enabled {
                "enabled"
            } else {
                "disabled"
            },
            if macro_spec.start_running {
                "running"
            } else {
                "paused"
            },
            macro_spec.trigger_buttons.join(", ")
        );
    }
    println!("Press Ctrl+C to stop the process.");
    runtime::run_program(program)?;
    Ok(())
}

fn check_default_config() -> CliResult<()> {
    let path = config::ensure_config_file()?;
    let program = parser::parse_macro_file(&path)?;
    println!("OK: {}", path.display());
    println!("Backend: {}", program.backend);
    println!("Macros: {}", program.macros.len());
    for macro_spec in &program.macros {
        println!(
            "  - {} [{}] trigger={}",
            macro_spec.name,
            if macro_spec.enabled {
                "enabled"
            } else {
                "disabled"
            },
            macro_spec.trigger_buttons.join(", ")
        );
        println!("    Tasks: {}", macro_spec.tasks.len());
        for task in &macro_spec.tasks {
            println!("      - {}", task.description);
        }
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
