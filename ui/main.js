const tauriInvoke = window.__TAURI__?.core?.invoke;

const editor = document.querySelector("#editor");
const lineNumbers = document.querySelector("#lineNumbers");
const configPath = document.querySelector("#configPath");
const apiState = document.querySelector("#apiState");
const saveStatus = document.querySelector("#saveStatus");
const saveNowButton = document.querySelector("#saveNow");
const validationBadge = document.querySelector("#validationBadge");
const validationMessage = document.querySelector("#validationMessage");
const macroSummary = document.querySelector("#macroSummary");
const taskList = document.querySelector("#taskList");
const lineCount = document.querySelector("#lineCount");
const charCount = document.querySelector("#charCount");
const themeToggle = document.querySelector("#themeToggle");
const macroStateBadge = document.querySelector("#macroStateBadge");
const macroStateText = document.querySelector("#macroStateText");
const backendBadge = document.querySelector("#backendBadge");
const backendMessage = document.querySelector("#backendMessage");
const installYdotoolButton = document.querySelector("#installYdotool");
const powerToggleButton = document.querySelector("#powerToggle");
const powerButtonText = document.querySelector("#powerButtonText");
const tabButtons = document.querySelectorAll("[data-tab-target]");
const tabPages = document.querySelectorAll("[data-tab-page]");
const visualStatus = document.querySelector("#visualStatus");
const macroList = document.querySelector("#macroList");
const addMacroButton = document.querySelector("#addMacro");
const selectedMacroTitle = document.querySelector("#selectedMacroTitle");
const visualName = document.querySelector("#visualName");
const visualDescription = document.querySelector("#visualDescription");
const visualBackend = document.querySelector("#visualBackend");
const languageToggle = document.querySelector("#languageToggle");
const triggerSuggestions = document.querySelector("#triggerSuggestions");
const triggerChips = document.querySelector("#triggerChips");
const addFlowTaskButton = document.querySelector("#addFlowTask");
const flowTasks = document.querySelector("#flowTasks");

const TRIGGER_OPTIONS = [
  ["side", "BTN_SIDE", { en: "Mouse side button / mouse4 / back", zh: "鼠标侧键 / mouse4 / back" }],
  ["extra", "BTN_EXTRA", { en: "Mouse extra button / mouse5 / forward", zh: "鼠标额外键 / mouse5 / forward" }],
  ["browserback", "KEY_BACK", { en: "Browser back", zh: "浏览器后退" }],
  ["browserforward", "KEY_FORWARD", { en: "Browser forward", zh: "浏览器前进" }],
  ...Array.from({ length: 12 }, (_, index) => {
    const key = `f${index + 1}`;
    return [key, `KEY_F${index + 1}`, { en: `Function key ${key.toUpperCase()}`, zh: `功能键 ${key.toUpperCase()}` }];
  }),
];

const ACTION_TARGET_OPTIONS = [
  ["left", { en: "Left mouse button", zh: "鼠标左键" }, "mouse1 / leftclick"],
  ["right", { en: "Right mouse button", zh: "鼠标右键" }, "mouse2 / rightclick"],
  ["middle", { en: "Middle mouse button", zh: "鼠标中键" }, "mouse3 / middleclick"],
  ["side", { en: "Mouse side button", zh: "鼠标侧键" }, "mouse4 / back"],
  ["extra", { en: "Mouse extra button", zh: "鼠标额外键" }, "mouse5 / forward"],
  ["space", { en: "Space", zh: "空格键" }, "keyboard"],
  ["enter", { en: "Enter", zh: "回车" }, "keyboard"],
  ["tab", "Tab", "keyboard"],
  ["esc", "Esc", "keyboard"],
  ["backspace", { en: "Backspace", zh: "退格" }, "keyboard"],
  ["delete", { en: "Delete", zh: "删除" }, "keyboard"],
  ["key:left", { en: "Arrow left", zh: "方向左" }, { en: "force keyboard", zh: "强制键盘" }],
  ["key:right", { en: "Arrow right", zh: "方向右" }, { en: "force keyboard", zh: "强制键盘" }],
  ["up", { en: "Arrow up", zh: "方向上" }, "keyboard"],
  ["down", { en: "Arrow down", zh: "方向下" }, "keyboard"],
  ["ctrl", "Ctrl", "keyboard"],
  ["shift", "Shift", "keyboard"],
  ["alt", "Alt", "keyboard"],
  ...Array.from("abcdefghijklmnopqrstuvwxyz", (key) => [key, { en: `Letter ${key.toUpperCase()}`, zh: `字母 ${key.toUpperCase()}` }, "keyboard"]),
  ...Array.from("0123456789", (key) => [key, { en: `Number ${key}`, zh: `数字 ${key}` }, "keyboard"]),
  ...Array.from({ length: 12 }, (_, index) => {
    const key = `f${index + 1}`;
    return [key, { en: `Function key ${key.toUpperCase()}`, zh: `功能键 ${key.toUpperCase()}` }, "keyboard"];
  }),
];

