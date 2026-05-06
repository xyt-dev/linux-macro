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
const visualStart = document.querySelector("#visualStart");
const triggerSuggestions = document.querySelector("#triggerSuggestions");
const triggerChips = document.querySelector("#triggerChips");
const addEveryTaskButton = document.querySelector("#addEveryTask");
const addSequenceTaskButton = document.querySelector("#addSequenceTask");
const flowTasks = document.querySelector("#flowTasks");

const TRIGGER_OPTIONS = [
  ["side", "BTN_SIDE", "鼠标侧键 / mouse4 / back"],
  ["extra", "BTN_EXTRA", "鼠标额外键 / mouse5 / forward"],
  ["browserback", "KEY_BACK", "浏览器后退"],
  ["browserforward", "KEY_FORWARD", "浏览器前进"],
  ...Array.from({ length: 12 }, (_, index) => {
    const key = `f${index + 1}`;
    return [key, `KEY_F${index + 1}`, `功能键 ${key.toUpperCase()}`];
  }),
];

const ACTION_TARGET_OPTIONS = [
  ["left", "鼠标左键", "mouse1 / leftclick"],
  ["right", "鼠标右键", "mouse2 / rightclick"],
  ["middle", "鼠标中键", "mouse3 / middleclick"],
  ["side", "鼠标侧键", "mouse4 / back"],
  ["extra", "鼠标额外键", "mouse5 / forward"],
  ["space", "空格键", "keyboard"],
  ["enter", "回车", "keyboard"],
  ["tab", "Tab", "keyboard"],
  ["esc", "Esc", "keyboard"],
  ["backspace", "退格", "keyboard"],
  ["delete", "删除", "keyboard"],
  ["key:left", "方向左", "强制键盘"],
  ["key:right", "方向右", "强制键盘"],
  ["up", "方向上", "keyboard"],
  ["down", "方向下", "keyboard"],
  ["ctrl", "Ctrl", "keyboard"],
  ["shift", "Shift", "keyboard"],
  ["alt", "Alt", "keyboard"],
  ...Array.from("abcdefghijklmnopqrstuvwxyz", (key) => [key, `字母 ${key.toUpperCase()}`, "keyboard"]),
  ...Array.from("0123456789", (key) => [key, `数字 ${key}`, "keyboard"]),
  ...Array.from({ length: 12 }, (_, index) => {
    const key = `f${index + 1}`;
    return [key, `功能键 ${key.toUpperCase()}`, "keyboard"];
  }),
];

const state = {
  saveTimer: null,
  validateToken: 0,
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
    return Promise.reject(new Error("Tauri API 未连接，请在 Tauri 应用窗口中打开。"));
  }
  return tauriInvoke(command, args);
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
      enabled: true,
      name: "左键连点",
      description: "按下鼠标侧键切换左键 50ms 连点。",
      startRunning: false,
      triggerButtons: ["BTN_SIDE"],
      tasks: [{ type: "every", interval: 0.05, steps: [{ kind: "click", button: "left" }] }],
    },
    {
      enabled: false,
      name: "R 连发",
      description: "按下鼠标额外键切换 r 连发。",
      startRunning: false,
      triggerButtons: ["BTN_EXTRA"],
      tasks: [{ type: "every", interval: 0.1, steps: [{ kind: "press", key: "r" }] }],
    },
  ];
  if (defaults[index]) return JSON.parse(JSON.stringify(defaults[index]));
  return {
    enabled: true,
    name: `宏 ${index + 1}`,
    description: "",
    startRunning: false,
    triggerButtons: [nextAvailableTrigger(index)],
    tasks: [{ type: "every", interval: 1, steps: [{ kind: "press", key: "space" }] }],
  };
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("linuxmacro-theme", theme);
  themeToggle.textContent = theme === "mocha" ? "Light" : "Mocha";
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
  lineCount.textContent = `${lines} 行`;
  charCount.textContent = `${editor.value.length} 字符`;
  lineNumbers.innerHTML = Array.from({ length: Math.max(lines, 1) }, (_, index) => {
    return `<span>${index + 1}</span>`;
  }).join("");
}

