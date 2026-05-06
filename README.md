# LinuxMacro

English | [中文](README_zh.md)

LinuxMacro is the best gaming mouse macro software for Linux, built with Rust
and Tauri. It provides a polished desktop editor, a graphical macro builder, and
a scriptable macro runner in the same app. It edits a small line-based `.macro`
language, saves the configuration in a fixed Linux config directory, and runs
the macro engine without Python.

The app is Linux-only by design. It targets Wayland through `ydotool` and X11
through `xdotool`.

## Configuration Path

LinuxMacro does not take a config file path from the command line. The active
config file is always:

```text
~/.config/linuxmacro/config.macro
```

If an older config exists at `~/.config/mousemacro/config.macro`, LinuxMacro
copies it to the new path on first launch. The old file is not deleted.

## Features

- Desktop app and macro runner are the same Tauri application.
- Graphical macro editor for multiple independent macros, each with its own
  enable checkbox, drag-and-drop trigger assignment, and independent flows.
- Advanced script editor for direct `.macro` edits.
- Live syntax validation before saving.
- Debounced real-time writes to `~/.config/linuxmacro/config.macro`.
- Large center start/stop toggle button for the runtime.
- Catppuccin Mocha and Catppuccin Latte themes.
- English and Chinese interface switching. English is the default.
- Direct Rust backend detection for `ydotool` and `xdotool`.
- Optional in-app `ydotool` install/start helper with explicit authorization.

## How It Works

1. The UI is static HTML/CSS/JS in `ui/`; there is no npm build step.
2. The desktop shell is Tauri. JavaScript calls Rust commands through Tauri IPC.
3. Rust loads and saves `~/.config/linuxmacro/config.macro`.
4. Every save parses the script first. Invalid scripts are rejected instead of
   being written over the active config.
5. The runtime parses the same config file and starts one scheduler per enabled
   macro.
6. Trigger keys are read globally from Linux `/dev/input/event*`; pressing a
   trigger toggles only the macro that owns that trigger.
7. On Wayland, key and mouse injection use `ydotool`; on X11 they can use
   `xdotool key ...` and `xdotool click ...`.
8. `ydotool` and `xdotool` are launched directly as child processes from Rust.
   Python is not used.
9. The optional installer runs package-manager commands in a blocking worker
   thread so the UI stays responsive while authorization, downloads, or package
   locks are pending.

## Install From Source

### 1. Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

### 2. Install Linux desktop build dependencies

Exact package names vary by distribution. Typical packages are:

```bash
# Arch Linux / Manjaro
sudo pacman -S --needed base-devel curl wget file openssl webkit2gtk-4.1 \
  gtk3 libayatana-appindicator librsvg

# Debian / Ubuntu
sudo apt-get update
sudo apt-get install -y build-essential curl wget file libssl-dev \
  libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev

# Fedora
sudo dnf install -y gcc gcc-c++ make curl wget file openssl-devel gtk3-devel \
  webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel

# openSUSE
sudo zypper install -y patterns-devel-base-devel_basis curl wget file \
  openssl-devel gtk3-devel webkit2gtk4-devel libappindicator3-devel librsvg-devel
```

If a package name differs on your distribution, install the equivalent Tauri v2
Linux dependencies: GTK 3, WebKitGTK 4.1, OpenSSL, AppIndicator, librsvg, and
basic build tools.

### 3. Run the desktop app

```bash
cargo run -p linuxmacro-app
```

### 4. Optional CLI

```bash
cargo run -p linuxmacro -- init
cargo run -p linuxmacro -- check
cargo run -p linuxmacro -- run
cargo run -p linuxmacro -- list-inputs
```

## Input Backends

### Wayland: `ydotool`

Wayland normally blocks synthetic input from ordinary applications, so
LinuxMacro uses `ydotool` through `ydotoold`.

The app can try to install `ydotool` from the UI. This is not silent: it uses
`pkexec` or PackageKit where available and still requires your administrator
authorization.

Manual installation commands:

