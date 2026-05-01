#!/usr/bin/env python3
"""Run a small keyboard macro from CLI options or a .macro script.

Default: press Space once per second.
Stop with Ctrl+C in the terminal.

Example:
  uv run key-loop-macro --press r:1 --press a:0.2
  uv run key-loop-macro macros/ra.macro

On Linux Wayland, use the ydotool backend. pynput cannot reliably inject keys
into native Wayland windows.
"""

from __future__ import annotations

import argparse
import curses
from dataclasses import dataclass
import glob
import grp
import os
import platform
from pathlib import Path
import selectors
import shutil
import subprocess
import sys
import threading
import time


SPECIAL_KEY_NAMES = {
    "space": "space",
    "enter": "enter",
    "tab": "tab",
    "esc": "esc",
    "escape": "esc",
    "backspace": "backspace",
    "delete": "delete",
    "up": "up",
    "down": "down",
    "left": "left",
    "right": "right",
    "shift": "shift",
    "ctrl": "ctrl",
    "alt": "alt",
}

LETTER_KEY_CODES = {
    "a": 30,
    "b": 48,
    "c": 46,
    "d": 32,
    "e": 18,
    "f": 33,
    "g": 34,
    "h": 35,
    "i": 23,
    "j": 36,
    "k": 37,
    "l": 38,
    "m": 50,
    "n": 49,
    "o": 24,
    "p": 25,
    "q": 16,
    "r": 19,
    "s": 31,
    "t": 20,
    "u": 22,
    "v": 47,
    "w": 17,
    "x": 45,
    "y": 21,
    "z": 44,
}

DIGIT_KEY_CODES = {
    "1": 2,
    "2": 3,
    "3": 4,
    "4": 5,
    "5": 6,
    "6": 7,
    "7": 8,
    "8": 9,
    "9": 10,
    "0": 11,
}

PUNCTUATION_KEY_CODES = {
    "-": 12,
    "=": 13,
    "[": 26,
    "]": 27,
    "\\": 43,
    ";": 39,
    "'": 40,
    "`": 41,
    ",": 51,
    ".": 52,
    "/": 53,
}

YDOTOOL_KEY_CODES = {
    **LETTER_KEY_CODES,
    **DIGIT_KEY_CODES,
    **PUNCTUATION_KEY_CODES,
    "space": 57,
    "enter": 28,
    "tab": 15,
    "esc": 1,
    "escape": 1,
    "backspace": 14,
    "delete": 111,
    "up": 103,
    "down": 108,
    "left": 105,
    "right": 106,
    "shift": 42,
    "ctrl": 29,
    "alt": 56,
}

XDOTOOL_KEY_NAMES = {
    "-": "minus",
    "=": "equal",
    "[": "bracketleft",
    "]": "bracketright",
    "\\": "backslash",
    ";": "semicolon",
    "'": "apostrophe",
    "`": "grave",
    ",": "comma",
    ".": "period",
    "/": "slash",
    "space": "space",
    "enter": "Return",
    "tab": "Tab",
    "esc": "Escape",
    "escape": "Escape",
    "backspace": "BackSpace",
    "delete": "Delete",
    "up": "Up",
    "down": "Down",
    "left": "Left",
    "right": "Right",
    "shift": "Shift_L",
    "ctrl": "Control_L",
    "alt": "Alt_L",
}

WAYLAND_NO_BACKEND = """Wayland session detected, but ydotool is not installed.

Install and start it on Arch Linux:
  sudo pacman -S --needed ydotool
  systemctl --user enable --now ydotool.service

Then run:
  uv run key-loop-macro --backend ydotool
"""


class MacroParseError(ValueError):
    pass


def parse_key(value: str) -> str:
    normalized = value.lower()
    if normalized in SPECIAL_KEY_NAMES:
        return normalized
    if len(value) == 1:
        return value.lower()
    raise argparse.ArgumentTypeError(
        f"Unsupported key {value!r}. Use one character or one of: "
        + ", ".join(sorted(SPECIAL_KEY_NAMES))
    )