const I18N = {
  en: {
    "app.title": "Macro Console",
    "nav.aria": "Page navigation",
    "tab.control": "Control",
    "tab.visual": "Visual Editor",
    "tab.advanced": "Advanced Script",
    "api.title": "Desktop UI and Rust backend IPC state",
    "api.connecting": "Connecting backend",
    "api.connected": "Backend connected",
    "api.disconnected": "Backend disconnected",
    "control.runner": "Macro Runner",
    "control.notRunningCopy": "Click start to read the current config file and run all enabled macros.",
    "config.title": "Config File",
    "config.copy": "Always reads and writes the Linux config directory. No command-line file path is needed.",
    "backend.title": "Input Backend",
    "backend.copy": "Rust launches ydotool/xdotool directly. Python is not used.",
    "backend.install": "Install/Start ydotool",
    "backend.checking": "Checking",
    "backend.unknown": "Unknown",
    "backend.missing": "Missing backend",
    "backend.error": "Error",
    "backend.installing": "Installing",
    "backend.installFailed": "Install failed",
    "backend.session": "Session",
    "backend.installed": "installed",
    "backend.notInstalled": "not installed",
    "backend.manualInstall": "Unrecognized package manager. Install ydotool manually.",
    "backend.installHint": "Command: {command}",
    "backend.installAuth": "Requesting administrator authorization to install ydotool. Confirm the system prompt.",
    "theme.title": "Theme",
    "theme.copy": "Switch between Catppuccin Mocha and Light themes.",
    "theme.light": "Light",
    "theme.mocha": "Mocha",
    "language.title": "Language",
    "language.copy": "Switch the interface language. English is the default.",
    "language.toggle": "中文",
    "visual.title": "Visual Editor",
    "macroList.title": "Macros",
    "macroList.add": "Add Macro",
    "macroList.enabled": "Enabled",
    "macroList.noTriggers": "No triggers",
    "macroList.deleteAria": "Delete macro",
    "macroSettings.title": "Macro Settings: {name}",
    "field.name": "Name",
    "field.namePlaceholder": "Macro name",
    "field.description": "Description",
    "field.descriptionPlaceholder": "Macro description",
    "field.backend": "Global Backend",
    "triggers.title": "Trigger Keys",
    "triggers.copy": "Drag to a macro card on the left, or click to toggle it for the current macro. Only side buttons, browser keys, and F1-F12 are offered.",
    "triggers.disableFirst": "Disable this macro before removing its last trigger.",
    "triggers.usedBy": " · used by {name}",
    "flow.title": "Independent Flows",
    "flow.addIndependent": "Add Independent Flow",
    "flow.independent": "Independent Flow",
    "flow.tapFlow": "Tap Flow",
    "flow.holdFlow": "Hold Flow",
    "flow.sequenceFlow": "Sequence Flow",
    "flow.delete": "Delete flow",
    "flow.action": "Action",
    "flow.tap": "Tap",
    "flow.hold": "Hold",
    "flow.wait": "Wait",
    "flow.periodSeconds": "Period (s)",
    "flow.waitSeconds": "Wait (s)",
    "flow.addAction": "Add Action",
    "flow.addWait": "Add Wait",
    "flow.deleteStep": "Delete step",
    "advanced.title": "Advanced Script",
    "save.now": "Save Now",
    "editor.placeholder": "Loading ~/.config/linuxmacro/config.macro...",
    "snippets.title": "Quick Insert",
    "snippets.independentFlow": "Independent Flow",
    "snippets.mouseAction": "Mouse Flow",
    "snippets.holdAction": "Hold Flow",
    "snippets.sequence": "Multi-step Flow",
    "snippets.macroBlock": "Macro Block",
    "validation.title": "Validation",
    "validation.unchecked": "Unchecked",
    "validation.valid": "Valid",
    "validation.invalid": "Invalid",
    "validation.default": "Save to show parse results here.",
    "validation.success": "Parsed: {macros} macros, {tasks} flows, {lines} lines.",
    "validation.fix": "Fix syntax errors to show macro info.",
    "summary.title": "Macro Info",
    "summary.empty": "No macro info.",
    "summary.backend": "Backend",
    "summary.macros": "Macros",
    "summary.tasks": "Flows",
    "summary.triggers": "Triggers",
    "summary.enabledCount": "{enabled}/{total} enabled",
    "summary.taskCount": "{count} flows",
    "tasks.title": "Flow Preview",
    "tasks.empty": "No flow preview.",
    "syntax.title": "Syntax Quick Reference",
    "status.notRunning": "Not Running",
    "status.stopped": "Stopped",
    "status.running": "Running",
    "status.paused": "Paused",
    "status.error": "Error",
    "status.reloadFailed": "Reload failed",
    "status.waitingLoad": "Waiting to load",
    "status.runtime": "{name} · {backend} · {enabled}/{total} macros enabled · {tasks} flows · {event}",
    "power.start": "Start",
    "power.stop": "Stop",
    "power.startAria": "Start macro",
    "power.stopAria": "Stop macro",
    "counts.lines": "{count} lines",
    "counts.chars": "{count} chars",
    "save.waiting": "Waiting to save",
    "save.checking": "Checking…",
    "save.saved": "Saved {time}",
    "save.savedReloading": "Saved, reloading runner…",
    "save.savedReloaded": "Saved and reloaded {time}",
    "save.syntaxOk": "Syntax OK, saved {time}",
    "save.syntaxReloaded": "Syntax OK, reloaded {time}",
    "save.syntaxError": "Syntax error, not saved",
    "save.reloadFailed": "Saved, reload failed",
    "save.synced": "Synced, waiting to save",
    "load.loaded": "Loaded",
    "load.failed": "Load failed",
    "load.syntaxError": "Config has syntax errors",
    "runtime.oldConfig": "Still using the previous runtime config: {message}",
    "install.installingButton": "Installing…",
  },
  zh: {
    "app.title": "宏控制台",
    "nav.aria": "页面切换",
    "tab.control": "控制台",
    "tab.visual": "图形编辑",
    "tab.advanced": "高级脚本",
    "api.title": "桌面界面和 Rust 后端通信状态",
    "api.connecting": "正在连接后端",
    "api.connected": "后端已连接",
    "api.disconnected": "后端未连接",
    "control.runner": "宏运行器",
    "control.notRunningCopy": "点击启动会读取当前配置文件，并运行所有已启用宏。",
    "config.title": "配置文件",
    "config.copy": "固定读取和写入 Linux 配置目录，无需命令行手动传入。",
    "backend.title": "输入后端",
    "backend.copy": "Rust 会直接启动 ydotool/xdotool 进程，不通过 Python。",
    "backend.install": "安装/启动 ydotool",
    "backend.checking": "检测中",
    "backend.unknown": "未知",
    "backend.missing": "缺少后端",
    "backend.error": "错误",
    "backend.installing": "安装中",
    "backend.installFailed": "安装失败",
    "backend.session": "会话",
    "backend.installed": "已安装",
    "backend.notInstalled": "未安装",
    "backend.manualInstall": "未识别包管理器，请手动安装 ydotool。",
    "backend.installHint": "可执行：{command}",
    "backend.installAuth": "正在请求管理员授权安装 ydotool，请确认系统弹窗。",
    "theme.title": "主题",
    "theme.copy": "在 Catppuccin Mocha 和 Light 配色之间切换。",
    "theme.light": "Light",
    "theme.mocha": "Mocha",
    "language.title": "语言",
    "language.copy": "切换界面语言。默认使用英文。",
    "language.toggle": "English",
    "visual.title": "图形编辑",
    "macroList.title": "宏列表",
    "macroList.add": "新增宏",
    "macroList.enabled": "启用",
    "macroList.noTriggers": "未设置触发键",
    "macroList.deleteAria": "删除宏",
    "macroSettings.title": "宏设置：{name}",
    "field.name": "名称",
    "field.namePlaceholder": "宏名称",
    "field.description": "描述",
    "field.descriptionPlaceholder": "宏说明",
    "field.backend": "全局后端",
    "triggers.title": "启用键",
    "triggers.copy": "拖到左侧宏卡片分配，或点击为当前宏切换启用。只提供侧键、浏览器键和 F1-F12。",
    "triggers.disableFirst": "请先关闭这个宏，再取消最后一个启用键。",
    "triggers.usedBy": " · 已由 {name} 使用",
    "flow.title": "独立流程",
    "flow.addIndependent": "添加新独立流程",
    "flow.independent": "独立流程",
    "flow.tapFlow": "短按流程",
    "flow.holdFlow": "保持流程",
    "flow.sequenceFlow": "多步骤流程",
    "flow.delete": "删除流程",
    "flow.action": "动作",
    "flow.tap": "短按",
    "flow.hold": "保持",
    "flow.wait": "等待",
    "flow.periodSeconds": "周期(s)",
    "flow.waitSeconds": "等待(s)",
    "flow.addAction": "添加动作",
    "flow.addWait": "添加等待",
    "flow.deleteStep": "删除步骤",
    "advanced.title": "高级脚本",
    "save.now": "立即保存",
    "editor.placeholder": "正在加载 ~/.config/linuxmacro/config.macro...",
    "snippets.title": "快速插入",
    "snippets.independentFlow": "独立流程",
    "snippets.mouseAction": "鼠标流程",
    "snippets.holdAction": "保持流程",
    "snippets.sequence": "多步骤流程",
    "snippets.macroBlock": "宏块",
    "validation.title": "校验结果",
    "validation.unchecked": "未校验",
    "validation.valid": "有效",
    "validation.invalid": "有错误",
    "validation.default": "保存后会在这里显示解析结果。",
    "validation.success": "解析成功：{macros} 个宏，{tasks} 个流程，{lines} 行。",
    "validation.fix": "修正语法后显示宏信息。",
    "summary.title": "宏信息",
    "summary.empty": "暂无宏信息。",
    "summary.backend": "后端",
    "summary.macros": "宏数量",
    "summary.tasks": "流程",
    "summary.triggers": "触发",
    "summary.enabledCount": "{enabled}/{total} 启用",
    "summary.taskCount": "{count} 个流程",
    "tasks.title": "流程预览",
    "tasks.empty": "暂无流程预览。",
    "syntax.title": "语法速查",
    "status.notRunning": "未运行",
    "status.stopped": "已停止",
    "status.running": "运行中",
    "status.paused": "已暂停",
    "status.error": "错误",
    "status.reloadFailed": "重载失败",
    "status.waitingLoad": "等待加载",
    "status.runtime": "{name} · {backend} · {enabled}/{total} 个宏启用 · {tasks} 个流程 · {event}",
    "power.start": "启动",
    "power.stop": "停止",
    "power.startAria": "启动宏",
    "power.stopAria": "停止宏",
    "counts.lines": "{count} 行",
    "counts.chars": "{count} 字符",
    "save.waiting": "等待保存",
    "save.checking": "正在校验…",
    "save.saved": "已保存 {time}",
    "save.savedReloading": "已保存，正在重载运行器…",
    "save.savedReloaded": "已保存并重载 {time}",
    "save.syntaxOk": "语法正确，已保存 {time}",
    "save.syntaxReloaded": "语法正确，已重载 {time}",
    "save.syntaxError": "语法错误，未保存",
    "save.reloadFailed": "已保存，重载失败",
    "save.synced": "已同步，等待保存",
    "load.loaded": "已加载",
    "load.failed": "加载失败",
    "load.syntaxError": "配置有语法错误",
    "runtime.oldConfig": "当前仍在使用旧运行配置：{message}",
    "install.installingButton": "安装中…",
  },
};

