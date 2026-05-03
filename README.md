# LinuxMacro

English | [中文](README_zh.md)

LinuxMacro is a Linux desktop macro editor and runner built with Rust and
Tauri. It edits a small line-based `.macro` language, saves the configuration in
a fixed Linux config directory, and runs the macro engine from the same desktop
app.

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
- Graphical macro editor for enabling macros, selecting toggle keys, and editing
  loop/sequence flows.
- Advanced script editor for direct `.macro` edits.
- Live syntax validation before saving.
- Debounced real-time writes to `~/.config/linuxmacro/config.macro`.
- Large center start/stop toggle button for the runtime.
- Catppuccin Mocha and Catppuccin Latte themes.
- Direct Rust backend detection for `ydotool` and `xdotool`.
- Optional in-app `ydotool` install/start helper with explicit authorization.

## How It Works

1. The UI is static HTML/CSS/JS in `ui/`; there is no npm build step.
2. The desktop shell is Tauri. JavaScript calls Rust commands through Tauri IPC.
3. Rust loads and saves `~/.config/linuxmacro/config.macro`.
4. Every save parses the script first. Invalid scripts are rejected instead of
   being written over the active config.
5. The runtime parses the same config file and starts a background scheduler
   thread.
6. Toggle keys are read globally from Linux `/dev/input/event*`.
7. On Wayland, key injection uses `ydotool key ...`; on X11 it can use
   `xdotool key ...`.
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
name R and A demo
description Press r every 1s and a every 0.4s.
enabled on
backend auto
toggle side extra space browserback browserforward
grab off
start paused

every 1s press r
every 0.4s press a

sequence 3s {
  press r
  wait 200ms
  press a
}
```

Supported statements:

- `name <text>`
- `description <text>`
- `enabled on|off`
- `backend auto|ydotool|xdotool`
- `toggle side|extra|space|browserback|browserforward|BTN_SIDE|BTN_EXTRA|KEY_SPACE`
- `grab on|off`
- `start paused|running`
- `every <duration> press <key>`
- `sequence <duration> { ... }` with `press <key>` and `wait <duration>`

Durations can be `1`, `1s`, or `200ms`.

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