def parse_press(value: str) -> tuple[str, float]:
    if ":" not in value:
        raise argparse.ArgumentTypeError("Use key:seconds, for example r:1 or a:0.2")

    key_text, interval_text = value.rsplit(":", 1)
    key = parse_key(key_text)

    try:
        interval = float(interval_text)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            f"Invalid interval {interval_text!r}. Use seconds, for example 0.2"
        ) from exc

    if interval <= 0:
        raise argparse.ArgumentTypeError("Interval must be greater than 0")

    return key, interval


def parse_duration(value: str) -> float:
    text = value.strip().lower()
    if text.endswith("ms"):
        multiplier = 0.001
        text = text[:-2]
    elif text.endswith("s"):
        multiplier = 1.0
        text = text[:-1]
    else:
        multiplier = 1.0

    try:
        duration = float(text) * multiplier
    except ValueError as exc:
        raise MacroParseError(f"invalid duration {value!r}") from exc

    if duration <= 0:
        raise MacroParseError("duration must be greater than 0")
    return duration


def resolve_key(value: str, key_type):
    normalized = value.lower()
    if normalized in SPECIAL_KEY_NAMES:
        return getattr(key_type, SPECIAL_KEY_NAMES[normalized])
    return value


def is_linux_wayland() -> bool:
    if platform.system() != "Linux":
        return False
    return (
        os.environ.get("XDG_SESSION_TYPE", "").lower() == "wayland"
        or bool(os.environ.get("WAYLAND_DISPLAY"))
    )


def choose_backend(requested: str) -> str:
    if requested != "auto":
        return requested
    if is_linux_wayland():
        if shutil.which("ydotool"):
            return "ydotool"
        raise RuntimeError(WAYLAND_NO_BACKEND)
    if platform.system() == "Linux" and os.environ.get("DISPLAY") and shutil.which("xdotool"):
        return "xdotool"
    return "pynput"


class YdotoolBackend:
    name = "ydotool"

    def __init__(self, key: str) -> None:
        if not shutil.which("ydotool"):
            raise RuntimeError("ydotool is not installed.")
        if key not in YDOTOOL_KEY_CODES:
            raise RuntimeError(
                f"ydotool backend does not support key {key!r} yet. "
                "Use a-z, 0-9, punctuation, or a named key like enter/space."
            )
        self.code = YDOTOOL_KEY_CODES[key]

    def press_once(self) -> None:
        result = subprocess.run(
            ["ydotool", "key", f"{self.code}:1", f"{self.code}:0"],
            check=False,
            stderr=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )
        if result.returncode != 0:
            detail = "\n".join(
                part.strip() for part in (result.stderr, result.stdout) if part.strip()
            )
            if not detail:
                detail = f"exit code {result.returncode}"
            raise RuntimeError(
                "ydotool failed. Make sure ydotoold is running:\n"
                "  systemctl --user enable --now ydotool.service\n\n"
                f"ydotool output:\n{detail}"
            )


class XdotoolBackend:
    name = "xdotool"

    def __init__(self, key: str) -> None:
        if not shutil.which("xdotool"):
            raise RuntimeError("xdotool is not installed.")
        self.key = XDOTOOL_KEY_NAMES.get(key, key)

    def press_once(self) -> None:
        result = subprocess.run(
            ["xdotool", "key", "--clearmodifiers", self.key],
            check=False,
            stderr=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )
        if result.returncode != 0:
            detail = "\n".join(
                part.strip() for part in (result.stderr, result.stdout) if part.strip()
            )
            if not detail:
                detail = f"exit code {result.returncode}"
            raise RuntimeError(f"xdotool failed:\n{detail}")


class PynputBackend:
    name = "pynput"

    def __init__(self, key: str) -> None:
        try:
            from pynput.keyboard import Controller, Key
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "pynput is not installed. Run with: "
                "uv run --extra pynput key-loop-macro --backend pynput"
            ) from exc

        self.keyboard = Controller()
        self.key = resolve_key(key, Key)

    def press_once(self) -> None:
        self.keyboard.press(self.key)
        self.keyboard.release(self.key)