function renderValidation(report, options = {}) {
  const syncVisual = options.syncVisual ?? true;
  if (!report) {
    validationBadge.textContent = "未校验";
    validationBadge.className = "pill";
    return;
  }

  if (report.ok) {
    validationBadge.textContent = "有效";
    validationBadge.className = "pill success";
    validationMessage.textContent = `解析成功：${report.macro_count ?? 0} 个宏，${report.task_count} 个任务，${report.line_count} 行。`;
    renderProgram(report.program);
    if (syncVisual && !state.visualEditing) {
      syncVisualFromProgram(report.program);
    }
  } else {
    validationBadge.textContent = "有错误";
    validationBadge.className = "pill danger";
    validationMessage.textContent = report.error || "脚本解析失败。";
    macroSummary.innerHTML = `<div class="empty">修正语法后显示宏信息。</div>`;
    taskList.innerHTML = `<div class="empty">暂无任务预览。</div>`;
  }
}

function renderMacroStatus(status) {
  state.currentMacroStatus = status;

  if (!status?.active) {
    macroStateBadge.textContent = "未运行";
    macroStateBadge.className = "pill";
    macroStateText.textContent = "点击启动会读取当前配置文件，并运行所有已启用宏。";
    renderPowerButton(false);
    return;
  }

  if (status.stopped) {
    macroStateBadge.textContent = "已停止";
    macroStateBadge.className = "pill danger";
  } else if (status.running) {
    macroStateBadge.textContent = "运行中";
    macroStateBadge.className = "pill success";
  } else {
    macroStateBadge.textContent = "已暂停";
    macroStateBadge.className = "pill";
  }

  const backend = status.backend || "unknown";
  const name = status.name || "unnamed";
  macroStateText.textContent = `${name} · ${backend} · ${status.enabled_macro_count ?? 0}/${status.macro_count ?? 0} 个宏启用 · ${status.task_count} 个任务 · ${status.last_event}`;
  renderPowerButton(!status.stopped);
}

function renderPowerButton(active) {
  powerToggleButton.classList.toggle("active", active);
  powerToggleButton.setAttribute("aria-label", active ? "停止宏" : "启动宏");
  powerButtonText.textContent = active ? "停止" : "启动";
}

function renderBackendHealth(health) {
  if (!health) {
    backendBadge.textContent = "未知";
    backendBadge.className = "pill";
    return;
  }

  if (health.ydotool_installed || health.xdotool_installed) {
    backendBadge.textContent = health.recommended_backend;
    backendBadge.className = "pill success";
  } else {
    backendBadge.textContent = "缺少后端";
    backendBadge.className = "pill danger";
  }

  const installHint = health.install_command ? `可执行：${health.install_command}` : "未识别包管理器，请手动安装 ydotool。";
  const notes = health.notes?.length ? ` ${health.notes.join(" ")}` : "";
  backendMessage.textContent = `会话：${health.session_type}\nydotool：${health.ydotool_installed ? "已安装" : "未安装"}；xdotool：${health.xdotool_installed ? "已安装" : "未安装"}\n${installHint}${notes}`;
  installYdotoolButton.disabled = health.ydotool_installed && health.systemctl_installed;
}

function renderProgram(program) {
  if (!program) {
    macroSummary.innerHTML = `<div class="empty">暂无宏信息。</div>`;
    taskList.innerHTML = `<div class="empty">暂无任务预览。</div>`;
    return;
  }

  const macros = programMacros(program);
  const enabledCount = macros.filter((macro) => macro.enabled).length;
  const taskCount = macros.reduce((count, macro) => count + (macro.tasks?.length || 0), 0);
  macroSummary.innerHTML = [
    ["后端", program.backend],
    ["宏数量", `${enabledCount}/${macros.length} 启用`],
    ["任务", `${taskCount} 个`],
    ["触发", macros.map((macro) => `${macro.name}: ${(macro.trigger_buttons || []).join(", ")}`).join("；")],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");

  taskList.innerHTML = macros
    .flatMap((macro, macroIndex) => {
      return (macro.tasks || []).map((task, taskIndex) => {
        return `<div class="task-item">
          <span>${macroIndex + 1}.${taskIndex + 1}</span>
          <p><strong>${escapeHtml(macro.name)}</strong> · ${escapeHtml(task.description)}</p>
        </div>`;
      });
    })
    .join("");
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
      trigger_buttons: program.toggle_buttons || ["BTN_SIDE"],
      grab_toggle_device: program.grab_toggle_device ?? false,
      start_running: program.start_running ?? false,
      tasks: program.tasks || [],
    },
  ];
}

