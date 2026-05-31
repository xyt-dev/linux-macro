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
    pub backend: String,
    pub macros: Vec<MacroSpec>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MacroSpec {
    pub name: String,
    pub description: String,
    pub enabled: bool,
    pub trigger_buttons: Vec<String>,
    pub grab_toggle_device: bool,
    pub start_running: bool,
    #[serde(default)]
    pub holds: Vec<MacroHoldSpec>,
    pub tasks: Vec<MacroTaskSpec>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MacroTaskSpec {
    pub interval: f64,
    pub steps: Vec<MacroStep>,
    pub description: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum MacroHoldSpec {
    HoldKey { key: String },
    HoldClick { button: String },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum MacroStep {
    Press { key: String },
    Click { button: String },
    Wait { seconds: f64 },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ValidationReport {
    pub ok: bool,
    pub error: Option<String>,
    pub program: Option<MacroProgram>,
    pub macro_count: usize,
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
            macro_count: program.macros.len(),
            task_count: program
                .macros
                .iter()
                .map(|macro_spec| macro_spec.holds.len() + macro_spec.tasks.len())
                .sum(),
            line_count: content.lines().count(),
            program: Some(program),
        },
        Err(error) => ValidationReport {
            ok: false,
            error: Some(error.to_string()),
            program: None,
            macro_count: 0,
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
    if has_macro_blocks(content) {
        parse_block_program(content, default_name, display_name)
    } else {
        parse_legacy_program(content, default_name, display_name)
    }
}

fn has_macro_blocks(content: &str) -> bool {
    content.lines().any(|line| {
        let line = strip_comment(line);
        line.split_whitespace()
            .next()
            .is_some_and(|command| command.eq_ignore_ascii_case("macro"))
    })
}

fn parse_block_program(
    content: &str,
    default_name: &str,
    display_name: &str,
) -> Result<MacroProgram, MacroParseError> {
    let mut backend = "auto".to_string();
    let mut macros = Vec::new();

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
            "backend" if parts.len() == 2 => parse_backend(parts[1]).map(|value| {
                backend = value;
            }),
            "macro" => {
                let fallback_name = format!("{default_name}-{}", macros.len() + 1);
                let name = parse_macro_header(line, &fallback_name)?;
                let (macro_spec, next_index) =
                    parse_macro_block(&raw_lines, line_index, name, display_name, line_number)?;
                macros.push(macro_spec);
                line_index = next_index;
                Ok(())
            }
            _ => Err(MacroParseError::new(format!(
                "unknown top-level statement {line:?}; use backend or macro \"name\" {{"
            ))),
        };

        if let Err(error) = result {
            return Err(MacroParseError::new(format!(
                "{display_name}:{line_number}: {error}"
            )));
        }
    }

    let program = MacroProgram { backend, macros };
    validate_program(&program, display_name)?;
    Ok(program)
}

fn parse_legacy_program(
    content: &str,
    default_name: &str,
    display_name: &str,
) -> Result<MacroProgram, MacroParseError> {
    let mut name = default_name.to_string();
    let mut description = String::new();
    let mut enabled = true;
    let mut backend = "auto".to_string();
    let mut trigger_buttons = vec![
        "BTN_SIDE".to_string(),
        "BTN_EXTRA".to_string(),
        "KEY_BACK".to_string(),
        "KEY_FORWARD".to_string(),
    ];
    let mut grab_toggle_device = false;
    let mut start_running = false;
    let mut holds: Vec<MacroHoldSpec> = Vec::new();
    let mut tasks: Vec<MacroTaskSpec> = Vec::new();

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
                backend = parse_backend(parts[1])?;
                Ok(())
            }
            "toggle" | "trigger" if parts.len() >= 2 => {
                trigger_buttons = parse_toggle_names(&parts[1..])?;
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
            "hold" => {
                holds.push(parse_hold_line(&parts)?);
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

    if tasks.is_empty() && holds.is_empty() {
        return Err(MacroParseError::new(format!(
            "{display_name}: no macro tasks or holds found"
        )));
    }

    if description.is_empty() {
        description = holds
            .iter()
            .map(describe_hold)
            .chain(tasks.iter().map(|task| task.description.clone()))
            .collect::<Vec<_>>()
            .join("; ");
    }

    let macro_spec = MacroSpec {
        name,
        description,
        enabled,
        trigger_buttons,
        grab_toggle_device,
        start_running,
        holds,
        tasks,
    };
    let program = MacroProgram {
        backend,
        macros: vec![macro_spec],
    };
    validate_program(&program, display_name)?;
    Ok(program)
}

fn parse_backend(value: &str) -> Result<String, MacroParseError> {
    if matches!(value, "auto" | "ydotool" | "xdotool" | "pynput") {
        Ok(value.to_string())
    } else {
        Err(MacroParseError::new(
            "backend must be auto, ydotool, xdotool, or pynput",
        ))
    }
}

fn parse_macro_header(line: &str, default_name: &str) -> Result<String, MacroParseError> {
    let command_end = line.find(char::is_whitespace).unwrap_or(line.len());
    let body = line[command_end..].trim();
    if !body.ends_with('{') {
        return Err(MacroParseError::new("use: macro \"name\" {"));
    }

    let name = body[..body.len() - 1].trim();
    if name.is_empty() {
        return Ok(default_name.to_string());
    }

    if name.starts_with('"') {
        if !name.ends_with('"') || name.len() < 2 {
            return Err(MacroParseError::new(
                "quoted macro name is missing closing quote",
            ));
        }
        let name = name[1..name.len() - 1].trim();
        return Ok(if name.is_empty() {
            default_name.to_string()
        } else {
            name.to_string()
        });
    }

    Ok(name.to_string())
}

fn parse_macro_block(
    raw_lines: &[&str],
    mut line_index: usize,
    name: String,
    display_name: &str,
    macro_line_number: usize,
) -> Result<(MacroSpec, usize), MacroParseError> {
    let mut description = String::new();
    let mut enabled = true;
    let mut trigger_buttons = Vec::new();
    let mut grab_toggle_device = false;
    let mut start_running = false;
    let mut holds: Vec<MacroHoldSpec> = Vec::new();
    let mut tasks: Vec<MacroTaskSpec> = Vec::new();

    while line_index < raw_lines.len() {
        let line_number = line_index + 1;
        let line = strip_comment(raw_lines[line_index]);
        line_index += 1;
        if line.is_empty() {
            continue;
        }
        if line == "}" {
            if tasks.is_empty() && holds.is_empty() {
                return Err(MacroParseError::new(format!(
                    "{display_name}:{macro_line_number}: macro {name:?} has no tasks or holds"
                )));
            }
            if trigger_buttons.is_empty() {
                return Err(MacroParseError::new(format!(
                    "{display_name}:{macro_line_number}: macro {name:?} has no trigger; add trigger <key>"
                )));
            }
            if description.is_empty() {
                description = holds
                    .iter()
                    .map(describe_hold)
                    .chain(tasks.iter().map(|task| task.description.clone()))
                    .collect::<Vec<_>>()
                    .join("; ");
            }

            return Ok((
                MacroSpec {
                    name,
                    description,
                    enabled,
                    trigger_buttons,
                    grab_toggle_device,
                    start_running,
                    holds,
                    tasks,
                },
                line_index,
            ));
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        let command = parts[0].to_ascii_lowercase();
        let result = match command.as_str() {
            "description" => {
                description = line[parts[0].len()..].trim().to_string();
                Ok(())
            }
            "enabled" if parts.len() == 2 => {
                enabled = parse_bool(parts[1], "enabled")?;
                Ok(())
            }
            "trigger" | "toggle" if parts.len() >= 2 => {
                trigger_buttons = parse_toggle_names(&parts[1..])?;
                Ok(())
            }
            "grab" if parts.len() == 2 => {
                grab_toggle_device = parse_bool(parts[1], "grab")?;
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
            "hold" => {
                holds.push(parse_hold_line(&parts)?);
                Ok(())
            }
            "sequence" => {
                let (task, next_index) =
                    parse_sequence(raw_lines, line_index, &parts, line_number)?;
                tasks.push(task);
                line_index = next_index;
                Ok(())
            }
            "backend" => Err(MacroParseError::new(
                "backend is global; put it outside macro blocks",
            )),
            _ => Err(MacroParseError::new(format!("unknown statement {line:?}"))),
        };

        if let Err(error) = result {
            return Err(MacroParseError::new(format!(
                "{display_name}:{line_number}: {error}"
            )));
        }
    }

    Err(MacroParseError::new(format!(
        "{display_name}:{macro_line_number}: macro block missing closing }}"
    )))
}

fn validate_program(program: &MacroProgram, display_name: &str) -> Result<(), MacroParseError> {
    if program.macros.is_empty() {
        return Err(MacroParseError::new(format!(
            "{display_name}: no macro blocks found"
        )));
    }

    let mut used_triggers = std::collections::HashMap::<&str, &str>::new();
    let mut used_holds = std::collections::HashMap::<String, &str>::new();
    for macro_spec in &program.macros {
        if macro_spec.tasks.is_empty() && macro_spec.holds.is_empty() {
            return Err(MacroParseError::new(format!(
                "{display_name}: macro {:?} has no tasks or holds",
                macro_spec.name
            )));
        }

        if macro_spec.trigger_buttons.is_empty() {
            return Err(MacroParseError::new(format!(
                "{display_name}: macro {:?} has no trigger",
                macro_spec.name
            )));
        }

        if !macro_spec.enabled {
            continue;
        }

        for trigger in &macro_spec.trigger_buttons {
            if let Some(previous_name) =
                used_triggers.insert(trigger.as_str(), macro_spec.name.as_str())
            {
                return Err(MacroParseError::new(format!(
                    "{display_name}: trigger {trigger:?} is used by enabled macros {previous_name:?} and {:?}",
                    macro_spec.name
                )));
            }
        }

        for hold in &macro_spec.holds {
            let identity = hold_identity(hold);
            if let Some(previous_name) =
                used_holds.insert(identity.clone(), macro_spec.name.as_str())
            {
                return Err(MacroParseError::new(format!(
                    "{display_name}: held input {identity:?} is used by enabled macros {previous_name:?} and {:?}",
                    macro_spec.name
                )));
            }
        }
    }

    Ok(())
}

fn hold_identity(hold: &MacroHoldSpec) -> String {
    match hold {
        MacroHoldSpec::HoldKey { key } => format!("key:{key}"),
        MacroHoldSpec::HoldClick { button } => format!("mouse:{button}"),
    }
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

    if normalized
        .strip_prefix('f')
        .and_then(|number| number.parse::<u8>().ok())
        .is_some_and(|number| (1..=24).contains(&number))
    {
        return Ok(normalized);
    }

    Err(MacroParseError::new(format!(
        "unsupported key {value:?}; use one character, f1-f24, or one of: {}",
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

pub fn parse_mouse_button(value: &str) -> Result<String, MacroParseError> {
    let normalized = value.trim().to_ascii_lowercase();
    let button = match normalized.as_str() {
        "left" | "leftclick" | "mouse1" | "lmb" | "btn_left" => "left",
        "right" | "rightclick" | "mouse2" | "rmb" | "btn_right" => "right",
        "middle" | "middleclick" | "mouse3" | "mmb" | "btn_middle" => "middle",
        "side" | "mouse4" | "back" | "btn_side" => "side",
        "extra" | "mouse5" | "forward" | "btn_extra" => "extra",
        _ => {
            return Err(MacroParseError::new(format!(
                "unsupported mouse button {value:?}; use left, right, middle, side, or extra"
            )));
        }
    };
    Ok(button.to_string())
}

pub fn parse_toggle_names(values: &[&str]) -> Result<Vec<String>, MacroParseError> {
    let mut names = Vec::new();
    for value in values {
        for token in value.split(',') {
            let token = token.trim();
            if !token.is_empty() {
                let normalized = normalize_evdev_trigger(token);
                if !names.contains(&normalized) {
                    names.push(normalized);
                }
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
        "leftclick" | "mouse1" | "lmb" | "leftbutton" => "BTN_LEFT".to_string(),
        "rightclick" | "mouse2" | "rmb" | "rightbutton" => "BTN_RIGHT".to_string(),
        "middleclick" | "mouse3" | "mmb" | "middlebutton" => "BTN_MIDDLE".to_string(),
        "side" | "mouse4" | "back" => "BTN_SIDE".to_string(),
        "extra" | "mouse5" | "forward" => "BTN_EXTRA".to_string(),
        "browserback" => "KEY_BACK".to_string(),
        "browserforward" => "KEY_FORWARD".to_string(),
        "space" => "KEY_SPACE".to_string(),
        "enter" => "KEY_ENTER".to_string(),
        "tab" => "KEY_TAB".to_string(),
        "esc" | "escape" => "KEY_ESC".to_string(),
        _ if lower
            .strip_prefix('f')
            .and_then(|number| number.parse::<u8>().ok())
            .is_some_and(|number| (1..=24).contains(&number)) =>
        {
            format!("KEY_{}", lower.to_ascii_uppercase())
        }
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
    if parts.len() != 4 {
        return Err(MacroParseError::new(
            "use: every <duration> press <key> or every <duration> click <button>; use hold press|click <target> for toggle holds",
        ));
    }
    let interval = parse_duration(parts[1])?;
    if parts[2].eq_ignore_ascii_case("press") {
        let key = parse_key(parts[3])?;
        Ok(MacroTaskSpec {
            interval,
            steps: vec![MacroStep::Press { key: key.clone() }],
            description: format!("press {key} every {}s", format_seconds(interval)),
        })
    } else if parts[2].eq_ignore_ascii_case("click") {
        let button = parse_mouse_button(parts[3])?;
        Ok(MacroTaskSpec {
            interval,
            steps: vec![MacroStep::Click {
                button: button.clone(),
            }],
            description: format!("click {button} every {}s", format_seconds(interval)),
        })
    } else {
        Err(MacroParseError::new(
            "use: every <duration> press <key> or every <duration> click <button>; use hold press|click <target> for toggle holds",
        ))
    }
}

fn parse_hold_line(parts: &[&str]) -> Result<MacroHoldSpec, MacroParseError> {
    if parts.len() != 3 {
        return Err(MacroParseError::new(
            "use: hold press <key> or hold click <button>; hold is a toggle and does not take a period or duration",
        ));
    }

    if parts[1].eq_ignore_ascii_case("press") {
        Ok(MacroHoldSpec::HoldKey {
            key: parse_key(parts[2])?,
        })
    } else if parts[1].eq_ignore_ascii_case("click") {
        Ok(MacroHoldSpec::HoldClick {
            button: parse_mouse_button(parts[2])?,
        })
    } else {
        Err(MacroParseError::new(
            "hold action must be press <key> or click <button>",
        ))
    }
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
        } else if step_parts.len() == 2 && step_parts[0].eq_ignore_ascii_case("click") {
            MacroStep::Click {
                button: parse_mouse_button(step_parts[1]).map_err(|error| {
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
                "sequence lines must be: press <key>, click <button>, or wait <duration>; put toggle holds at macro level with hold press|click <target>",
            ));
        };
        steps.push(step);
    }

    Err(MacroParseError::new(format!(
        "line {sequence_line_number}: sequence missing closing }}"
    )))
}

fn describe_sequence(interval: f64, steps: &[MacroStep]) -> String {
    let pieces = steps.iter().map(describe_step).collect::<Vec<_>>();
    format!("every {}s: {}", format_seconds(interval), pieces.join(", "))
}

fn describe_hold(hold: &MacroHoldSpec) -> String {
    match hold {
        MacroHoldSpec::HoldKey { key } => format!("hold press {key}"),
        MacroHoldSpec::HoldClick { button } => format!("hold click {button}"),
    }
}

fn describe_step(step: &MacroStep) -> String {
    match step {
        MacroStep::Press { key } => format!("press {key}"),
        MacroStep::Click { button } => format!("click {button}"),
        MacroStep::Wait { seconds } => format!("wait {}s", format_seconds(*seconds)),
    }
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
    fn parses_macro_blocks() {
        let program = parse_macro_str(
            r#"
backend auto
macro "Demo" {
  trigger side browserforward f1
  start running
  hold press f1
  hold click left
  every 1s press r
  every 50ms click left
  sequence 500ms {
    press a
    wait 100ms
    click right
    press b
  }
}

macro "Disabled" {
  enabled off
  trigger side
  every 1s press a
}
"#,
        )
        .unwrap();

        assert_eq!(program.backend, "auto");
        assert_eq!(program.macros.len(), 2);
        assert_eq!(program.macros[0].name, "Demo");
        assert!(program.macros[0].enabled);
        assert_eq!(
            program.macros[0].trigger_buttons,
            vec!["BTN_SIDE", "KEY_FORWARD", "KEY_F1"]
        );
        assert!(program.macros[0].start_running);
        assert_eq!(
            program.macros[0].holds,
            vec![
                MacroHoldSpec::HoldKey {
                    key: "f1".to_string()
                },
                MacroHoldSpec::HoldClick {
                    button: "left".to_string()
                }
            ]
        );
        assert_eq!(program.macros[0].tasks.len(), 3);
        assert_eq!(
            program.macros[0].tasks[1].steps,
            vec![MacroStep::Click {
                button: "left".to_string()
            }]
        );
        assert_eq!(program.macros[0].tasks[2].steps.len(), 4);
        assert!(!program.macros[1].enabled);
    }

    #[test]
    fn parses_legacy_single_macro() {
        let program = parse_macro_str(
            r#"
name Demo
backend auto
toggle side extra browserforward
start running
hold press space
every 50ms click left
"#,
        )
        .unwrap();

        assert_eq!(program.backend, "auto");
        assert_eq!(program.macros.len(), 1);
        assert_eq!(program.macros[0].name, "Demo");
        assert_eq!(
            program.macros[0].trigger_buttons,
            vec!["BTN_SIDE", "BTN_EXTRA", "KEY_FORWARD"]
        );
        assert_eq!(
            program.macros[0].holds,
            vec![MacroHoldSpec::HoldKey {
                key: "space".to_string()
            }]
        );
        assert_eq!(program.macros[0].tasks.len(), 1);
    }

    #[test]
    fn parses_hold_only_macro() {
        let program = parse_macro_str(
            r#"
macro "Hold Space" {
  trigger side
  hold press space
}
"#,
        )
        .unwrap();

        assert!(program.macros[0].tasks.is_empty());
        assert_eq!(
            program.macros[0].holds,
            vec![MacroHoldSpec::HoldKey {
                key: "space".to_string()
            }]
        );
    }

    #[test]
    fn rejects_old_timed_hold_syntax() {
        let error = parse_macro_str(
            r#"
macro "Old" {
  trigger side
  every 1s hold 200ms press a
}
"#,
        )
        .unwrap_err();

        assert!(error.to_string().contains("use: every <duration> press"));
    }

    #[test]
    fn rejects_duplicate_enabled_holds() {
        let error = parse_macro_str(
            r#"
macro "A" {
  trigger side
  hold press space
}

macro "B" {
  trigger extra
  hold press space
}
"#,
        )
        .unwrap_err();

        assert!(error.to_string().contains("held input \"key:space\""));
    }

    #[test]
    fn rejects_duplicate_enabled_triggers() {
        let error = parse_macro_str(
            r#"
macro "A" {
  trigger side
  every 1s press a
}

macro "B" {
  trigger side
  every 1s press b
}
"#,
        )
        .unwrap_err();

        assert!(error.to_string().contains("trigger \"BTN_SIDE\""));
    }

    #[test]
    fn parses_default_config() {
        let program = parse_macro_str(crate::config::DEFAULT_CONFIG).unwrap();
        assert_eq!(program.macros.len(), 2);
        assert_eq!(
            program.macros[0].tasks[0].steps[0],
            MacroStep::Click {
                button: "left".to_string()
            }
        );
    }

    #[test]
    fn rejects_empty_program() {
        let error = parse_macro_str("name Empty").unwrap_err();
        assert!(error.to_string().contains("no macro tasks or holds"));
    }
}
