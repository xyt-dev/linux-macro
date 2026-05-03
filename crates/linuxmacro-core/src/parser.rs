use serde::{Deserialize, Serialize};
use std::{error::Error, fmt, fs, path::Path};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MacroParseError {
    pub message: String,
}

impl MacroParseError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for MacroParseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for MacroParseError {}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MacroProgram {
    pub name: String,
    pub description: String,
    pub enabled: bool,
    pub backend: String,
    pub toggle_buttons: Vec<String>,
    pub grab_toggle_device: bool,
    pub start_running: bool,
    pub tasks: Vec<MacroTaskSpec>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MacroTaskSpec {
    pub interval: f64,
    pub steps: Vec<MacroStep>,
    pub description: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum MacroStep {
    Press { key: String },
    Wait { seconds: f64 },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ValidationReport {
    pub ok: bool,
    pub error: Option<String>,
    pub program: Option<MacroProgram>,
    pub task_count: usize,
    pub line_count: usize,
}

const SPECIAL_KEY_NAMES: &[(&str, &str)] = &[
    ("space", "space"),
    ("enter", "enter"),
    ("tab", "tab"),
    ("esc", "esc"),
    ("escape", "esc"),
    ("backspace", "backspace"),
    ("delete", "delete"),
    ("up", "up"),
    ("down", "down"),
    ("left", "left"),
    ("right", "right"),
    ("shift", "shift"),
    ("ctrl", "ctrl"),
    ("alt", "alt"),
];

pub fn validate_content(content: &str) -> ValidationReport {
    match parse_macro_str(content) {
        Ok(program) => ValidationReport {
            ok: true,
            error: None,
            task_count: program.tasks.len(),
            line_count: content.lines().count(),
            program: Some(program),
        },
        Err(error) => ValidationReport {
            ok: false,
            error: Some(error.to_string()),
            program: None,
            task_count: 0,
            line_count: content.lines().count(),
        },
    }
}

pub fn parse_macro_file(path: &Path) -> Result<MacroProgram, MacroParseError> {
    let content = fs::read_to_string(path).map_err(|error| {
        MacroParseError::new(format!("{}: failed to read file: {error}", path.display()))
    })?;
    let default_name = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("macro");
    parse_macro_str_named(&content, default_name, &path.display().to_string())
}

pub fn parse_macro_str(content: &str) -> Result<MacroProgram, MacroParseError> {
    parse_macro_str_named(content, "config", "config")
}

pub fn parse_macro_str_named(
    content: &str,
    default_name: &str,
    display_name: &str,
) -> Result<MacroProgram, MacroParseError> {
    let mut name = default_name.to_string();
    let mut description = String::new();
    let mut enabled = true;
    let mut backend = "auto".to_string();
    let mut toggle_buttons = vec![
        "BTN_SIDE".to_string(),
        "BTN_EXTRA".to_string(),
        "KEY_SPACE".to_string(),
        "KEY_BACK".to_string(),
        "KEY_FORWARD".to_string(),
    ];
    let mut grab_toggle_device = false;
    let mut start_running = false;
    let mut tasks = Vec::new();

    let raw_lines: Vec<&str> = content.lines().collect();
    let mut line_index = 0;
    while line_index < raw_lines.len() {
        let line_number = line_index + 1;
        let line = strip_comment(raw_lines[line_index]);
        line_index += 1;
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        let command = parts[0].to_ascii_lowercase();
        let result = match command.as_str() {
            "name" => {
                name = line[parts[0].len()..].trim().to_string();
                if name.is_empty() {
                    name = default_name.to_string();
                }
                Ok(())
            }
            "description" => {
                description = line[parts[0].len()..].trim().to_string();
                Ok(())
            }
            "enabled" if parts.len() == 2 => {
                enabled = parse_bool(parts[1], "enabled")?;
                Ok(())
            }
            "backend" if parts.len() == 2 => {
                if !matches!(parts[1], "auto" | "ydotool" | "xdotool" | "pynput") {
                    Err(MacroParseError::new(
                        "backend must be auto, ydotool, xdotool, or pynput",
                    ))
                } else {
                    backend = parts[1].to_string();
                    Ok(())
                }
            }
            "toggle" if parts.len() >= 2 => {
                toggle_buttons = parse_toggle_names(&parts[1..])?;
                Ok(())
            }
            "grab" if parts.len() == 2 => {
                grab_toggle_device = matches!(
                    parts[1].to_ascii_lowercase().as_str(),
                    "on" | "true" | "yes" | "1"
                );
                Ok(())
            }
            "start" if parts.len() == 2 => {
                let state = parts[1].to_ascii_lowercase();
                if !matches!(state.as_str(), "paused" | "running") {
                    Err(MacroParseError::new("start must be paused or running"))
                } else {
                    start_running = state == "running";
                    Ok(())
                }
            }
            "every" => {
                tasks.push(parse_every_line(&parts)?);
                Ok(())
            }
            "sequence" => {
                let (task, next_index) =
                    parse_sequence(&raw_lines, line_index, &parts, line_number)?;
                tasks.push(task);
                line_index = next_index;
                Ok(())
            }
            _ => Err(MacroParseError::new(format!("unknown statement {line:?}"))),
        };

        if let Err(error) = result {
            return Err(MacroParseError::new(format!(
                "{display_name}:{line_number}: {error}"
            )));
        }
    }

    if tasks.is_empty() {
        return Err(MacroParseError::new(format!(
            "{display_name}: no macro tasks found"
        )));
    }

    if description.is_empty() {
        description = tasks
            .iter()
            .map(|task| task.description.as_str())
            .collect::<Vec<_>>()
            .join("; ");
    }

    Ok(MacroProgram {
        name,
        description,
        enabled,
        backend,
        toggle_buttons,
        grab_toggle_device,
        start_running,
        tasks,
    })
}

fn parse_bool(value: &str, name: &str) -> Result<bool, MacroParseError> {
    match value.to_ascii_lowercase().as_str() {
        "on" | "true" | "yes" | "1" => Ok(true),
        "off" | "false" | "no" | "0" => Ok(false),
        _ => Err(MacroParseError::new(format!(
            "{name} must be on/off, true/false, yes/no, or 1/0"
        ))),
    }
}

pub fn parse_key(value: &str) -> Result<String, MacroParseError> {
    let normalized = value.to_ascii_lowercase();
    if let Some((_, canonical)) = SPECIAL_KEY_NAMES
        .iter()
        .find(|(name, _)| *name == normalized.as_str())
    {
        return Ok((*canonical).to_string());
    }

    if value.chars().count() == 1 {
        return Ok(normalized);
    }

    Err(MacroParseError::new(format!(
        "unsupported key {value:?}; use one character or one of: {}",
        SPECIAL_KEY_NAMES
            .iter()
            .map(|(name, _)| *name)
            .collect::<Vec<_>>()
            .join(", ")
    )))
}

pub fn parse_duration(value: &str) -> Result<f64, MacroParseError> {
    let mut text = value.trim().to_ascii_lowercase();
    let multiplier = if text.ends_with("ms") {
        text.truncate(text.len() - 2);
        0.001
    } else if text.ends_with('s') {
        text.truncate(text.len() - 1);
        1.0
    } else {
        1.0
    };

    let duration = text
        .parse::<f64>()
        .map_err(|_| MacroParseError::new(format!("invalid duration {value:?}")))?
        * multiplier;

    if duration <= 0.0 {
        return Err(MacroParseError::new("duration must be greater than 0"));
    }
    Ok(duration)
}

pub fn parse_toggle_names(values: &[&str]) -> Result<Vec<String>, MacroParseError> {
    let mut names = Vec::new();
    for value in values {
        for token in value.split(',') {
            let token = token.trim();
            if !token.is_empty() {
                names.push(normalize_evdev_trigger(token));
            }
        }
    }
    if names.is_empty() {
        return Err(MacroParseError::new(
            "toggle needs at least one key or button",
        ));
    }
    Ok(names)
}

pub fn normalize_evdev_trigger(value: &str) -> String {
    let stripped = value.trim();
    let lower = stripped.to_ascii_lowercase();
    match lower.as_str() {
        "side" | "mouse4" | "back" => "BTN_SIDE".to_string(),
        "extra" | "mouse5" | "forward" => "BTN_EXTRA".to_string(),
        "browserback" => "KEY_BACK".to_string(),
        "browserforward" => "KEY_FORWARD".to_string(),
        "space" => "KEY_SPACE".to_string(),
        "enter" => "KEY_ENTER".to_string(),
        "tab" => "KEY_TAB".to_string(),
        "esc" | "escape" => "KEY_ESC".to_string(),
        _ if lower.len() == 1
            && lower
                .chars()
                .all(|character| character.is_ascii_alphabetic()) =>
        {
            format!("KEY_{}", lower.to_ascii_uppercase())
        }
        _ if lower.len() == 1 && lower.chars().all(|character| character.is_ascii_digit()) => {
            format!("KEY_{lower}")
        }
        _ => stripped.to_ascii_uppercase(),
    }
}

fn parse_every_line(parts: &[&str]) -> Result<MacroTaskSpec, MacroParseError> {
    if parts.len() != 4 || !parts[2].eq_ignore_ascii_case("press") {
        return Err(MacroParseError::new("use: every <duration> press <key>"));
    }
    let interval = parse_duration(parts[1])?;
    let key = parse_key(parts[3])?;
    Ok(MacroTaskSpec {
        interval,
        steps: vec![MacroStep::Press { key: key.clone() }],
        description: format!("press {key} every {}s", format_seconds(interval)),
    })
}

fn parse_sequence(
    raw_lines: &[&str],
    mut line_index: usize,
    parts: &[&str],
    sequence_line_number: usize,
) -> Result<(MacroTaskSpec, usize), MacroParseError> {
    if parts.len() != 3 || parts[2] != "{" {
        return Err(MacroParseError::new("use: sequence <duration> {"));
    }

    let interval = parse_duration(parts[1])?;
    let mut steps = Vec::new();

    while line_index < raw_lines.len() {
        let current_number = line_index + 1;
        let line = strip_comment(raw_lines[line_index]);
        line_index += 1;
        if line.is_empty() {
            continue;
        }
        if line == "}" {
            if steps.is_empty() {
                return Err(MacroParseError::new(format!(
                    "line {sequence_line_number}: sequence cannot be empty"
                )));
            }
            let description = describe_sequence(interval, &steps);
            return Ok((
                MacroTaskSpec {
                    interval,
                    steps,
                    description,
                },
                line_index,
            ));
        }

        let step_parts: Vec<&str> = line.split_whitespace().collect();
        let step = if step_parts.len() == 2 && step_parts[0].eq_ignore_ascii_case("press") {
            MacroStep::Press {
                key: parse_key(step_parts[1]).map_err(|error| {
                    MacroParseError::new(format!("line {current_number}: {error}"))
                })?,
            }
        } else if step_parts.len() == 2 && step_parts[0].eq_ignore_ascii_case("wait") {
            MacroStep::Wait {
                seconds: parse_duration(step_parts[1]).map_err(|error| {
                    MacroParseError::new(format!("line {current_number}: {error}"))
                })?,
            }
        } else {
            return Err(MacroParseError::new(
                "sequence lines must be: press <key> or wait <duration>",
            ));
        };
        steps.push(step);
    }

    Err(MacroParseError::new(format!(
        "line {sequence_line_number}: sequence missing closing }}"
    )))
}

fn describe_sequence(interval: f64, steps: &[MacroStep]) -> String {
    let pieces = steps
        .iter()
        .map(|step| match step {
            MacroStep::Press { key } => format!("press {key}"),
            MacroStep::Wait { seconds } => format!("wait {}s", format_seconds(*seconds)),
        })
        .collect::<Vec<_>>();
    format!("every {}s: {}", format_seconds(interval), pieces.join(", "))
}

fn strip_comment(line: &str) -> &str {
    line.split_once('#').map_or(line, |(left, _)| left).trim()
}

fn format_seconds(seconds: f64) -> String {
    let text = format!("{seconds:.3}");
    text.trim_end_matches('0').trim_end_matches('.').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_every_and_sequence() {
        let program = parse_macro_str(
            r#"
name Demo
backend auto
toggle side space
start running
every 1s press r
sequence 500ms {
  press a
  wait 100ms
  press b
}
"#,
        )
        .unwrap();

        assert_eq!(program.name, "Demo");
        assert!(program.enabled);
        assert_eq!(program.toggle_buttons, vec!["BTN_SIDE", "KEY_SPACE"]);
        assert!(program.start_running);
        assert_eq!(program.tasks.len(), 2);
        assert_eq!(program.tasks[1].steps.len(), 3);
    }

    #[test]
    fn rejects_empty_program() {
        let error = parse_macro_str("name Empty").unwrap_err();
        assert!(error.to_string().contains("no macro tasks"));
    }
}
