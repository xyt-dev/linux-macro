# LinuxMacro

[English](README.md) | 中文

LinuxMacro 是 Linux 上最好的游戏鼠标宏软件，使用 Rust + Tauri 实现。它把精致的桌面编辑器、
图形化宏流程编辑和可脚本化宏运行器放在同一个应用里，用简单的行式 `.macro` 脚本描述宏，
在固定的 Linux 配置目录中实时保存配置，并且不依赖 Python。

这个项目只面向 Linux。Wayland 下使用 `ydotool`，X11 下可使用 `xdotool`。

## 配置文件路径

LinuxMacro 不通过命令行参数传入配置文件。当前配置文件固定为：

```text
~/.config/linuxmacro/config.macro
```

如果旧配置 `~/.config/mousemacro/config.macro` 存在，LinuxMacro 首次启动时会复制到新路径。
旧文件不会被删除。

## 功能

- 桌面应用和宏运行器是同一个 Tauri 应用。
- 图形宏编辑器：启用/禁用宏、选择触发键、编辑循环和序列流程。
- 高级脚本编辑器：直接编辑 `.macro`。
- 保存前实时语法校验，语法错误不会覆盖当前配置。
- 防抖实时写入 `~/.config/linuxmacro/config.macro`。
- 控制台中间的大号圆形启动/停止切换按钮。
- Catppuccin Mocha 和 Catppuccin Latte 两套主题。
- Rust 直接检测并调用 `ydotool` / `xdotool`。
- 可选的应用内 `ydotool` 安装/启动辅助，需要明确管理员授权。

## 原理

1. 前端是 `ui/` 下的静态 HTML/CSS/JS，不需要 npm 构建。
2. 桌面壳是 Tauri，JavaScript 通过 Tauri IPC 调 Rust 命令。
3. Rust 固定读取和写入 `~/.config/linuxmacro/config.macro`。
4. 每次保存前都会先解析脚本；解析失败时拒绝写入，避免坏配置覆盖可用配置。
5. 运行器解析同一个配置文件，并启动后台调度线程。
6. 全局触发键从 Linux `/dev/input/event*` 读取。
7. Wayland 下通过 `ydotool key ...` 注入按键；X11 下可通过 `xdotool key ...` 注入按键。
8. `ydotool` 和 `xdotool` 都是 Rust 直接启动的子进程，不经过 Python。
9. 应用内安装 `ydotool` 时，包管理器命令放在阻塞工作线程中执行；等待授权、下载或包管理器锁时不会卡死 UI。

## 从源码安装运行

### 1. 安装 Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

### 2. 安装 Linux 桌面构建依赖

不同发行版包名略有差异，常见命令如下：

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

如果你的发行版包名不同，安装等价的 Tauri v2 Linux 依赖即可：GTK 3、WebKitGTK 4.1、
OpenSSL、AppIndicator、librsvg 和基础编译工具。

### 3. 启动桌面应用

```bash
cargo run -p linuxmacro-app
```

### 4. 可选 CLI

```bash
cargo run -p linuxmacro -- init
cargo run -p linuxmacro -- check
cargo run -p linuxmacro -- run
cargo run -p linuxmacro -- list-inputs
```

## 输入后端

### Wayland：`ydotool`

Wayland 通常不允许普通应用随意模拟输入，所以 LinuxMacro 通过 `ydotool` 和 `ydotoold`
实现按键注入。

应用内可以尝试安装 `ydotool`。这不是静默安装：它会使用 `pkexec` 或 PackageKit，并且仍然需要你明确授权管理员权限。

手动安装命令：

```bash
# Arch Linux / Manjaro：官方仓库，不需要 yay
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

# PackageKit fallback，取决于桌面环境/发行版是否支持
pkcon install -y ydotool
```

启动用户服务：

```bash
systemctl --user enable --now ydotool.service
```

如果你的发行版没有提供 systemd 用户服务，请按发行版文档启动 `ydotoold`，并确保它能访问
`/dev/uinput`。

### X11：`xdotool`

X11 下可以使用 `xdotool`：

```bash
# Arch Linux
sudo pacman -S --needed xdotool

# Debian / Ubuntu
sudo apt-get install -y xdotool

# Fedora
sudo dnf install -y xdotool
```

脚本里可以用 `backend auto` 自动选择，也可以显式写 `backend ydotool` 或 `backend xdotool`。

## 权限说明

LinuxMacro 需要两类 Linux 权限：

- 读取触发键：应用会扫描 `/dev/input/event*`。如果设备不可读，可以在你控制的机器上把当前用户加入 `input` 组，然后注销重新登录：

  ```bash
  sudo usermod -aG input "$USER"
  ```

- Wayland 注入按键：`ydotoold` 需要访问 `/dev/uinput`。发行版包和服务通常会处理这部分权限。按键注入失败时先检查：

  ```bash
  systemctl --user status ydotool.service
  ```

## 宏脚本

`.macro` 是行式格式：

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

支持的语句：

- `name <text>`
- `description <text>`
- `enabled on|off`
- `backend auto|ydotool|xdotool`
- `toggle side|extra|space|browserback|browserforward|BTN_SIDE|BTN_EXTRA|KEY_SPACE`
- `grab on|off`
- `start paused|running`
- `every <duration> press <key>`
- `sequence <duration> { ... }`，块内支持 `press <key>` 和 `wait <duration>`

时间可以写成 `1`、`1s` 或 `200ms`。

## 开发检查

```bash
cargo fmt --all
node --check ui/main.js
cargo check --workspace
```

## 常见问题

- 界面提示缺少 `ydotool`：使用应用内按钮安装，或按上面的发行版命令手动安装。
- 安装按钮等待较久：包管理器可能在等待授权、网络、镜像或包管理器锁；安装任务在后台运行，UI 不应该卡死。
- 触发键无效：运行 `cargo run -p linuxmacro -- list-inputs`，检查 `/dev/input/event*` 是否可读。
- Wayland 下无法注入按键：检查 `ydotool.service` 和 `/dev/uinput` 权限。