def create_backend(name: str, key: str):
    if name == "ydotool":
        return YdotoolBackend(key)
    if name == "xdotool":
        return XdotoolBackend(key)
    if name == "pynput":
        return PynputBackend(key)
    raise RuntimeError(f"Unsupported backend: {name}")


@dataclass(frozen=True)
class PressStep:
    key: str


@dataclass(frozen=True)
class WaitStep:
    seconds: float


MacroStep = PressStep | WaitStep


@dataclass(frozen=True)
class MacroTaskSpec:
    interval: float
    steps: list[MacroStep]
    description: str


@dataclass
class MacroProgram:
    name: str
    description: str
    backend: str
    toggle_buttons: list[str]
    grab_toggle_device: bool
    start_running: bool
    tasks: list[MacroTaskSpec]


@dataclass
class ScheduledPress:
    key: str
    interval: float
    backend: object
    next_time: float


@dataclass
class ScheduledTask:
    spec: MacroTaskSpec
    backends: dict[str, object]
    next_time: float


class RuntimeState:
    def __init__(self, running: bool) -> None:
        self._running = running
        self.stop_event = threading.Event()
        self._lock = threading.Lock()
        self.last_event = "started running" if running else "started paused"

    def is_running(self) -> bool:
        with self._lock:
            return self._running

    def set_running(self, running: bool, reason: str) -> None:
        with self._lock:
            self._running = running
            self.last_event = reason

    def set_message(self, message: str) -> None:
        with self._lock:
            self.last_event = message

    def toggle(self, reason: str) -> bool:
        with self._lock:
            self._running = not self._running
            state = "running" if self._running else "paused"
            self.last_event = f"{state} by {reason}"
            return self._running

    def stop(self, reason: str) -> None:
        with self._lock:
            self.last_event = reason
        self.stop_event.set()

    def snapshot(self) -> tuple[bool, str]:
        with self._lock:
            return self._running, self.last_event


def build_actions(backend_name: str, press_specs: list[tuple[str, float]]) -> list[ScheduledPress]:
    now = time.monotonic()
    return [
        ScheduledPress(
            key=key,
            interval=interval,
            backend=create_backend(backend_name, key),
            next_time=now,
        )
        for key, interval in press_specs
    ]


def build_tasks(backend_name: str, task_specs: list[MacroTaskSpec]) -> list[ScheduledTask]:
    now = time.monotonic()
    tasks = []
    for spec in task_specs:
        keys = sorted({step.key for step in spec.steps if isinstance(step, PressStep)})
        tasks.append(
            ScheduledTask(
                spec=spec,
                backends={key: create_backend(backend_name, key) for key in keys},
                next_time=now,
            )
        )
    return tasks


def run_schedule(actions: list[ScheduledPress]) -> None:
    while True:
        now = time.monotonic()
        for action in actions:
            if now >= action.next_time:
                action.backend.press_once()
                action.next_time += action.interval
                if action.next_time <= now:
                    action.next_time = now + action.interval

        sleep_for = min(action.next_time for action in actions) - time.monotonic()
        if sleep_for > 0:
            time.sleep(sleep_for)


def interruptible_sleep(seconds: float, state: RuntimeState) -> bool:
    end_time = time.monotonic() + seconds
    while not state.stop_event.is_set():
        if not state.is_running():
            return False
        remaining = end_time - time.monotonic()
        if remaining <= 0:
            return True
        time.sleep(min(remaining, 0.05))
    return False


def run_task(task: ScheduledTask, state: RuntimeState) -> None:
    for step in task.spec.steps:
        if state.stop_event.is_set() or not state.is_running():
            return
        if isinstance(step, PressStep):
            task.backends[step.key].press_once()
        else:
            if not interruptible_sleep(step.seconds, state):
                return


def run_program_schedule(tasks: list[ScheduledTask], state: RuntimeState) -> None:
    was_running = False
    while not state.stop_event.is_set():
        if not state.is_running():
            was_running = False
            time.sleep(0.05)
            continue

        now = time.monotonic()
        if not was_running:
            for task in tasks:
                task.next_time = now
            was_running = True

        for task in tasks:
            if now >= task.next_time:
                run_task(task, state)
                after_run = time.monotonic()
                task.next_time += task.spec.interval
                if task.next_time <= after_run:
                    task.next_time = after_run + task.spec.interval

        sleep_for = min(task.next_time for task in tasks) - time.monotonic()
        if sleep_for > 0:
            time.sleep(min(sleep_for, 0.05))