const state = {
  saveTimer: null,
  validateToken: 0,
  language: localStorage.getItem("linuxmacro-language") || "en",
  currentPath: "~/.config/linuxmacro/config.macro",
  currentMacroStatus: null,
  visualModel: defaultVisualModel(),
  visualEditingTimer: null,
  visualEditing: false,
  draggedTrigger: null,
  reloadToken: 0,
  activeTargetInput: null,
  targetSuggestionIndex: 0,
  targetSuggestions: [],
  pendingSaveOptions: {},
};

const targetSuggestionMenu = document.createElement("div");
targetSuggestionMenu.className = "target-suggestion-menu";
targetSuggestionMenu.hidden = true;
document.body.appendChild(targetSuggestionMenu);

function invoke(command, args = {}) {
  if (!tauriInvoke) {
    return Promise.reject(new Error(t("api.disconnected")));
  }
  return tauriInvoke(command, args);
}

function t(key, values = {}) {
  const table = I18N[state.language] || I18N.en;
  const fallback = I18N.en[key] || key;
  const template = table[key] || fallback;
  return template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
}

function localized(value) {
  if (value && typeof value === "object") return value[state.language] || value.en || "";
  return String(value ?? "");
}

function setLanguage(language, options = {}) {
  state.language = language === "zh" ? "zh" : "en";
  localStorage.setItem("linuxmacro-language", state.language);
  document.documentElement.lang = state.language === "zh" ? "zh-CN" : "en";
  applyStaticTranslations();
  setTheme(document.documentElement.dataset.theme || "mocha");
  renderCounts();
  renderVisualEditor();
  if (state.currentMacroStatus) renderMacroStatus(state.currentMacroStatus);
  if (options.validate) validateDraft({ syncVisual: false });
}

function applyStaticTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    element.setAttribute("title", t(element.dataset.i18nTitle));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAria));
  });
  languageToggle.textContent = t("language.toggle");
}

function defaultVisualModel() {
  return {
    backend: "auto",
    selectedMacroIndex: 0,
    macros: [defaultMacro(0), defaultMacro(1)],
  };
}

function defaultMacro(index = 0) {
  const defaults = [
    {
      enabled: false,
      name: "Left clicker",
      description: "Toggle left click every 50ms with the side button.",
      triggerButtons: [],
      tasks: [{ type: "every", interval: 0.05, steps: [{ kind: "click", button: "left" }] }],
    },
    {
      enabled: false,
      name: "R burst",
      description: "Toggle r every 100ms with the extra button.",
      triggerButtons: [],
      tasks: [{ type: "every", interval: 0.1, steps: [{ kind: "press", key: "r" }] }],
    },
  ];
  if (defaults[index]) return JSON.parse(JSON.stringify(defaults[index]));
  return {
    enabled: false,
    name: `Macro ${index + 1}`,
    description: "",
    triggerButtons: [],
    tasks: [{ type: "every", interval: 1, steps: [{ kind: "press", key: "space" }] }],
  };
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("linuxmacro-theme", theme);
  themeToggle.textContent = theme === "mocha" ? t("theme.light") : t("theme.mocha");
}

function setSaveStatus(kind, text) {
  saveStatus.className = `status-pill ${kind}`;
  saveStatus.querySelector("span:last-child").textContent = text;
}

function setVisualStatus(kind, text) {
  visualStatus.className = `status-pill ${kind}`;
  visualStatus.querySelector("span:last-child").textContent = text;
}

function renderCounts() {
  const lines = editor.value.length ? editor.value.split("\n").length : 0;
  lineCount.textContent = t("counts.lines", { count: lines });
  charCount.textContent = t("counts.chars", { count: editor.value.length });
  lineNumbers.innerHTML = Array.from({ length: Math.max(lines, 1) }, (_, index) => {
    return `<span>${index + 1}</span>`;
  }).join("");
}

function renderValidation(report, options = {}) {
  const syncVisual = options.syncVisual ?? true;
  if (!report) {
    validationBadge.textContent = t("validation.unchecked");
    validationBadge.className = "pill";
    return;
  }

  if (report.ok) {
    validationBadge.textContent = t("validation.valid");
    validationBadge.className = "pill success";
    validationMessage.textContent = t("validation.success", {
      macros: report.macro_count ?? 0,
      tasks: report.task_count,
      lines: report.line_count,
    });
    renderProgram(report.program);
    if (syncVisual && !state.visualEditing) {
      syncVisualFromProgram(report.program);
    }
  } else {
    validationBadge.textContent = t("validation.invalid");
    validationBadge.className = "pill danger";
    validationMessage.textContent = report.error || t("validation.invalid");
    macroSummary.innerHTML = `<div class="empty">${escapeHtml(t("validation.fix"))}</div>`;
    taskList.innerHTML = `<div class="empty">${escapeHtml(t("tasks.empty"))}</div>`;
  }
}

function renderMacroStatus(status) {
  state.currentMacroStatus = status;

  if (!status?.active) {
    macroStateBadge.textContent = t("status.notRunning");
    macroStateBadge.className = "pill";
    macroStateText.textContent = t("control.notRunningCopy");
    renderPowerButton(false);
    return;
  }

  if (status.stopped) {
    macroStateBadge.textContent = t("status.stopped");
    macroStateBadge.className = "pill danger";
  } else if (status.running) {
    macroStateBadge.textContent = t("status.running");
    macroStateBadge.className = "pill success";
  } else {
    macroStateBadge.textContent = t("status.paused");
    macroStateBadge.className = "pill";
  }

  const backend = status.backend || "unknown";
  const name = status.name || "unnamed";
  macroStateText.textContent = t("status.runtime", {
    name,
    backend,
    enabled: status.enabled_macro_count ?? 0,
    total: status.macro_count ?? 0,
    tasks: status.task_count,
    event: status.last_event,
  });
  renderPowerButton(!status.stopped);
}

function renderPowerButton(active) {
  powerToggleButton.classList.toggle("active", active);
  powerToggleButton.setAttribute("aria-label", active ? t("power.stopAria") : t("power.startAria"));
  powerButtonText.textContent = active ? t("power.stop") : t("power.start");
}

function renderBackendHealth(health) {
  if (!health) {
    backendBadge.textContent = t("backend.unknown");
    backendBadge.className = "pill";
    return;
  }

  if (health.ydotool_installed || health.xdotool_installed) {
    backendBadge.textContent = health.recommended_backend;
    backendBadge.className = "pill success";
  } else {
    backendBadge.textContent = t("backend.missing");
    backendBadge.className = "pill danger";
  }

  const installHint = health.install_command
    ? t("backend.installHint", { command: health.install_command })
    : t("backend.manualInstall");
  const notes = health.notes?.length ? ` ${health.notes.join(" ")}` : "";
  backendMessage.textContent = `${t("backend.session")}: ${health.session_type}\nydotool: ${
    health.ydotool_installed ? t("backend.installed") : t("backend.notInstalled")
  }; xdotool: ${health.xdotool_installed ? t("backend.installed") : t("backend.notInstalled")}\n${installHint}${notes}`;
  installYdotoolButton.disabled = health.ydotool_installed && health.systemctl_installed;
}