```bash
# Arch Linux / Manjaro - official repo, no yay required
sudo pacman -S --needed --noconfirm ydotool

# Debian / Ubuntu
sudo sh -lc 'apt-get update && apt-get install -y ydotool'

# Fedora
sudo dnf install -y ydotool

# openSUSE
sudo zypper --non-interactive install -y ydotool

# Alpine
sudo apk add ydotool

# Void Linux
sudo xbps-install -Sy ydotool

# Solus
sudo eopkg install -y ydotool

# PackageKit fallback, when supported by your desktop/distro
pkcon install -y ydotool
```

Start the user service:

```bash
systemctl --user enable --now ydotool.service
```

If your distribution does not ship a systemd user service, start `ydotoold`
using your distribution's documented method and make sure the daemon can access
`/dev/uinput`.

### X11: `xdotool`

On X11, `xdotool` can be used instead:

```bash
# Arch Linux
sudo pacman -S --needed xdotool

# Debian / Ubuntu
sudo apt-get install -y xdotool

# Fedora
sudo dnf install -y xdotool
```

Use `backend auto` to let LinuxMacro choose, or set `backend ydotool` /
`backend xdotool` explicitly in the script.

## Permissions

LinuxMacro needs two different kinds of Linux access:

- Reading toggle keys: the app scans `/dev/input/event*`. If devices are not
  readable, add your user to the `input` group on a machine you control and log
  out/in:

  ```bash
  sudo usermod -aG input "$USER"
  ```

- Injecting keys on Wayland: `ydotoold` needs access to `/dev/uinput`. The
  distro package/service usually handles this. If key injection fails, check:

  ```bash
  systemctl --user status ydotool.service
  ```

## Macro Script

The `.macro` format is line based:

```text
backend auto

macro "Left clicker" {
  description Toggle left click every 50ms with the side button.
  enabled on
  trigger side
  start paused
  every 50ms click left
}

macro "R then A" {
  description Toggle a sequence with the extra button.
  enabled on
  trigger extra
  start paused

  sequence 3s {
    press r
    wait 200ms
    click left
    press a
  }
}
```

Supported statements:

- Top level: `backend auto|ydotool|xdotool`
- Macro block: `macro "name" { ... }`
- Per macro: `description <text>`
- Per macro: `enabled on|off`
- Per macro: `trigger side|extra|browserback|browserforward|f1..f12|BTN_SIDE|BTN_EXTRA|KEY_F1`
- Per macro: `start paused|running`
- Per macro: `every <duration> press <key>`
- Per macro: `every <duration> click left|right|middle|side|extra`
- Per macro: `every <duration> hold <duration> press <key>`
- Per macro: `every <duration> hold <duration> click left|right|middle|side|extra`
- Per macro: `sequence <duration> { ... }` with `press <key>`, `click <button>`, `hold <duration> press|click <target>`, and `wait <duration>`

Durations can be `1`, `1s`, or `200ms`.

In the graphical editor, actions do not require choosing keyboard versus mouse.
Targets such as `left`, `right`, `middle`, `side`, and `extra` are treated as
mouse buttons; everything else is treated as a keyboard key. If you need to
force an ambiguous target, use `key:left` or `mouse:left`.

Each enabled macro must use different trigger keys. The parser rejects configs
where two enabled macros share the same trigger, because one physical button
should not toggle two different macros accidentally. Disabled macros may keep
their old triggers until you enable them. The graphical editor intentionally
offers only safer trigger keys: side/extra mouse buttons, browser back/forward,
and F1-F12. It does not offer letters, digits, space, or primary mouse clicks
as enable keys.

Legacy single-macro configs using top-level `name`, `toggle`, `every`, and
`sequence` are still accepted and are converted by the graphical editor into a
single `macro "name" { ... }` block on save.

## Development Checks

```bash
cargo fmt --all
node --check ui/main.js
cargo check --workspace
```

## Troubleshooting

- UI says `ydotool` is missing: install it with the in-app button or one of the
  manual commands above.
- The install button appears slow: package managers can wait on admin
  authorization, network, mirrors, or package locks; the task runs in the
  background so the UI should remain usable.
- Toggle keys do not work: run `cargo run -p linuxmacro -- list-inputs` and
  check whether `/dev/input/event*` devices are readable.
- Key injection fails on Wayland: check `ydotool.service` and `/dev/uinput`
  access.