def parse_macro_file(path: Path) -> MacroProgram:
    name = path.stem
    description = ""
    backend = "auto"
    toggle_buttons = ["BTN_SIDE", "BTN_EXTRA", "KEY_SPACE", "KEY_BACK", "KEY_FORWARD"]
    grab_toggle_device = False
    start_running = False
    tasks: list[MacroTaskSpec] = []

    raw_lines = path.read_text(encoding="utf-8").splitlines()
    line_index = 0
    while line_index < len(raw_lines):
        line_number = line_index + 1
        raw_line = raw_lines[line_index]
        line = raw_line.split("#", 1)[0].strip()
        line_index += 1
        if not line:
            continue

        parts = line.split()
        command = parts[0].lower()

        try:
            if command == "name":
                name = line[len(parts[0]) :].strip() or name
            elif command == "description":
                description = line[len(parts[0]) :].strip()
            elif command == "backend" and len(parts) == 2:
                if parts[1] not in {"auto", "ydotool", "xdotool", "pynput"}:
                    raise MacroParseError("backend must be auto, ydotool, xdotool, or pynput")
                backend = parts[1]
            elif command == "toggle" and len(parts) >= 2:
                toggle_buttons = parse_toggle_names(parts[1:])
            elif command == "grab" and len(parts) == 2:
                grab_toggle_device = parts[1].lower() in {"on", "true", "yes", "1"}
            elif command == "start" and len(parts) == 2:
                if parts[1].lower() not in {"paused", "running"}:
                    raise MacroParseError("start must be paused or running")
                start_running = parts[1].lower() == "running"
            elif command == "every":
                tasks.append(parse_every_line(parts))
            elif command == "sequence":
                task, line_index = parse_sequence(raw_lines, line_index, parts, line_number)
                tasks.append(task)
            else:
                raise MacroParseError(f"unknown statement {line!r}")
        except (MacroParseError, argparse.ArgumentTypeError) as exc:
            raise MacroParseError(f"{path}:{line_number}: {exc}") from exc

    if not tasks:
        raise MacroParseError(f"{path}: no macro tasks found")

    if not description:
        description = "; ".join(task.description for task in tasks)

    return MacroProgram(
        name=name,
        description=description,
        backend=backend,
        toggle_buttons=toggle_buttons,
        grab_toggle_device=grab_toggle_device,
        start_running=start_running,
        tasks=tasks,
    )


def parse_every_line(parts: list[str]) -> MacroTaskSpec:
    if len(parts) != 4 or parts[2].lower() != "press":
        raise MacroParseError("use: every <seconds> press <key>")
    interval = parse_duration(parts[1])
    key = parse_key(parts[3])
    return MacroTaskSpec(
        interval=interval,
        steps=[PressStep(key)],
        description=f"press {key} every {interval:g}s",
    )


def parse_sequence(
    raw_lines: list[str], line_index: int, parts: list[str], line_number: int
) -> tuple[MacroTaskSpec, int]:
    if len(parts) != 3 or parts[2] != "{":
        raise MacroParseError("use: sequence <seconds> {")

    interval = parse_duration(parts[1])
    steps: list[MacroStep] = []

    while line_index < len(raw_lines):
        current_number = line_index + 1
        line = raw_lines[line_index].split("#", 1)[0].strip()
        line_index += 1
        if not line:
            continue
        if line == "}":
            if not steps:
                raise MacroParseError(f"line {line_number}: sequence cannot be empty")
            description = describe_sequence(interval, steps)
            return MacroTaskSpec(interval=interval, steps=steps, description=description), line_index

        step_parts = line.split()
        try:
            if len(step_parts) == 2 and step_parts[0].lower() == "press":
                steps.append(PressStep(parse_key(step_parts[1])))
            elif len(step_parts) == 2 and step_parts[0].lower() == "wait":
                steps.append(WaitStep(parse_duration(step_parts[1])))
            else:
                raise MacroParseError("sequence lines must be: press <key> or wait <seconds>")
        except (MacroParseError, argparse.ArgumentTypeError) as exc:
            raise MacroParseError(f"line {current_number}: {exc}") from exc

    raise MacroParseError(f"line {line_number}: sequence missing closing }}")