function renderProgram(program) {
  if (!program) {
    macroSummary.innerHTML = `<div class="empty">${escapeHtml(t("summary.empty"))}</div>`;
    taskList.innerHTML = `<div class="empty">${escapeHtml(t("tasks.empty"))}</div>`;
    return;
  }

  const macros = programMacros(program);
  const enabledCount = macros.filter((macro) => macro.enabled).length;
  const taskCount = macros.reduce((count, macro) => count + (macro.holds?.length || 0) + (macro.tasks?.length || 0), 0);
  macroSummary.innerHTML = [
    [t("summary.backend"), program.backend],
    [t("summary.macros"), t("summary.enabledCount", { enabled: enabledCount, total: macros.length })],
    [t("summary.tasks"), t("summary.taskCount", { count: taskCount })],
    [t("summary.triggers"), macros.map((macro) => `${macro.name}: ${(macro.trigger_buttons || []).join(", ")}`).join("; ")],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");

  const flowItems = macros.flatMap((macro, macroIndex) => {
    const holds = (macro.holds || []).map((hold) => describeProgramHold(hold));
    const tasks = (macro.tasks || []).map((task) => task.description);
    return [...holds, ...tasks].map((description, flowIndex) => {
      return `<div class="task-item">
        <span>${macroIndex + 1}.${flowIndex + 1}</span>
        <p><strong>${escapeHtml(macro.name)}</strong> · ${escapeHtml(description)}</p>
      </div>`;
    });
  });

  taskList.innerHTML = flowItems.length
    ? flowItems.join("")
    : `<div class="empty">${escapeHtml(t("tasks.empty"))}</div>`;
}

function describeProgramHold(hold) {
  if (hold.kind === "hold-click") return `hold click ${hold.button || "left"}`;
  return `hold press ${hold.key || "space"}`;
}

function syncVisualFromProgram(program) {
  if (!program) return;
  state.visualModel = programToVisualModel(program);
  renderVisualEditor();
}

function programToVisualModel(program) {
  const macros = programMacros(program).map((macro, index) => macroToVisualMacro(macro, index));
  return {
    backend: program.backend || "auto",
    selectedMacroIndex: Math.min(state.visualModel?.selectedMacroIndex || 0, Math.max(macros.length - 1, 0)),
    macros,
  };
}

function programMacros(program) {
  if (Array.isArray(program?.macros)) return program.macros;
  if (!program) return [];
  return [
    {
      enabled: program.enabled ?? true,
      name: program.name || "Macro",
      description: program.description || "",
      trigger_buttons: program.toggle_buttons || [],
      grab_toggle_device: program.grab_toggle_device ?? false,
      holds: program.holds || [],
      tasks: program.tasks || [],
    },
  ];
}

function macroToVisualMacro(macro, index) {
  const holdTasks = (macro.holds || []).map((hold) => {
    const step = hold.kind === "hold-click"
      ? { kind: "hold-click", button: hold.button || "left" }
      : { kind: "hold-key", key: hold.key || "space" };
    return { type: "hold", interval: 1, steps: [step] };
  });

  const scheduledTasks = (macro.tasks || []).map((task) => {
    const steps = (task.steps || []).map((step) => {
      if (step.kind === "wait") return { kind: "wait", seconds: Number(step.seconds) || 0.2 };
      if (step.kind === "click") return { kind: "click", button: step.button || "left" };
      return { kind: "press", key: step.key || "space" };
    });
    return {
      type: steps.length === 1 && isInputStep(steps[0]) ? "every" : "sequence",
      interval: Number(task.interval) || 1,
      steps: steps.length ? steps : [{ kind: "press", key: "space" }],
    };
  });

  return {
    enabled: macro.enabled ?? true,
    name: macro.name || `Macro ${index + 1}`,
    description: macro.description || "",
    triggerButtons: [...(macro.trigger_buttons || macro.toggle_buttons || [])],
    tasks: [...holdTasks, ...scheduledTasks],
  };
}

function renderVisualEditor() {
  const model = normalizeVisualModel(state.visualModel);
  const macro = currentMacro();
  selectedMacroTitle.textContent = t("macroSettings.title", { name: macro.name });
  visualName.value = macro.name;
  visualDescription.value = macro.description;
  visualBackend.value = model.backend;
  renderMacroList();
  renderTriggerChips();
  renderTriggerSuggestions();
  renderFlowTasks();
}

function normalizeVisualModel(model) {
  if (!Array.isArray(model.macros)) {
    model.macros = [
      {
        enabled: model.enabled ?? true,
        name: model.name || "Macro",
        description: model.description || "",
        triggerButtons: [...(model.toggleButtons || [])],
        tasks: model.tasks || [{ type: "every", interval: 1, steps: [{ kind: "press", key: "space" }] }],
      },
    ];
  }
  model.backend = ["auto", "ydotool", "xdotool"].includes(model.backend) ? model.backend : "auto";
  model.macros = model.macros.length ? model.macros : [defaultMacro(0)];
  model.selectedMacroIndex = clampIndex(model.selectedMacroIndex, model.macros.length);
  model.macros.forEach((macro, index) => normalizeVisualMacro(macro, index));
  return model;
}

function normalizeVisualMacro(macro, index) {
  macro.enabled = macro.enabled !== false;
  macro.name = macro.name || `Macro ${index + 1}`;
  macro.description = macro.description || "";
  macro.triggerButtons = Array.isArray(macro.triggerButtons) ? macro.triggerButtons : [];
  macro.tasks = Array.isArray(macro.tasks) && macro.tasks.length ? macro.tasks : [{ type: "every", interval: 1, steps: [{ kind: "press", key: "space" }] }];
  macro.tasks.forEach((task) => normalizeVisualTask(task));
  return macro;
}

function normalizeVisualTask(task) {
  task.interval = Number(task.interval) > 0 ? Number(task.interval) : 1;
  task.steps = Array.isArray(task.steps) && task.steps.length ? task.steps : [{ kind: "press", key: "space" }];
  task.steps = task.steps.map(normalizeVisualStep);

  if (task.type === "hold" || (task.steps.length === 1 && stepMode(task.steps[0]) === "hold")) {
    const action = firstActionStep(task);
    task.type = "hold";
    task.steps = [makeActionStep("hold", stepValue(action))];
  } else if (task.steps.length === 1 && isInputStep(task.steps[0]) && stepMode(task.steps[0]) === "tap") {
    task.type = "every";
  } else {
    task.type = "sequence";
    task.steps = task.steps.map((step) => {
      if (step.kind === "wait") return step;
      return makeActionStep("tap", stepValue(step));
    });
  }
}

function normalizeVisualStep(step) {
  if (step?.kind === "wait") {
    return { kind: "wait", seconds: positiveNumber(step.seconds, 0.2) };
  }
  return normalizeActionStep(step || { kind: "press", key: "space" });
}

function currentMacro() {
  const model = normalizeVisualModel(state.visualModel);
  return model.macros[model.selectedMacroIndex];
}

function renderMacroList() {
  const model = normalizeVisualModel(state.visualModel);
  macroList.innerHTML = model.macros
    .map((macro, index) => {
      const active = index === model.selectedMacroIndex;
      const triggers = macro.triggerButtons.join(" / ");
      return `<article class="macro-card ${active ? "active" : ""} ${macro.enabled ? "" : "disabled"}" data-macro-drop="${index}">
        <label class="macro-enable">
          <input data-macro-enabled="${index}" type="checkbox" ${macro.enabled ? "checked" : ""} />
          <span>${escapeHtml(t("macroList.enabled"))}</span>
        </label>
        <button class="macro-select" data-select-macro="${index}" type="button">
          <strong>${escapeHtml(macro.name)}</strong>
          <small>${escapeHtml(triggers || t("macroList.noTriggers"))}</small>
        </button>
        <button class="delete-button macro-delete" data-remove-macro="${index}" type="button" aria-label="${escapeHtml(t("macroList.deleteAria"))}" ${model.macros.length <= 1 ? "disabled" : ""}>×</button>
      </article>`;
    })
    .join("");
}

function renderTriggerChips() {
  triggerChips.innerHTML = "";
}

function renderTriggerSuggestions() {
  const model = normalizeVisualModel(state.visualModel);
  const macro = currentMacro();
  const owners = triggerOwners(model);
  const matches = TRIGGER_OPTIONS;

  triggerSuggestions.innerHTML = matches
    .map(([alias, canonical, description]) => {
      const selected = macro.triggerButtons.includes(canonical);
      const owner = owners.get(canonical)?.find((item) => item.index !== model.selectedMacroIndex);
      const disabled = !selected && Boolean(owner);
      const ownerText = owner ? t("triggers.usedBy", { name: owner.name }) : "";
      return `<button class="suggestion-item ${selected ? "selected" : ""}" data-toggle-trigger="${escapeHtml(canonical)}" data-trigger-option="${escapeHtml(canonical)}" type="button" draggable="${!selected && !disabled ? "true" : "false"}" aria-pressed="${selected ? "true" : "false"}" ${disabled ? "disabled" : ""}>
        <strong>${escapeHtml(alias)}</strong>
        <span>${escapeHtml(canonical)}</span>
        <small>${escapeHtml(localized(description) + ownerText)}</small>
      </button>`;
    })
    .join("");
}

function renderFlowTasks() {
  const macro = currentMacro();
  flowTasks.innerHTML = macro.tasks
    .map((task, taskIndex) => {
      return `<article class="flow-card" data-task-card="${taskIndex}">
        <div class="flow-card-head">
          <span class="flow-number">${taskIndex + 1}</span>
          <strong class="flow-card-title">${escapeHtml(flowTitle(task))}</strong>
        </div>
        <button class="delete-button flow-remove-button" data-remove-task="${taskIndex}" type="button" aria-label="${escapeHtml(t("flow.delete"))}">×</button>
        ${renderIndependentFlowTask(task, taskIndex)}
      </article>`;
    })
    .join("");
}

function flowTitle(task) {
  if (task.type === "hold") return t("flow.holdFlow");
  if (task.type === "sequence") return t("flow.sequenceFlow");
  return t("flow.tapFlow");
}

function renderIndependentFlowTask(task, taskIndex) {
  const steps = task.steps
    .map((step, stepIndex) => renderStepNode(step, task, taskIndex, stepIndex))
    .join(`<div class="flow-arrow vertical">↓</div>`);
  const timingNode = task.type === "hold" ? "" : `<label class="flow-node delay editable flow-period-node">
      <span>${escapeHtml(t(task.type === "sequence" ? "flow.waitSeconds" : "flow.periodSeconds"))}</span>
      <input data-task-index="${taskIndex}" data-task-field="interval" type="number" min="0.001" step="0.001" value="${formatNumber(task.interval)}" />
    </label>`;
  const stepActions = task.type === "hold" ? "" : `<div class="step-actions">
        <button class="ghost-button compact-button" data-add-step="action" data-task-index="${taskIndex}" type="button">${escapeHtml(t("flow.addAction"))}</button>
        <button class="ghost-button compact-button" data-add-step="wait" data-task-index="${taskIndex}" type="button">${escapeHtml(t("flow.addWait"))}</button>
      </div>`;
  return `<div class="independent-flow">
    ${timingNode}
    <div class="flow-sequence">
      ${steps}
      ${stepActions}
    </div>
  </div>`;
}

function renderStepNode(step, task, taskIndex, stepIndex) {
  const isWait = step.kind === "wait";
  const holdOption = task.type === "sequence" ? "" : `<option value="hold" ${stepMode(step) === "hold" ? "selected" : ""}>${escapeHtml(t("flow.hold"))}</option>`;
  if (isWait) {
    return `<div class="flow-node step-node wait-step">
      <select data-task-index="${taskIndex}" data-step-index="${stepIndex}" data-step-field="kind">
        <option value="tap">${escapeHtml(t("flow.tap"))}</option>
        ${holdOption}
        <option value="wait" selected>${escapeHtml(t("flow.wait"))}</option>
      </select>
      <input data-task-index="${taskIndex}" data-step-index="${stepIndex}" data-step-field="value"
        type="number" min="0.001" step="0.001" value="${escapeHtml(formatNumber(step.seconds || 0.2))}" title="${escapeHtml(t("flow.waitSeconds"))}" />
      <button class="delete-button" data-remove-step="${stepIndex}" data-task-index="${taskIndex}" type="button" aria-label="${escapeHtml(t("flow.deleteStep"))}">×</button>
    </div>`;
  }

  return `<div class="flow-node step-node">
    <select data-task-index="${taskIndex}" data-step-index="${stepIndex}" data-step-field="kind">
      <option value="tap" ${stepMode(step) === "tap" ? "selected" : ""}>${escapeHtml(t("flow.tap"))}</option>
      ${holdOption}
      <option value="wait">${escapeHtml(t("flow.wait"))}</option>
    </select>
    <input data-task-index="${taskIndex}" data-step-index="${stepIndex}" data-step-field="value" type="text" value="${escapeHtml(stepValue(step))}" autocomplete="off" />
    <button class="delete-button" data-remove-step="${stepIndex}" data-task-index="${taskIndex}" type="button" aria-label="${escapeHtml(t("flow.deleteStep"))}">×</button>
  </div>`;
}

function updateVisualBasics() {
  const model = normalizeVisualModel(state.visualModel);
  const macro = currentMacro();
  macro.name = visualName.value.trim() || "Macro";
  macro.description = visualDescription.value.trim();
  model.backend = visualBackend.value;
  renderMacroList();
  syncScriptFromVisual();
}

function toggleTrigger(canonical) {
  const model = normalizeVisualModel(state.visualModel);
  const macro = currentMacro();
  const triggerIndex = macro.triggerButtons.indexOf(canonical);

  if (triggerIndex >= 0) {
    if (macro.enabled && macro.triggerButtons.length === 1) {
      setVisualStatus("warning", t("triggers.disableFirst"));
      return;
    }
    macro.triggerButtons.splice(triggerIndex, 1);
    renderVisualEditor();
    syncScriptFromVisual();
    return;
  }

  addTriggerToMacro(model.selectedMacroIndex, canonical);
}

function addTriggerToMacro(macroIndex, canonical) {
  const model = normalizeVisualModel(state.visualModel);
  const macro = model.macros[macroIndex];
  if (!macro || !isAssignableTrigger(canonical, macroIndex)) return;
  if (!macro.triggerButtons.includes(canonical)) {
    macro.triggerButtons.push(canonical);
    model.selectedMacroIndex = macroIndex;
    renderVisualEditor();
    syncScriptFromVisual();
  }
}

function isAssignableTrigger(canonical, macroIndex) {
  const model = normalizeVisualModel(state.visualModel);
  return !model.macros.some((macro, index) => {
    return index !== macroIndex && macro.triggerButtons.includes(canonical);
  });
}

function addTask() {
  const macro = currentMacro();
  macro.tasks.push({ type: "every", interval: 1, steps: [{ kind: "press", key: "space" }] });
  renderFlowTasks();
  syncScriptFromVisual();
}

function handleFlowInput(event) {
  const target = event.target;
  if (isActionTargetInput(target)) {
    state.activeTargetInput = target;
    state.targetSuggestions = filterTargetSuggestions(target.value);
    state.targetSuggestionIndex = 0;
    renderTargetSuggestionMenu();
  }

  const taskIndex = Number(target.dataset.taskIndex);
  const macro = currentMacro();
  if (!Number.isInteger(taskIndex) || !macro.tasks[taskIndex]) return;
  const task = macro.tasks[taskIndex];

  if (target.dataset.taskField === "interval") {
    task.interval = positiveNumber(target.value, 1);
    syncScriptFromVisual();
    return;
  }

  const stepIndex = Number(target.dataset.stepIndex);
  if (!Number.isInteger(stepIndex) || !task.steps[stepIndex]) return;
  const step = task.steps[stepIndex];
  if (target.dataset.stepField === "kind") {
    if (target.value === "wait") {
      task.type = "sequence";
      task.steps[stepIndex] = { kind: "wait", seconds: 0.2 };
    } else if (target.value === "hold") {
      const action = isInputStep(step) ? step : { kind: "press", key: "space" };
      task.type = "hold";
      task.steps = [makeActionStep("hold", stepValue(action))];
    } else {
      const action = isInputStep(step) ? step : { kind: "press", key: "space" };
      task.steps[stepIndex] = makeActionStep("tap", stepValue(action));
      if (task.type === "hold") task.type = "every";
    }
    normalizeVisualTask(task);
    renderFlowTasks();
    syncScriptFromVisual();
  } else if (target.dataset.stepField === "value") {
    if (step.kind === "wait") {
      step.seconds = positiveNumber(target.value, 0.2);
    } else if (isInputStep(step)) {
      task.steps[stepIndex] = makeActionStep(stepMode(step), target.value);
      normalizeVisualTask(task);
    }
    syncScriptFromVisual();
  }
}

function handleFlowClick(event) {
  const removeTaskIndex = event.target.closest("[data-remove-task]")?.dataset.removeTask;
  const macro = currentMacro();
  if (removeTaskIndex !== undefined) {
    macro.tasks.splice(Number(removeTaskIndex), 1);
    normalizeVisualModel(state.visualModel);
    renderFlowTasks();
    syncScriptFromVisual();
    return;
  }

  const addStepButton = event.target.closest("[data-add-step]");
  if (addStepButton) {
    const task = macro.tasks[Number(addStepButton.dataset.taskIndex)];
    if (!task || task.type === "hold") return;
    task.type = "sequence";
    task.steps.push(
      addStepButton.dataset.addStep === "wait"
        ? { kind: "wait", seconds: 0.2 }
        : { kind: "press", key: "space" },
    );
    normalizeVisualTask(task);
    renderFlowTasks();
    syncScriptFromVisual();
    return;
  }

  const removeStepButton = event.target.closest("[data-remove-step]");
  if (removeStepButton) {
    const task = macro.tasks[Number(removeStepButton.dataset.taskIndex)];
    task.steps.splice(Number(removeStepButton.dataset.removeStep), 1);
    normalizeVisualModel(state.visualModel);
    renderFlowTasks();
    syncScriptFromVisual();
  }
}

function handleFlowFocusIn(event) {
  if (isActionTargetInput(event.target)) {
    showTargetSuggestions(event.target);
  }
}

function handleFlowPointerDown(event) {
  if (isActionTargetInput(event.target)) {
    showTargetSuggestions(event.target);
  }
}

function handleFlowKeyDown(event) {
  if (!isActionTargetInput(event.target) || targetSuggestionMenu.hidden) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveTargetSuggestion(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveTargetSuggestion(-1);
  } else if (event.key === "Enter" || event.key === "Tab") {
    event.preventDefault();
    chooseTargetSuggestion();
  } else if (event.key === "Escape") {
    event.preventDefault();
    hideTargetSuggestions();
  }
}

function handleMacroListClick(event) {
  const removeIndex = event.target.closest("[data-remove-macro]")?.dataset.removeMacro;
  if (removeIndex !== undefined) {
    const model = normalizeVisualModel(state.visualModel);
    if (model.macros.length <= 1) return;
    model.macros.splice(Number(removeIndex), 1);
    model.selectedMacroIndex = clampIndex(model.selectedMacroIndex, model.macros.length);
    renderVisualEditor();
    syncScriptFromVisual();
    return;
  }

  const selectIndex = event.target.closest("[data-select-macro]")?.dataset.selectMacro;
  if (selectIndex !== undefined) {
    state.visualModel.selectedMacroIndex = Number(selectIndex);
    renderVisualEditor();
  }
}

function handleMacroListInput(event) {
  const enabledIndex = event.target.closest("[data-macro-enabled]")?.dataset.macroEnabled;
  if (enabledIndex === undefined) return;
  const model = normalizeVisualModel(state.visualModel);
  const macro = model.macros[Number(enabledIndex)];
  if (!macro) return;
  macro.enabled = event.target.checked;
  renderMacroList();
  renderTriggerSuggestions();
  syncScriptFromVisual();
}

function handleTriggerDragStart(event) {
  const item = event.target.closest("[data-trigger-option]");
  if (!item || item.disabled) return;
  const canonical = item.dataset.triggerOption;
  state.draggedTrigger = canonical;
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("application/x-linuxmacro-trigger", canonical);
  event.dataTransfer.setData("text/plain", canonical);
}

function handleTriggerDragEnd() {
  state.draggedTrigger = null;
  clearMacroDropState();
}

function handleMacroDragOver(event) {
  const card = event.target.closest("[data-macro-drop]");
  if (!card) return;
  const macroIndex = Number(card.dataset.macroDrop);
  const canonical = state.draggedTrigger;
  if (!canonical || !isAssignableTrigger(canonical, macroIndex)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  card.classList.add("drag-over");
}

function handleMacroDragLeave(event) {
  const card = event.target.closest("[data-macro-drop]");
  if (card && !card.contains(event.relatedTarget)) {
    card.classList.remove("drag-over");
  }
}

function handleMacroDrop(event) {
  const card = event.target.closest("[data-macro-drop]");
  if (!card) return;
  const macroIndex = Number(card.dataset.macroDrop);
  const canonical =
    event.dataTransfer.getData("application/x-linuxmacro-trigger") ||
    event.dataTransfer.getData("text/plain") ||
    state.draggedTrigger;
  if (!canonical || !isAssignableTrigger(canonical, macroIndex)) return;
  event.preventDefault();
  addTriggerToMacro(macroIndex, canonical);
  state.draggedTrigger = null;
  clearMacroDropState();
}

function clearMacroDropState() {
  macroList.querySelectorAll(".drag-over").forEach((element) => {
    element.classList.remove("drag-over");
  });
}

function isActionTargetInput(element) {
  if (!(element instanceof HTMLInputElement) || element.type !== "text") return false;
  return element.dataset.stepField === "value";
}

function showTargetSuggestions(input) {
  if (!isActionTargetInput(input)) return;
  state.activeTargetInput = input;
  state.targetSuggestionIndex = 0;
  state.targetSuggestions = filterTargetSuggestions(input.value);
  renderTargetSuggestionMenu();
}

function filterTargetSuggestions(query) {
  const normalized = String(query || "").trim().toLowerCase();
  const options = ACTION_TARGET_OPTIONS.map(([value, label, detail]) => ({
    value,
    label: localized(label),
    detail: localized(detail),
  }));
  if (!normalized) return options.slice(0, 14);

  return options
    .filter((option) => {
      return [option.value, option.label, option.detail]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    })
    .slice(0, 14);
}

function renderTargetSuggestionMenu() {
  const input = state.activeTargetInput;
  if (!input || !document.body.contains(input)) {
    hideTargetSuggestions();
    return;
  }

  const suggestions = state.targetSuggestions;
  if (!suggestions.length) {
    hideTargetSuggestions();
    return;
  }

  targetSuggestionMenu.innerHTML = suggestions
    .map((option, index) => {
      return `<button class="target-suggestion-item ${index === state.targetSuggestionIndex ? "active" : ""}" data-target-suggestion="${index}" type="button">
        <strong>${escapeHtml(option.value)}</strong>
        <span>${escapeHtml(option.label)}</span>
        <small>${escapeHtml(option.detail)}</small>
      </button>`;
    })
    .join("");

  positionTargetSuggestionMenu(input, suggestions.length);
  targetSuggestionMenu.hidden = false;
}

function positionTargetSuggestionMenu(input, itemCount) {
  const rect = input.getBoundingClientRect();
  const margin = 10;
  const estimatedHeight = Math.min(280, itemCount * 56 + 10);
  const spaceBelow = window.innerHeight - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  const openUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
  const height = Math.min(estimatedHeight, Math.max(openUp ? spaceAbove : spaceBelow, 160));

  targetSuggestionMenu.style.left = `${Math.max(margin, rect.left)}px`;
  targetSuggestionMenu.style.width = `${Math.max(rect.width, 260)}px`;
  targetSuggestionMenu.style.maxHeight = `${height}px`;
  targetSuggestionMenu.style.top = openUp
    ? `${Math.max(margin, rect.top - height - 6)}px`
    : `${Math.min(window.innerHeight - margin, rect.bottom + 6)}px`;
}

function hideTargetSuggestions() {
  targetSuggestionMenu.hidden = true;
  state.activeTargetInput = null;
  state.targetSuggestions = [];
}

function chooseTargetSuggestion(index = state.targetSuggestionIndex) {
  const input = state.activeTargetInput;
  const option = state.targetSuggestions[index];
  if (!input || !option) return;
  input.value = option.value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  hideTargetSuggestions();
}

function moveTargetSuggestion(delta) {
  if (targetSuggestionMenu.hidden || !state.targetSuggestions.length) return;
  const count = state.targetSuggestions.length;
  state.targetSuggestionIndex = (state.targetSuggestionIndex + delta + count) % count;
  renderTargetSuggestionMenu();
}

function handleDocumentScroll(event) {
  if (targetSuggestionMenu.hidden) return;
  if (event.target === targetSuggestionMenu || targetSuggestionMenu.contains(event.target)) return;
  hideTargetSuggestions();
}

function addMacro() {
  const model = normalizeVisualModel(state.visualModel);
  model.macros.push(defaultMacro(model.macros.length));
  model.selectedMacroIndex = model.macros.length - 1;
  renderVisualEditor();
  syncScriptFromVisual();
}

function syncScriptFromVisual() {
  markVisualEditing();
  normalizeVisualModel(state.visualModel);
  editor.value = visualModelToScript(state.visualModel);
  renderCounts();
  validateDraft({ syncVisual: false });
  scheduleSave({ syncVisual: false });
  setVisualStatus("neutral", t("save.synced"));
}

function visualModelToScript(model) {
  normalizeVisualModel(model);
  const lines = [
    "# LinuxMacro configuration",
    "# Generated by graphical editor.",
    "",
    `backend ${model.backend || "auto"}`,
    "",
  ];

  for (const macro of model.macros) {
    lines.push(`macro "${scriptName(macro.name || "Macro")}" {`);
    if (macro.description) lines.push(`  description ${macro.description}`);
    lines.push(`  enabled ${macro.enabled ? "on" : "off"}`);
    if (macro.triggerButtons.length) lines.push(`  trigger ${macro.triggerButtons.join(" ")}`);
    lines.push("");

    for (const task of macro.tasks) {
      if (task.type === "hold") {
        const action = firstActionStep(task);
        lines.push(`  hold ${scriptActionCommand(action)} ${scriptActionValue(action)}`);
      } else if (task.type === "every") {
        const action = firstActionStep(task);
        if (stepTargetType(action) === "mouse") {
          lines.push(`  every ${formatDuration(task.interval)} click ${scriptActionValue(action)}`);
        } else {
          lines.push(`  every ${formatDuration(task.interval)} press ${scriptActionValue(action)}`);
        }
      } else {
        lines.push(`  sequence ${formatDuration(task.interval)} {`);
        for (const step of task.steps) {
          if (step.kind === "wait") {
            lines.push(`    wait ${formatDuration(step.seconds || 0.2)}`);
          } else if (stepTargetType(step) === "mouse") {
            lines.push(`    click ${scriptActionValue(step)}`);
          } else {
            lines.push(`    press ${scriptActionValue(step)}`);
          }
        }
        lines.push("  }");
      }
    }
    lines.push("}");
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function markVisualEditing() {
  state.visualEditing = true;
  clearTimeout(state.visualEditingTimer);
  state.visualEditingTimer = setTimeout(() => {
    state.visualEditing = false;
  }, 900);
}

function scheduleSave(options = {}) {
  clearTimeout(state.saveTimer);
  state.pendingSaveOptions = options;
  setSaveStatus("neutral", t("save.waiting"));
  state.saveTimer = setTimeout(() => {
    saveConfig(state.pendingSaveOptions);
  }, 450);
}

async function saveConfig(options = {}) {
  const syncVisual = options.syncVisual ?? true;
  const throwOnError = options.throwOnError ?? false;
  const reloadActive = options.reloadActive ?? true;
  clearTimeout(state.saveTimer);
  try {
    setSaveStatus("neutral", t("save.checking"));
    setVisualStatus("neutral", t("save.checking"));
    const payload = await invoke("save_config", { content: editor.value });
    state.currentPath = payload.path;
    configPath.textContent = payload.path;
    renderValidation(payload.validation, { syncVisual });
    const now = new Date().toLocaleTimeString();
    setSaveStatus("success", t("save.saved", { time: now }));
    setVisualStatus("success", t("save.syntaxOk", { time: now }));
    if (reloadActive && isMacroRuntimeActive()) {
      await reloadActiveRuntime(now);
    }
    return payload;
  } catch (error) {
    const message = error.message || String(error);
    setSaveStatus("danger", t("save.syntaxError"));
    setVisualStatus("danger", t("save.syntaxError"));
    validationBadge.textContent = t("validation.invalid");
    validationBadge.className = "pill danger";
    validationMessage.textContent = message;
    if (throwOnError) throw error;
    return null;
  }
}

async function reloadActiveRuntime(savedAt) {
  const token = ++state.reloadToken;
  setSaveStatus("neutral", t("save.savedReloading"));
  setVisualStatus("neutral", t("save.savedReloading"));
  try {
    const status = await invoke("reload_macro");
    if (token !== state.reloadToken) return;
    renderMacroStatus(status);
    setSaveStatus("success", t("save.savedReloaded", { time: savedAt }));
    setVisualStatus("success", t("save.syntaxReloaded", { time: savedAt }));
  } catch (error) {
    if (token !== state.reloadToken) return;
    const message = error.message || String(error);
    setSaveStatus("danger", t("save.reloadFailed"));
    setVisualStatus("danger", t("save.reloadFailed"));
    macroStateBadge.textContent = t("status.reloadFailed");
    macroStateBadge.className = "pill danger";
    macroStateText.textContent = t("runtime.oldConfig", { message });
  }
}

function isMacroRuntimeActive() {
  return Boolean(state.currentMacroStatus?.active && !state.currentMacroStatus.stopped);
}

async function validateDraft(options = {}) {
  const token = ++state.validateToken;
  try {
    const report = await invoke("validate_macro", { content: editor.value });
    if (token === state.validateToken) {
      renderValidation(report, options);
    }
  } catch (error) {
    validationMessage.textContent = error.message || String(error);
  }
}

async function loadConfig() {
  try {
    apiState.textContent = t("api.connected");
    apiState.classList.remove("danger");
    apiState.classList.add("success");
    const payload = await invoke("load_config");
    state.currentPath = payload.path;
    configPath.textContent = payload.path;
    editor.value = payload.content;
    renderCounts();
    renderValidation(payload.validation);
    setSaveStatus("success", t("load.loaded"));
    setVisualStatus(payload.validation.ok ? "success" : "danger", payload.validation.ok ? t("load.loaded") : t("load.syntaxError"));
  } catch (error) {
    apiState.textContent = t("api.disconnected");
    apiState.classList.remove("success");
    apiState.classList.add("danger");
    setSaveStatus("danger", t("load.failed"));
    setVisualStatus("danger", t("load.failed"));
    validationMessage.textContent = error.message || String(error);
  }
}

async function refreshMacroStatus() {
  try {
    renderMacroStatus(await invoke("macro_status"));
  } catch (error) {
    macroStateBadge.textContent = t("status.error");
    macroStateBadge.className = "pill danger";
    macroStateText.textContent = error.message || String(error);
  }
}

async function refreshBackendHealth() {
  try {
    const health = await invoke("backend_health");
    renderBackendHealth(health);
    return health;
  } catch (error) {
    backendBadge.textContent = t("backend.error");
    backendBadge.className = "pill danger";
    backendMessage.textContent = error.message || String(error);
    return null;
  }
}

async function runMacroCommand(command) {
  try {
    if (command === "start_macro" || command === "reload_macro") {
      await saveConfig({ throwOnError: true, reloadActive: false });
    }
    const status = await invoke(command);
    renderMacroStatus(status);
  } catch (error) {
    macroStateBadge.textContent = t("status.error");
    macroStateBadge.className = "pill danger";
    macroStateText.textContent = error.message || String(error);
  }
}

async function togglePower() {
  const active = Boolean(state.currentMacroStatus?.active && !state.currentMacroStatus.stopped);
  await runMacroCommand(active ? "stop_macro" : "start_macro");
}

function switchTab(target) {
  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tabTarget === target);
  });
  tabPages.forEach((page) => {
    page.classList.toggle("active", page.dataset.tabPage === target);
  });
  if (target === "advanced") {
    requestAnimationFrame(() => {
      renderCounts();
      editor.focus();
    });
  }
}

async function installYdotool() {
  installYdotoolButton.disabled = true;
  installYdotoolButton.textContent = t("install.installingButton");
  let health = null;
  try {
    backendBadge.textContent = t("backend.installing");
    backendBadge.className = "pill";
    backendMessage.textContent = t("backend.installAuth");
    await nextFrame();
    const message = await invoke("install_ydotool");
    backendMessage.textContent = message;
    health = await refreshBackendHealth();
  } catch (error) {
    backendBadge.textContent = t("backend.installFailed");
    backendBadge.className = "pill danger";
    backendMessage.textContent = error.message || String(error);
  } finally {
    installYdotoolButton.textContent = t("backend.install");
    installYdotoolButton.disabled = Boolean(health?.ydotool_installed && health?.systemctl_installed);
  }
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function insertSnippet(snippet) {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const prefix = start > 0 && editor.value[start - 1] !== "\n" ? "\n" : "";
  editor.setRangeText(prefix + snippet, start, end, "end");
  editor.focus();
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

function firstActionStep(task) {
  const step = task.steps.find(isInputStep);
  if (step) return normalizeActionStep(step);
  return { kind: "press", key: "space" };
}

function isInputStep(step) {
  return ["press", "click", "hold-key", "hold-click"].includes(step?.kind);
}

function normalizeActionStep(step) {
  if (step.kind === "hold-click") {
    return { kind: "hold-click", button: normalizeMouseButton(step.button) };
  }
  if (step.kind === "hold-key") {
    return { kind: "hold-key", key: normalizeKey(step.key) };
  }
  if (step.kind === "click") return { kind: "click", button: normalizeMouseButton(step.button) };
  return { kind: "press", key: normalizeKey(step.key) };
}

function stepMode(step) {
  return ["hold-key", "hold-click"].includes(step?.kind) ? "hold" : "tap";
}

function stepTargetType(step) {
  return ["click", "hold-click"].includes(step?.kind) ? "mouse" : "key";
}

function stepValue(step) {
  return stepTargetType(step) === "mouse" ? normalizeMouseButton(step.button) : normalizeKey(step.key);
}

function makeActionStep(mode, value) {
  const { targetType, targetValue } = parseActionTarget(value);
  if (targetType === "mouse") {
    const button = normalizeMouseButton(targetValue);
    return mode === "hold" ? { kind: "hold-click", button } : { kind: "click", button };
  }

  const key = normalizeKey(targetValue);
  return mode === "hold" ? { kind: "hold-key", key } : { kind: "press", key };
}

function parseActionTarget(value) {
  const raw = String(value || "space").trim();
  const lower = raw.toLowerCase();
  if (lower.startsWith("key:")) {
    return { targetType: "key", targetValue: raw.slice(4) || "space" };
  }
  if (lower.startsWith("keyboard:")) {
    return { targetType: "key", targetValue: raw.slice(9) || "space" };
  }
  if (lower.startsWith("mouse:")) {
    return { targetType: "mouse", targetValue: raw.slice(6) || "left" };
  }
  if (lower.startsWith("button:")) {
    return { targetType: "mouse", targetValue: raw.slice(7) || "left" };
  }
  if (isMouseButtonValue(raw)) {
    return { targetType: "mouse", targetValue: raw };
  }
  return { targetType: "key", targetValue: raw || "space" };
}

function scriptActionCommand(step) {
  return stepTargetType(step) === "mouse" ? "click" : "press";
}

function scriptActionValue(step) {
  return stepTargetType(step) === "mouse" ? normalizeMouseButton(stepValue(step)) : normalizeKey(stepValue(step));
}

function triggerOwners(model) {
  const owners = new Map();
  model.macros.forEach((macro, index) => {
    macro.triggerButtons.forEach((trigger) => {
      if (!owners.has(trigger)) owners.set(trigger, []);
      owners.get(trigger).push({ index, name: macro.name, enabled: macro.enabled });
    });
  });
  return owners;
}

function clampIndex(value, length) {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0) return 0;
  return Math.min(index, Math.max(length - 1, 0));
}

function scriptName(value) {
  return String(value || "Macro").replaceAll('"', "'");
}

function normalizeKey(value) {
  const text = String(value || "space").trim().toLowerCase();
  return text || "space";
}

function normalizeMouseButton(value) {
  const text = String(value || "left").trim().toLowerCase();
  if (["leftclick", "mouse1", "lmb", "btn_left"].includes(text)) return "left";
  if (["rightclick", "mouse2", "rmb", "btn_right"].includes(text)) return "right";
  if (["middleclick", "mouse3", "mmb", "btn_middle"].includes(text)) return "middle";
  if (["side", "mouse4", "back", "btn_side"].includes(text)) return "side";
  if (["extra", "mouse5", "forward", "btn_extra"].includes(text)) return "extra";
  return text || "left";
}

function isMouseButtonValue(value) {
  const text = String(value || "").trim().toLowerCase();
  return ["left", "leftclick", "mouse1", "lmb", "btn_left", "right", "rightclick", "mouse2", "rmb", "btn_right", "middle", "middleclick", "mouse3", "mmb", "btn_middle", "side", "mouse4", "back", "btn_side", "extra", "mouse5", "forward", "btn_extra"].includes(text);
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function formatNumber(value) {
  return String(Number(value || 0).toFixed(3)).replace(/\.?0+$/, "");
}

function formatDuration(seconds) {
  const value = positiveNumber(seconds, 1);
  const milliseconds = value * 1000;
  if (value < 1 && Number.isInteger(milliseconds)) return `${milliseconds}ms`;
  return `${formatNumber(value)}s`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

editor.addEventListener("input", () => {
  renderCounts();
  validateDraft();
  scheduleSave();
});

editor.addEventListener("scroll", () => {
  lineNumbers.scrollTop = editor.scrollTop;
});

[visualName, visualDescription, visualBackend].forEach((element) => {
  element.addEventListener("input", updateVisualBasics);
  element.addEventListener("change", updateVisualBasics);
});

triggerSuggestions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-toggle-trigger]");
  if (!button) return;
  toggleTrigger(button.dataset.toggleTrigger);
  renderTriggerSuggestions();
});
triggerSuggestions.addEventListener("dragstart", handleTriggerDragStart);
triggerSuggestions.addEventListener("dragend", handleTriggerDragEnd);

macroList.addEventListener("click", handleMacroListClick);
macroList.addEventListener("input", handleMacroListInput);
macroList.addEventListener("dragover", handleMacroDragOver);
macroList.addEventListener("dragleave", handleMacroDragLeave);
macroList.addEventListener("drop", handleMacroDrop);
flowTasks.addEventListener("focusin", handleFlowFocusIn);
flowTasks.addEventListener("pointerdown", handleFlowPointerDown);
flowTasks.addEventListener("keydown", handleFlowKeyDown);
flowTasks.addEventListener("input", handleFlowInput);
flowTasks.addEventListener("change", handleFlowInput);
flowTasks.addEventListener("click", handleFlowClick);

targetSuggestionMenu.addEventListener("mousedown", (event) => {
  const button = event.target.closest("[data-target-suggestion]");
  if (!button) return;
  event.preventDefault();
  chooseTargetSuggestion(Number(button.dataset.targetSuggestion));
});

document.addEventListener("mousedown", (event) => {
  if (targetSuggestionMenu.hidden) return;
  if (event.target === state.activeTargetInput || targetSuggestionMenu.contains(event.target)) return;
  hideTargetSuggestions();
});

window.addEventListener("resize", hideTargetSuggestions);
document.addEventListener("scroll", handleDocumentScroll, true);

addMacroButton.addEventListener("click", addMacro);
addFlowTaskButton.addEventListener("click", addTask);
saveNowButton.addEventListener("click", () => saveConfig());
powerToggleButton.addEventListener("click", togglePower);
installYdotoolButton.addEventListener("click", installYdotool);
languageToggle.addEventListener("click", () => {
  setLanguage(state.language === "en" ? "zh" : "en", { validate: true });
});

themeToggle.addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "mocha" ? "latte" : "mocha");
});

document.querySelectorAll("[data-snippet]").forEach((button) => {
  button.addEventListener("click", () => insertSnippet(button.dataset.snippet));
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tabTarget));
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveConfig();
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "l") {
    event.preventDefault();
    themeToggle.click();
  }
});

setLanguage(state.language, { validate: false });
setTheme(localStorage.getItem("linuxmacro-theme") || "mocha");
renderCounts();
renderVisualEditor();
loadConfig();
refreshMacroStatus();
refreshBackendHealth();
setInterval(refreshMacroStatus, 1000);