function macroToVisualMacro(macro, index) {
  return {
    enabled: macro.enabled ?? true,
    name: macro.name || `宏 ${index + 1}`,
    description: macro.description || "",
    startRunning: Boolean(macro.start_running),
    triggerButtons: [...(macro.trigger_buttons || macro.toggle_buttons || [nextAvailableTrigger(index)])],
    tasks: (macro.tasks || []).map((task) => {
      const steps = (task.steps || []).map((step) => {
        if (step.kind === "wait") return { kind: "wait", seconds: Number(step.seconds) || 0.2 };
        if (step.kind === "hold-key") return { kind: "hold-key", key: step.key || "space", seconds: Number(step.seconds) || 0.2 };
        if (step.kind === "hold-click") return { kind: "hold-click", button: step.button || "left", seconds: Number(step.seconds) || 0.2 };
        if (step.kind === "click") return { kind: "click", button: step.button || "left" };
        return { kind: "press", key: step.key || "space" };
      });
      return {
        type: steps.length === 1 && isInputStep(steps[0]) ? "every" : "sequence",
        interval: Number(task.interval) || 1,
        steps: steps.length ? steps : [{ kind: "press", key: "space" }],
      };
    }),
  };
}

function renderVisualEditor() {
  const model = normalizeVisualModel(state.visualModel);
  const macro = currentMacro();
  selectedMacroTitle.textContent = `宏设置：${macro.name}`;
  visualName.value = macro.name;
  visualDescription.value = macro.description;
  visualBackend.value = model.backend;
  visualStart.value = macro.startRunning ? "running" : "paused";
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
        startRunning: Boolean(model.startRunning),
        triggerButtons: [...(model.toggleButtons || ["BTN_SIDE"])],
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
  macro.name = macro.name || `宏 ${index + 1}`;
  macro.description = macro.description || "";
  macro.startRunning = Boolean(macro.startRunning);
  macro.triggerButtons = Array.isArray(macro.triggerButtons) && macro.triggerButtons.length ? macro.triggerButtons : [nextAvailableTrigger(index)];
  macro.tasks = Array.isArray(macro.tasks) && macro.tasks.length ? macro.tasks : [{ type: "every", interval: 1, steps: [{ kind: "press", key: "space" }] }];
  macro.tasks.forEach((task) => {
    task.interval = Number(task.interval) > 0 ? Number(task.interval) : 1;
    task.steps = Array.isArray(task.steps) && task.steps.length ? task.steps : [{ kind: "press", key: "space" }];
    if (!task.type) task.type = task.steps.length === 1 && isInputStep(task.steps[0]) ? "every" : "sequence";
    if (task.type === "every") task.steps = [firstActionStep(task)];
  });
  return macro;
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
        <label class="macro-enable" title="启用或禁用这个宏">
          <input data-macro-enabled="${index}" type="checkbox" ${macro.enabled ? "checked" : ""} />
          <span>启用</span>
        </label>
        <button class="macro-select" data-select-macro="${index}" type="button">
          <strong>${escapeHtml(macro.name)}</strong>
          <small>${escapeHtml(triggers || "未设置触发键")}</small>
        </button>
        <button class="delete-button macro-delete" data-remove-macro="${index}" type="button" aria-label="删除宏" ${model.macros.length <= 1 ? "disabled" : ""}>×</button>
      </article>`;
    })
    .join("");
}

function renderTriggerChips() {
  const macro = currentMacro();
  triggerChips.innerHTML = macro.triggerButtons
    .map((trigger, index) => {
      return `<button class="chip" data-remove-trigger="${index}" type="button">
        <span>${escapeHtml(trigger)}</span><b>×</b>
      </button>`;
    })
    .join("");
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
      const disabled = selected || Boolean(owner);
      const ownerText = owner ? ` · 已由 ${owner.name} 使用` : "";
      return `<button class="suggestion-item" data-add-trigger="${escapeHtml(canonical)}" data-trigger-option="${escapeHtml(canonical)}" type="button" draggable="${disabled ? "false" : "true"}" ${disabled ? "disabled" : ""}>
        <strong>${escapeHtml(alias)}</strong>
        <span>${escapeHtml(canonical)}</span>
        <small>${escapeHtml(description + ownerText)}</small>
      </button>`;
    })
    .join("");
}

function renderFlowTasks() {
  const macro = currentMacro();
  flowTasks.innerHTML = macro.tasks
    .map((task, taskIndex) => {
      const type = task.type === "sequence" ? "sequence" : "every";
      const body = type === "every" ? renderEveryTask(task, taskIndex) : renderSequenceTask(task, taskIndex);
      return `<article class="flow-card" data-task-card="${taskIndex}">
        <div class="flow-card-head">
          <span class="flow-number">${taskIndex + 1}</span>
          <select data-task-index="${taskIndex}" data-task-field="type">
            <option value="every" ${type === "every" ? "selected" : ""}>循环动作</option>
            <option value="sequence" ${type === "sequence" ? "selected" : ""}>序列流程</option>
          </select>
        </div>
        <button class="delete-button flow-remove-button" data-remove-task="${taskIndex}" type="button" aria-label="删除流程">×</button>
        ${body}
      </article>`;
    })
    .join("");
}

function renderEveryTask(task, taskIndex) {
  const arrowId = `loop-arrow-${taskIndex}`;
  const action = firstActionStep(task);
  return `<div class="loop-flow">
    <label class="flow-node process editable">
      <span>动作</span>
      <select data-task-index="${taskIndex}" data-every-mode>
        <option value="tap" ${stepMode(action) === "tap" ? "selected" : ""}>短按</option>
        <option value="hold" ${stepMode(action) === "hold" ? "selected" : ""}>长按</option>
      </select>
      <input data-task-index="${taskIndex}" data-every-value type="text" value="${escapeHtml(stepValue(action))}" autocomplete="off" />
      ${stepMode(action) === "hold" ? `<input data-task-index="${taskIndex}" data-every-hold type="number" min="0.001" step="0.001" value="${formatNumber(stepHoldSeconds(action))}" title="长按秒数" />` : ""}
    </label>
    <div class="flow-arrow loop-forward">→</div>
    <label class="flow-node delay editable">
      <span>等待(s)</span>
      <input data-task-index="${taskIndex}" data-task-field="interval" type="number" min="0.001" step="0.001" value="${formatNumber(task.interval)}" />
    </label>
    <svg class="loop-return" viewBox="0 0 560 150" aria-hidden="true" focusable="false">
      <defs>
        <marker id="${arrowId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
          <path class="loop-return-head" d="M 0 0 L 10 5 L 0 10 z" />
        </marker>
      </defs>
      <path class="loop-return-line" marker-end="url(#${arrowId})" d="M 552 66 C 572 66 572 132 520 132 L 120 132 L 120 96" />
    </svg>
  </div>`;
}

function renderSequenceTask(task, taskIndex) {
  const steps = task.steps
    .map((step, stepIndex) => renderStepNode(step, taskIndex, stepIndex))
    .join(`<div class="flow-arrow vertical">↓</div>`);
  return `<div class="flow-sequence">
    ${steps}
    <div class="step-actions">
      <button class="ghost-button compact-button" data-add-step="action" data-task-index="${taskIndex}" type="button">添加动作</button>
      <button class="ghost-button compact-button" data-add-step="wait" data-task-index="${taskIndex}" type="button">添加等待</button>
    </div>
  </div>`;
}

function renderStepNode(step, taskIndex, stepIndex) {
  const isWait = step.kind === "wait";
  if (isWait) {
    return `<div class="flow-node step-node wait-step">
      <select data-task-index="${taskIndex}" data-step-index="${stepIndex}" data-step-field="kind">
        <option value="tap">短按</option>
        <option value="hold">长按</option>
        <option value="wait" selected>等待</option>
      </select>
      <input data-task-index="${taskIndex}" data-step-index="${stepIndex}" data-step-field="value"
        type="number" min="0.001" step="0.001" value="${escapeHtml(formatNumber(step.seconds || 0.2))}" />
      <button class="delete-button" data-remove-step="${stepIndex}" data-task-index="${taskIndex}" type="button" aria-label="删除步骤">×</button>
    </div>`;
  }

  return `<div class="flow-node step-node">
    <select data-task-index="${taskIndex}" data-step-index="${stepIndex}" data-step-field="kind">
      <option value="tap" ${stepMode(step) === "tap" ? "selected" : ""}>短按</option>
      <option value="hold" ${stepMode(step) === "hold" ? "selected" : ""}>长按</option>
      <option value="wait">等待</option>
    </select>
    <input data-task-index="${taskIndex}" data-step-index="${stepIndex}" data-step-field="value" type="text" value="${escapeHtml(stepValue(step))}" autocomplete="off" />
    ${stepMode(step) === "hold" ? `<input data-task-index="${taskIndex}" data-step-index="${stepIndex}" data-step-field="hold" type="number" min="0.001" step="0.001" value="${escapeHtml(formatNumber(stepHoldSeconds(step)))}" title="长按秒数" />` : `<span class="step-spacer" aria-hidden="true"></span>`}
    <button class="delete-button" data-remove-step="${stepIndex}" data-task-index="${taskIndex}" type="button" aria-label="删除步骤">×</button>
  </div>`;
}

function updateVisualBasics() {
  const model = normalizeVisualModel(state.visualModel);
  const macro = currentMacro();
  macro.name = visualName.value.trim() || "Macro";
  macro.description = visualDescription.value.trim();
  model.backend = visualBackend.value;
  macro.startRunning = visualStart.value === "running";
  renderMacroList();
  syncScriptFromVisual();
}

function addTrigger(canonical) {
  addTriggerToMacro(state.visualModel.selectedMacroIndex, canonical);
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

function removeTrigger(index) {
  const macro = currentMacro();
  macro.triggerButtons.splice(index, 1);
  normalizeVisualModel(state.visualModel);
  renderTriggerChips();
  renderTriggerSuggestions();
  renderMacroList();
  syncScriptFromVisual();
}

function addTask(type) {
  const macro = currentMacro();
  macro.tasks.push(
    type === "sequence"
      ? { type: "sequence", interval: 3, steps: [{ kind: "press", key: "r" }, { kind: "wait", seconds: 0.2 }, { kind: "press", key: "a" }] }
      : { type: "every", interval: 1, steps: [{ kind: "press", key: "space" }] },
  );
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

  if (target.dataset.taskField === "type") {
    task.type = target.value;
    if (task.type === "every") {
      task.steps = [firstActionStep(task)];
    } else if (task.steps.length === 1) {
      task.steps.push({ kind: "wait", seconds: 0.2 }, { kind: "press", key: "a" });
    }
    renderFlowTasks();
    syncScriptFromVisual();
    return;
  }

  if (target.hasAttribute("data-every-mode")) {
    const action = firstActionStep(task);
    const mode = target.hasAttribute("data-every-mode") ? target.value : stepMode(action);
    task.steps = [makeActionStep(mode, stepValue(action), stepHoldSeconds(action))];
    renderFlowTasks();
    syncScriptFromVisual();
    return;
  }

  if (target.hasAttribute("data-every-value")) {
    const action = firstActionStep(task);
    task.steps = [makeActionStep(stepMode(action), target.value, stepHoldSeconds(action))];
    syncScriptFromVisual();
    return;
  }

  if (target.hasAttribute("data-every-hold")) {
    const action = firstActionStep(task);
    task.steps = [makeActionStep("hold", stepValue(action), positiveNumber(target.value, 0.2))];
    syncScriptFromVisual();
    return;
  }

  const stepIndex = Number(target.dataset.stepIndex);
  if (!Number.isInteger(stepIndex) || !task.steps[stepIndex]) return;
  const step = task.steps[stepIndex];
  if (target.dataset.stepField === "kind") {
    if (target.value === "wait") {
      task.steps[stepIndex] = { kind: "wait", seconds: 0.2 };
    } else {
      const action = isInputStep(step) ? step : { kind: "press", key: "space" };
      task.steps[stepIndex] = makeActionStep(
        target.value,
        stepValue(action),
        stepHoldSeconds(action),
      );
    }
    renderFlowTasks();
    syncScriptFromVisual();
  } else if (target.dataset.stepField === "hold") {
    if (!isInputStep(step)) return;
    task.steps[stepIndex] = makeActionStep(
      "hold",
      stepValue(step),
      positiveNumber(target.value, 0.2),
    );
    syncScriptFromVisual();
  } else if (target.dataset.stepField === "value") {
    if (step.kind === "wait") {
      step.seconds = positiveNumber(target.value, 0.2);
    } else if (isInputStep(step)) {
      task.steps[stepIndex] = makeActionStep(
        stepMode(step),
        target.value,
        stepHoldSeconds(step),
      );
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
    task.type = "sequence";
    task.steps.push(
      addStepButton.dataset.addStep === "wait"
        ? { kind: "wait", seconds: 0.2 }
        : { kind: "press", key: "space" },
    );
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
  return element.hasAttribute("data-every-value") || element.dataset.stepField === "value";
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
  const options = ACTION_TARGET_OPTIONS.map(([value, label, detail]) => ({ value, label, detail }));
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
  setVisualStatus("neutral", "已同步，等待保存");
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
    lines.push(`  trigger ${macro.triggerButtons.join(" ")}`);
    lines.push(`  start ${macro.startRunning ? "running" : "paused"}`);
    lines.push("");

    for (const task of macro.tasks) {
      if (task.type === "every") {
        const action = firstActionStep(task);
        if (stepMode(action) === "hold") {
          lines.push(
            `  every ${formatDuration(task.interval)} hold ${formatDuration(stepHoldSeconds(action))} ${scriptActionCommand(action)} ${scriptActionValue(action)}`,
          );
        } else if (stepTargetType(action) === "mouse") {
          lines.push(`  every ${formatDuration(task.interval)} click ${scriptActionValue(action)}`);
        } else {
          lines.push(`  every ${formatDuration(task.interval)} press ${scriptActionValue(action)}`);
        }
      } else {
        lines.push(`  sequence ${formatDuration(task.interval)} {`);
        for (const step of task.steps) {
          if (step.kind === "wait") {
            lines.push(`    wait ${formatDuration(step.seconds || 0.2)}`);
          } else if (stepMode(step) === "hold") {
            lines.push(`    hold ${formatDuration(stepHoldSeconds(step))} ${scriptActionCommand(step)} ${scriptActionValue(step)}`);
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
  setSaveStatus("neutral", "等待保存");
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
    setSaveStatus("neutral", "正在校验…");
    setVisualStatus("neutral", "正在校验…");
    const payload = await invoke("save_config", { content: editor.value });
    state.currentPath = payload.path;
    configPath.textContent = payload.path;
    renderValidation(payload.validation, { syncVisual });
    const now = new Date().toLocaleTimeString();
    setSaveStatus("success", `已保存 ${now}`);
    setVisualStatus("success", `语法正确，已保存 ${now}`);
    if (reloadActive && isMacroRuntimeActive()) {
      await reloadActiveRuntime(now);
    }
    return payload;
  } catch (error) {
    const message = error.message || String(error);
    setSaveStatus("danger", "语法错误，未保存");
    setVisualStatus("danger", "语法错误，未保存");
    validationBadge.textContent = "有错误";
    validationBadge.className = "pill danger";
    validationMessage.textContent = message;
    if (throwOnError) throw error;
    return null;
  }
}

async function reloadActiveRuntime(savedAt) {
  const token = ++state.reloadToken;
  setSaveStatus("neutral", "已保存，正在重载运行器…");
  setVisualStatus("neutral", "已保存，正在重载运行器…");
  try {
    const status = await invoke("reload_macro");
    if (token !== state.reloadToken) return;
    renderMacroStatus(status);
    setSaveStatus("success", `已保存并重载 ${savedAt}`);
    setVisualStatus("success", `语法正确，已重载 ${savedAt}`);
  } catch (error) {
    if (token !== state.reloadToken) return;
    const message = error.message || String(error);
    setSaveStatus("danger", "已保存，重载失败");
    setVisualStatus("danger", "已保存，重载失败");
    macroStateBadge.textContent = "重载失败";
    macroStateBadge.className = "pill danger";
    macroStateText.textContent = `当前仍在使用旧运行配置：${message}`;
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
    apiState.textContent = "后端已连接";
    apiState.classList.remove("danger");
    apiState.classList.add("success");
    const payload = await invoke("load_config");
    state.currentPath = payload.path;
    configPath.textContent = payload.path;
    editor.value = payload.content;
    renderCounts();
    renderValidation(payload.validation);
    setSaveStatus("success", "已加载");
    setVisualStatus(payload.validation.ok ? "success" : "danger", payload.validation.ok ? "已加载" : "配置有语法错误");
  } catch (error) {
    apiState.textContent = "后端未连接";
    apiState.classList.remove("success");
    apiState.classList.add("danger");
    setSaveStatus("danger", "加载失败");
    setVisualStatus("danger", "加载失败");
    validationMessage.textContent = error.message || String(error);
  }
}

async function refreshMacroStatus() {
  try {
    renderMacroStatus(await invoke("macro_status"));
  } catch (error) {
    macroStateBadge.textContent = "错误";
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
    backendBadge.textContent = "错误";
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
    macroStateBadge.textContent = "错误";
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
  installYdotoolButton.textContent = "安装中…";
  let health = null;
  try {
    backendBadge.textContent = "安装中";
    backendBadge.className = "pill";
    backendMessage.textContent = "正在请求管理员授权安装 ydotool，请确认系统弹窗。";
    await nextFrame();
    const message = await invoke("install_ydotool");
    backendMessage.textContent = message;
    health = await refreshBackendHealth();
  } catch (error) {
    backendBadge.textContent = "安装失败";
    backendBadge.className = "pill danger";
    backendMessage.textContent = error.message || String(error);
  } finally {
    installYdotoolButton.textContent = "安装/启动 ydotool";
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
    return {
      kind: "hold-click",
      button: normalizeMouseButton(step.button),
      seconds: positiveNumber(step.seconds, 0.2),
    };
  }
  if (step.kind === "hold-key") {
    return {
      kind: "hold-key",
      key: normalizeKey(step.key),
      seconds: positiveNumber(step.seconds, 0.2),
    };
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

function stepHoldSeconds(step) {
  return positiveNumber(step?.seconds, 0.2);
}

function makeActionStep(mode, value, seconds = 0.2) {
  const { targetType, targetValue } = parseActionTarget(value);
  if (targetType === "mouse") {
    const button = normalizeMouseButton(targetValue);
    return mode === "hold"
      ? { kind: "hold-click", button, seconds: positiveNumber(seconds, 0.2) }
      : { kind: "click", button };
  }

  const key = normalizeKey(targetValue);
  return mode === "hold"
    ? { kind: "hold-key", key, seconds: positiveNumber(seconds, 0.2) }
    : { kind: "press", key };
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

function nextAvailableTrigger(index) {
  const used = new Set();
  if (state?.visualModel?.macros) {
    for (const macro of state.visualModel.macros) {
      for (const trigger of macro.triggerButtons || []) used.add(trigger);
    }
  }
  const fallback = [
    "BTN_SIDE",
    "BTN_EXTRA",
    "KEY_BACK",
    "KEY_FORWARD",
    "KEY_F1",
    "KEY_F2",
    "KEY_F3",
    "KEY_F4",
    "KEY_F5",
    "KEY_F6",
    "KEY_F7",
    "KEY_F8",
    "KEY_F9",
    "KEY_F10",
    "KEY_F11",
    "KEY_F12",
  ];
  return fallback.find((trigger) => !used.has(trigger)) || `KEY_${String.fromCharCode(65 + (index % 26))}`;
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

[visualName, visualDescription, visualBackend, visualStart].forEach((element) => {
  element.addEventListener("input", updateVisualBasics);
  element.addEventListener("change", updateVisualBasics);
});

triggerSuggestions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add-trigger]");
  if (!button) return;
  addTrigger(button.dataset.addTrigger);
  renderTriggerSuggestions();
});
triggerSuggestions.addEventListener("dragstart", handleTriggerDragStart);
triggerSuggestions.addEventListener("dragend", handleTriggerDragEnd);

triggerChips.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-trigger]");
  if (!button) return;
  removeTrigger(Number(button.dataset.removeTrigger));
});

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
addEveryTaskButton.addEventListener("click", () => addTask("every"));
addSequenceTaskButton.addEventListener("click", () => addTask("sequence"));
saveNowButton.addEventListener("click", () => saveConfig());
powerToggleButton.addEventListener("click", togglePower);
installYdotoolButton.addEventListener("click", installYdotool);

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

setTheme(localStorage.getItem("linuxmacro-theme") || "mocha");
renderCounts();
renderVisualEditor();
loadConfig();
refreshMacroStatus();
refreshBackendHealth();
setInterval(refreshMacroStatus, 1000);