def describe_sequence(interval: float, steps: list[MacroStep]) -> str:
    pieces = []
    for step in steps:
        if isinstance(step, PressStep):
            pieces.append(f"press {step.key}")
        else:
            pieces.append(f"wait {step.seconds:g}s")
    return f"every {interval:g}s: " + ", ".join(pieces)


def parse_toggle_names(values: list[str]) -> list[str]:
    names = []
    for value in values:
        for token in value.split(","):
            token = token.strip()
            if token:
                names.append(normalize_evdev_trigger(token))
    if not names:
        raise MacroParseError("toggle needs at least one key or button")
    return names


def normalize_evdev_trigger(value: str) -> str:
    aliases = {
        "side": "BTN_SIDE",
        "mouse4": "BTN_SIDE",
        "extra": "BTN_EXTRA",
        "mouse5": "BTN_EXTRA",
        "back": "BTN_SIDE",
        "forward": "BTN_EXTRA",
        "browserback": "KEY_BACK",
        "browserforward": "KEY_FORWARD",
        "space": "KEY_SPACE",
        "enter": "KEY_ENTER",
        "tab": "KEY_TAB",
        "esc": "KEY_ESC",
        "escape": "KEY_ESC",
    }
    stripped = value.strip()
    lower = stripped.lower()
    if lower in aliases:
        return aliases[lower]
    if len(lower) == 1 and lower.isalpha():
        return f"KEY_{lower.upper()}"
    if len(lower) == 1 and lower.isdigit():
        return f"KEY_{lower}"
    return stripped.upper()


def evdev_trigger_code(trigger_name: str) -> int:
    try:
        from evdev import ecodes
    except ModuleNotFoundError as exc:
        raise RuntimeError("evdev is not installed. Run: uv add evdev") from exc

    if trigger_name not in ecodes.ecodes:
        raise RuntimeError(f"unknown evdev key/button {trigger_name!r}")
    return int(ecodes.ecodes[trigger_name])


def input_event_paths() -> list[str]:
    return sorted(glob.glob("/dev/input/event*"))


def evdev_code_name(code: int) -> str:
    from evdev import ecodes

    name = ecodes.BTN.get(code) or ecodes.KEY.get(code) or str(code)
    if isinstance(name, list):
        return "/".join(name)
    return str(name)


def list_input_devices() -> int:
    from evdev import InputDevice, ecodes

    readable = 0
    denied = 0
    default_codes = {
        evdev_trigger_code(name)
        for name in ["BTN_SIDE", "BTN_EXTRA", "KEY_SPACE", "KEY_BACK", "KEY_FORWARD"]
    }

    print("Input devices:")
    for device_path in input_event_paths():
        try:
            device = InputDevice(device_path)
        except PermissionError as exc:
            denied += 1
            print(f"  {device_path}: permission denied ({exc})")
            continue
        except OSError as exc:
            print(f"  {device_path}: unavailable ({exc})")
            continue

        readable += 1
        keys = set(device.capabilities().get(ecodes.EV_KEY, []))
        interesting = sorted(default_codes & keys)
        suffix = ""
        if interesting:
            suffix = " | " + ", ".join(evdev_code_name(code) for code in interesting)
        print(f"  {device_path}: {device.name}{suffix}")
        device.close()

    groups = set()
    for group_id in os.getgroups():
        try:
            groups.add(grp.getgrgid(group_id).gr_name)
        except KeyError:
            groups.add(str(group_id))
    print()
    print(f"Readable devices: {readable}")
    print(f"Permission denied: {denied}")
    print(f"Groups: {', '.join(sorted(groups))}")
    if denied and "input" not in groups:
        print('Hint: add your user to input, then log out/in: sudo usermod -aG input "$USER"')
    return 0


