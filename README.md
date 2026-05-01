# macrotest

Keyboard loop macro managed by uv.

## Arch Linux Wayland

If your session is Wayland, `pynput` usually cannot inject keys into native
Wayland windows. Install and start `ydotool` first:

```bash
sudo pacman -S --needed ydotool
systemctl --user enable --now ydotool.service
```

Then run the macro with the Wayland backend:

```bash
uv run key-loop-macro --backend ydotool
```

## Run

Run the TUI macro script. It starts paused; use either mouse side button or
global `Space` to toggle:

```bash
uv run key-loop-macro macros/ra.macro
```

TUI controls:

- mouse `side` / `extra` buttons toggle running/paused
- global `Space` toggles running/paused
- `q` quits

If the TUI says `toggle listener unavailable`, the process cannot read the
keyboard/mouse event devices or no matching side/space device was found. Check
what the program can see:

```bash
uv run key-loop-macro --list-inputs
```

To identify the real name of your side button:

```bash
uv run key-loop-macro --watch-inputs 10
```

On a personal Arch machine, the simple fix for unreadable `/dev/input/event*`
devices is adding your user to the `input` group and logging out/in:

```bash
sudo usermod -aG input "$USER"
```

That group can read input events, so only do this on a machine you control.

Press Space once per second:

```bash
uv run key-loop-macro
```

Press a specific key:

```bash
uv run key-loop-macro --key a
```

Change the interval:

```bash
uv run key-loop-macro --key enter --interval 0.5
```

Schedule multiple keys independently:

```bash
uv run key-loop-macro --press r:1 --press a:0.2
```

Choose a backend explicitly:

```bash
uv run key-loop-macro --backend ydotool --key space --interval 1
```

The `pynput` backend is optional:

```bash
uv run --extra pynput key-loop-macro --backend pynput
```

Stop with `Ctrl+C` in the terminal.

## Macro Script

The `.macro` format is line based:

```text
name R and A demo
description Press r every 1s and a every 0.2s.
backend auto
toggle side extra space browserback browserforward
grab off
start paused

every 1s press r
every 0.2s press a

sequence 3s {
  press r
  wait 0.2s
  press a
}
```

Supported statements:

- `name <text>`
- `description <text>`
- `backend auto|ydotool|xdotool|pynput`
- `toggle side extra space`
- `toggle side|extra|space|browserback|browserforward|BTN_SIDE|BTN_EXTRA|KEY_SPACE`
- `grab on|off`
- `start paused|running`
- `every <duration> press <key>`
- `sequence <duration> { ... }` with `press <key>` and `wait <duration>`

Durations can be `1`, `1s`, or `200ms`.

Keep `grab off` for a normal mouse. `grab on` grabs the whole input device, not
only the side button.