def watch_input_events(seconds: float) -> int:
    from evdev import InputDevice, ecodes

    selector = selectors.DefaultSelector()
    devices = []
    for device_path in input_event_paths():
        try:
            device = InputDevice(device_path)
            selector.register(device.fd, selectors.EVENT_READ, device)
            devices.append(device)
        except OSError:
            continue

    if not devices:
        print("No readable input devices.")
        return 2

    print(f"Watching readable input devices for {seconds:g}s. Press side buttons or Space.")
    end_time = time.monotonic() + seconds
    try:
        while time.monotonic() < end_time:
            timeout = max(0.0, min(0.2, end_time - time.monotonic()))
            for selector_key, _ in selector.select(timeout=timeout):
                device = selector_key.data
                for event in device.read():
                    if event.type == ecodes.EV_KEY and event.value == 1:
                        print(
                            f"{device.path}: {device.name}: {evdev_code_name(event.code)}",
                            flush=True,
                        )
    finally:
        for device in devices:
            device.close()
    return 0


def start_toggle_listener(program: MacroProgram, state: RuntimeState) -> threading.Thread:
    thread = threading.Thread(
        target=listen_for_toggle_button,
        args=(program, state),
        name="macro-toggle-listener",
        daemon=True,
    )
    thread.start()
    return thread


def listen_for_toggle_button(program: MacroProgram, state: RuntimeState) -> None:
    selector = selectors.DefaultSelector()
    devices = []
    try:
        from evdev import InputDevice, ecodes

        trigger_codes = {
            evdev_trigger_code(trigger_name): trigger_name
            for trigger_name in program.toggle_buttons
        }
        errors = []

        for device_path in input_event_paths():
            try:
                device = InputDevice(device_path)
                device_name = device.name or ""
                if "ydotool" in device_name.lower():
                    device.close()
                    continue
                keys = device.capabilities().get(ecodes.EV_KEY, [])
                if not any(code in keys for code in trigger_codes):
                    device.close()
                    continue
                if program.grab_toggle_device:
                    device.grab()
                selector.register(device.fd, selectors.EVENT_READ, device)
                devices.append(device)
            except OSError as exc:
                errors.append(f"{device_path}: {exc}")

        if not devices:
            detail = "; ".join(errors[:3])
            suffix = f" ({detail})" if detail else ""
            state.set_message(f"toggle listener unavailable{suffix}")
            return

        state.set_message(f"listening for {', '.join(program.toggle_buttons)}")
        last_toggle = 0.0
        while not state.stop_event.is_set():
            for key, _ in selector.select(timeout=0.2):
                device = key.data
                for event in device.read():
                    if (
                        event.type == ecodes.EV_KEY
                        and event.code in trigger_codes
                        and event.value == 1
                    ):
                        now = time.monotonic()
                        if now - last_toggle >= 0.25:
                            state.toggle(trigger_codes[event.code])
                            last_toggle = now
    except Exception as exc:
        state.set_message(f"toggle listener error: {exc}")
    finally:
        try:
            for map_key in list(selector.get_map().values()):
                device = map_key.data
                if program.grab_toggle_device:
                    try:
                        device.ungrab()
                    except OSError:
                        pass
                device.close()
        except Exception:
            pass


def run_tui(program: MacroProgram, state: RuntimeState) -> int:
    return curses.wrapper(tui_main, program, state)


def tui_main(stdscr, program: MacroProgram, state: RuntimeState) -> int:
    try:
        curses.curs_set(0)
    except curses.error:
        pass
    stdscr.nodelay(True)
    while not state.stop_event.is_set():
        key = stdscr.getch()
        if key in {ord("q"), ord("Q")}:
            state.stop("quit from tui")
            break

        draw_tui(stdscr, program, state)
        time.sleep(0.1)
    return 0


def draw_tui(stdscr, program: MacroProgram, state: RuntimeState) -> None:
    stdscr.erase()
    height, width = stdscr.getmaxyx()
    running, last_event = state.snapshot()
    status = "RUNNING" if running else "PAUSED"

    lines = [
        f"Macro: {program.name}",
        f"Status: {status}",
        f"Backend: {program.backend}",
        f"Toggle: {', '.join(program.toggle_buttons)}",
        "",
        "Description:",
        f"  {program.description}",
        "",
        "Tasks:",
    ]
    lines.extend(f"  - {task.description}" for task in program.tasks)
    lines.extend(
        [
            "",
            f"Last event: {last_event}",
            "",
            "Controls: side/extra mouse buttons or global Space toggle, q quits",
        ]
    )

    for row, line in enumerate(lines[: max(0, height - 1)]):
        clipped = line[: max(0, width - 1)]
        stdscr.addstr(row, 0, clipped)
    stdscr.refresh()


def run_macro_program(program: MacroProgram, tui: bool) -> int:
    try:
        backend_name = choose_backend(program.backend)
        program.backend = backend_name
        tasks = build_tasks(backend_name, program.tasks)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    state = RuntimeState(program.start_running)
    scheduler = threading.Thread(
        target=run_program_schedule,
        args=(tasks, state),
        name="macro-scheduler",
        daemon=True,
    )
    scheduler.start()
    start_toggle_listener(program, state)

    try:
        if tui:
            return run_tui(program, state)
        print(f"Macro loaded: {program.name}", flush=True)
        print(program.description, flush=True)
        print("Side/extra mouse buttons or global Space toggle. Press Ctrl+C to quit.", flush=True)
        while not state.stop_event.is_set():
            time.sleep(0.2)
        return 0
    except KeyboardInterrupt:
        state.stop("stopped by Ctrl+C")
        return 0
    finally:
        state.stop("shutting down")
        scheduler.join(timeout=1)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Press a keyboard key repeatedly until Ctrl+C is pressed."
    )
    parser.add_argument(
        "script",
        nargs="?",
        type=Path,
        help="Optional .macro script to run with the TUI.",
    )
    parser.add_argument(
        "--key",
        type=parse_key,
        default="space",
        help="Key to press. Default: space. Examples: a, enter, tab, left",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=1.0,
        help="Seconds between key presses. Default: 1.0",
    )
    parser.add_argument(
        "--press",
        action="append",
        type=parse_press,
        metavar="KEY:SECONDS",
        help=(
            "Add a scheduled key press. Can be used multiple times. "
            "Example: --press r:1 --press a:0.2"
        ),
    )
    parser.add_argument(
        "--backend",
        choices=("auto", "ydotool", "xdotool", "pynput"),
        default="auto",
        help="Input backend. Default: auto. Use ydotool on Wayland.",
    )
    parser.add_argument(
        "--no-tui",
        action="store_true",
        help="Run a .macro script without the TUI.",
    )
    parser.add_argument(
        "--list-inputs",
        action="store_true",
        help="List readable input devices and useful global toggle keys/buttons.",
    )
    parser.add_argument(
        "--watch-inputs",
        nargs="?",
        const=10.0,
        type=float,
        metavar="SECONDS",
        help="Print global input key/button names for a few seconds.",
    )
    args = parser.parse_args()

    if args.list_inputs:
        return list_input_devices()

    if args.watch_inputs is not None:
        if args.watch_inputs <= 0:
            parser.error("--watch-inputs must be greater than 0")
        return watch_input_events(args.watch_inputs)

    if args.script:
        try:
            program = parse_macro_file(args.script)
        except Exception as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2
        return run_macro_program(program, tui=not args.no_tui)

    if args.interval <= 0:
        parser.error("--interval must be greater than 0")

    press_specs = args.press or [(args.key, args.interval)]

    try:
        backend_name = choose_backend(args.backend)
        actions = build_actions(backend_name, press_specs)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    schedule_text = ", ".join(f"{key} every {interval:g}s" for key, interval in press_specs)
    print(
        f"Macro running with {backend_name}: {schedule_text}. Press Ctrl+C to stop.",
        flush=True,
    )

    try:
        try:
            run_schedule(actions)
        except RuntimeError as exc:
            print(f"\nerror: {exc}", file=sys.stderr)
            return 2
    except KeyboardInterrupt:
        print("\nMacro stopped.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
