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
  ["space", "KEY_SPACE", "空格键"],
  ["browserback", "KEY_BACK", "浏览器后退"],
  ["browserforward", "KEY_FORWARD", "浏览器前进"],
  ["enter", "KEY_ENTER", "回车"],
  ["tab", "KEY_TAB", "Tab"],
  ["esc", "KEY_ESC", "Esc"],
  ...Array.from("abcdefghijklmnopqrstuvwxyz", (key) => [key, `KEY_${key.toUpperCase()}`, `字母 ${key}`]),
  ...Array.from("0123456789", (key) => [key, `KEY_${key}`, `数字 ${key}`]),
];

const state = {
  saveTimer: null,
  validateToken: 0,
  currentPath: "~/.config/linuxmacro/config.macro",
  currentMacroStatus: null,
  visualModel: defaultVisualModel(),
  visualEditingTimer: null,
  visualEditing: false,
  pendingSaveOptions: {},
};

function invoke(command, args = {}) {
  if (!tauriInvoke) {
    return Promise.reject(new Error("Tauri API 未连接，请在 Tauri 应用窗口中打开。"));
  }
  return tauriInvoke(command, args);
}

function defaultVisualModel() {
  return {
    enabled: true,
    name: "R and A demo",
    description: "Press r and a; side/extra/space toggles.",
    backend: "auto",
    startRunning: false,
    grabToggleDevice: false,
    toggleButtons: ["BTN_EXTRA", "KEY_FORWARD", "KEY_SPACE"],
    tasks: [
      { type: "every", interval: 1, steps: [{ kind: "press", key: "r" }] },
      { type: "every", interval: 0.4, steps: [{ kind: "press", key: "a" }] },
    ],
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
    validationMessage.textContent = `解析成功：${report.task_count} 个任务，${report.line_count} 行。`;
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
    macroStateText.textContent = status?.enabled === false ? "宏已禁用，请在高级脚本中改为 enabled on。" : "点击启动会读取当前配置文件并在后台运行宏。";
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
  macroStateText.textContent = `${name} · ${backend} · ${status.task_count} 个任务 · ${status.last_event}`;
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

  macroSummary.innerHTML = [
    ["名称", program.name],
    ["启用", program.enabled ? "on" : "off"],
    ["后端", program.backend],
    ["启动", program.start_running ? "running" : "paused"],
    ["触发", program.toggle_buttons.join(", ")],
    ["抓取设备", program.grab_toggle_device ? "on" : "off"],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");

  taskList.innerHTML = program.tasks
    .map((task, index) => {
      return `<div class="task-item">
        <span>${index + 1}</span>
        <p>${escapeHtml(task.description)}</p>
      </div>`;
    })
    .join("");
}

function syncVisualFromProgram(program) {
  if (!program) return;
  state.visualModel = programToVisualModel(program);
  renderVisualEditor();
}

function programToVisualModel(program) {
  return {
    enabled: program.enabled ?? true,
    name: program.name || "Macro",
    description: program.description || "",
    backend: program.backend || "auto",
    startRunning: Boolean(program.start_running),
    grabToggleDevice: Boolean(program.grab_toggle_device),
    toggleButtons: [...(program.toggle_buttons || ["KEY_SPACE"])],
    tasks: (program.tasks || []).map((task) => {
      const steps = (task.steps || []).map((step) => {
        if (step.kind === "wait") return { kind: "wait", seconds: Number(step.seconds) || 0.2 };
        return { kind: "press", key: step.key || "space" };
      });
      return {
        type: steps.length === 1 && steps[0].kind === "press" ? "every" : "sequence",
        interval: Number(task.interval) || 1,
        steps: steps.length ? steps : [{ kind: "press", key: "space" }],
      };
    }),
  };
}

function renderVisualEditor() {
  const model = normalizeVisualModel(state.visualModel);
  visualName.value = model.name;
  visualDescription.value = model.description;
  visualBackend.value = model.backend;
  visualStart.value = model.startRunning ? "running" : "paused";
  renderTriggerChips();
  renderTriggerSuggestions();
  renderFlowTasks();
}

function normalizeVisualModel(model) {
  model.enabled = true;
  model.name = model.name || "Macro";
  model.description = model.description || "";
  model.backend = ["auto", "ydotool", "xdotool"].includes(model.backend) ? model.backend : "auto";
  model.grabToggleDevice = false;
  model.toggleButtons = Array.isArray(model.toggleButtons) && model.toggleButtons.length ? model.toggleButtons : ["KEY_SPACE"];
  model.tasks = Array.isArray(model.tasks) && model.tasks.length ? model.tasks : [{ type: "every", interval: 1, steps: [{ kind: "press", key: "space" }] }];
  model.tasks.forEach((task) => {
    task.interval = Number(task.interval) > 0 ? Number(task.interval) : 1;
    task.steps = Array.isArray(task.steps) && task.steps.length ? task.steps : [{ kind: "press", key: "space" }];
    if (!task.type) task.type = task.steps.length === 1 && task.steps[0].kind === "press" ? "every" : "sequence";
    if (task.type === "every") task.steps = [{ kind: "press", key: firstPressKey(task) }];
  });
  return model;
}

function renderTriggerChips() {
  triggerChips.innerHTML = state.visualModel.toggleButtons
    .map((trigger, index) => {
      return `<button class="chip" data-remove-trigger="${index}" type="button">
        <span>${escapeHtml(trigger)}</span><b>×</b>
      </button>`;
    })
    .join("");
}

function renderTriggerSuggestions() {
  const matches = TRIGGER_OPTIONS.slice(0, 10);

  triggerSuggestions.innerHTML = matches
    .map(([alias, canonical, description]) => {
      const selected = state.visualModel.toggleButtons.includes(canonical);
      return `<button class="suggestion-item" data-add-trigger="${escapeHtml(canonical)}" type="button" ${selected ? "disabled" : ""}>
        <strong>${escapeHtml(alias)}</strong>
        <span>${escapeHtml(canonical)}</span>
        <small>${escapeHtml(description)}</small>
      </button>`;
    })
    .join("");
}

function renderFlowTasks() {
  flowTasks.innerHTML = state.visualModel.tasks
    .map((task, taskIndex) => {
      const type = task.type === "sequence" ? "sequence" : "every";
      const body = type === "every" ? renderEveryTask(task, taskIndex) : renderSequenceTask(task, taskIndex);
      return `<article class="flow-card" data-task-card="${taskIndex}">
        <div class="flow-card-head">
          <span class="flow-number">${taskIndex + 1}</span>
          <select data-task-index="${taskIndex}" data-task-field="type">
            <option value="every" ${type === "every" ? "selected" : ""}>循环按键</option>
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
  return `<div class="loop-flow">
    <label class="flow-node process editable">
      <span>按键</span>
      <input data-task-index="${taskIndex}" data-every-key type="text" value="${escapeHtml(firstPressKey(task))}" />
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
      <button class="ghost-button compact-button" data-add-step="press" data-task-index="${taskIndex}" type="button">添加按键</button>
      <button class="ghost-button compact-button" data-add-step="wait" data-task-index="${taskIndex}" type="button">添加等待</button>
    </div>
  </div>`;
}

function renderStepNode(step, taskIndex, stepIndex) {
  const isWait = step.kind === "wait";
  const value = isWait ? formatNumber(step.seconds || 0.2) : step.key || "space";
  return `<div class="flow-node step-node">
    <select data-task-index="${taskIndex}" data-step-index="${stepIndex}" data-step-field="kind">
      <option value="press" ${!isWait ? "selected" : ""}>按键</option>
      <option value="wait" ${isWait ? "selected" : ""}>等待</option>
    </select>
    <input data-task-index="${taskIndex}" data-step-index="${stepIndex}" data-step-field="value"
      type="${isWait ? "number" : "text"}" min="0.001" step="0.001" value="${escapeHtml(value)}" />
    <button class="delete-button" data-remove-step="${stepIndex}" data-task-index="${taskIndex}" type="button" aria-label="删除步骤">×</button>
  </div>`;
}

function updateVisualBasics() {
  state.visualModel.enabled = true;
  state.visualModel.name = visualName.value.trim() || "Macro";
  state.visualModel.description = visualDescription.value.trim();
  state.visualModel.backend = visualBackend.value;
  state.visualModel.startRunning = visualStart.value === "running";
  state.visualModel.grabToggleDevice = false;
  syncScriptFromVisual();
}

function addTrigger(canonical) {
  if (!state.visualModel.toggleButtons.includes(canonical)) {
    state.visualModel.toggleButtons.push(canonical);
    renderTriggerChips();
    renderTriggerSuggestions();
    syncScriptFromVisual();
  }
}

function removeTrigger(index) {
  state.visualModel.toggleButtons.splice(index, 1);
  normalizeVisualModel(state.visualModel);
  renderTriggerChips();
  renderTriggerSuggestions();
  syncScriptFromVisual();
}

function addTask(type) {
  state.visualModel.tasks.push(
    type === "sequence"
      ? { type: "sequence", interval: 3, steps: [{ kind: "press", key: "r" }, { kind: "wait", seconds: 0.2 }, { kind: "press", key: "a" }] }
      : { type: "every", interval: 1, steps: [{ kind: "press", key: "space" }] },
  );
  renderFlowTasks();
  syncScriptFromVisual();
}

function handleFlowInput(event) {
  const target = event.target;
  const taskIndex = Number(target.dataset.taskIndex);
  if (!Number.isInteger(taskIndex) || !state.visualModel.tasks[taskIndex]) return;
  const task = state.visualModel.tasks[taskIndex];

  if (target.dataset.taskField === "interval") {
    task.interval = positiveNumber(target.value, 1);
    syncScriptFromVisual();
    return;
  }

  if (target.dataset.taskField === "type") {
    task.type = target.value;
    if (task.type === "every") {
      task.steps = [{ kind: "press", key: firstPressKey(task) }];
    } else if (task.steps.length === 1) {
      task.steps.push({ kind: "wait", seconds: 0.2 }, { kind: "press", key: "a" });
    }
    renderFlowTasks();
    syncScriptFromVisual();
    return;
  }

  if (target.hasAttribute("data-every-key")) {
    task.steps = [{ kind: "press", key: normalizeKey(target.value) }];
    syncScriptFromVisual();
    return;
  }

  const stepIndex = Number(target.dataset.stepIndex);
  if (!Number.isInteger(stepIndex) || !task.steps[stepIndex]) return;
  const step = task.steps[stepIndex];
  if (target.dataset.stepField === "kind") {
    task.steps[stepIndex] = target.value === "wait" ? { kind: "wait", seconds: 0.2 } : { kind: "press", key: "space" };
    renderFlowTasks();
    syncScriptFromVisual();
  } else if (target.dataset.stepField === "value") {
    if (step.kind === "wait") {
      step.seconds = positiveNumber(target.value, 0.2);
    } else {
      step.key = normalizeKey(target.value);
    }
    syncScriptFromVisual();
  }
}

function handleFlowClick(event) {
  const removeTaskIndex = event.target.closest("[data-remove-task]")?.dataset.removeTask;
  if (removeTaskIndex !== undefined) {
    state.visualModel.tasks.splice(Number(removeTaskIndex), 1);
    normalizeVisualModel(state.visualModel);
    renderFlowTasks();
    syncScriptFromVisual();
    return;
  }

  const addStepButton = event.target.closest("[data-add-step]");
  if (addStepButton) {
    const task = state.visualModel.tasks[Number(addStepButton.dataset.taskIndex)];
    task.type = "sequence";
    task.steps.push(addStepButton.dataset.addStep === "wait" ? { kind: "wait", seconds: 0.2 } : { kind: "press", key: "space" });
    renderFlowTasks();
    syncScriptFromVisual();
    return;
  }

  const removeStepButton = event.target.closest("[data-remove-step]");
  if (removeStepButton) {
    const task = state.visualModel.tasks[Number(removeStepButton.dataset.taskIndex)];
    task.steps.splice(Number(removeStepButton.dataset.removeStep), 1);
    normalizeVisualModel(state.visualModel);
    renderFlowTasks();
    syncScriptFromVisual();
  }
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
  const lines = [
    "# LinuxMacro configuration",
    "# Generated by graphical editor.",
    "",
    `name ${model.name || "Macro"}`,
  ];

  if (model.description) lines.push(`description ${model.description}`);
  lines.push(`enabled ${model.enabled ? "on" : "off"}`);
  lines.push(`backend ${model.backend || "auto"}`);
  lines.push(`toggle ${model.toggleButtons.join(" ")}`);
  lines.push(`grab ${model.grabToggleDevice ? "on" : "off"}`);
  lines.push(`start ${model.startRunning ? "running" : "paused"}`);
  lines.push("");

  for (const task of model.tasks) {
    if (task.type === "every") {
      lines.push(`every ${formatDuration(task.interval)} press ${firstPressKey(task)}`);
    } else {
      lines.push(`sequence ${formatDuration(task.interval)} {`);
      for (const step of task.steps) {
        if (step.kind === "wait") {
          lines.push(`  wait ${formatDuration(step.seconds || 0.2)}`);
        } else {
          lines.push(`  press ${normalizeKey(step.key || "space")}`);
        }
      }
      lines.push("}");
    }
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
      await saveConfig({ throwOnError: true });
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

function firstPressKey(task) {
  return task.steps.find((step) => step.kind === "press")?.key || "space";
}

function normalizeKey(value) {
  const text = String(value || "space").trim().toLowerCase();
  return text || "space";
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

triggerChips.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-trigger]");
  if (!button) return;
  removeTrigger(Number(button.dataset.removeTrigger));
});

flowTasks.addEventListener("input", handleFlowInput);
flowTasks.addEventListener("change", handleFlowInput);
flowTasks.addEventListener("click", handleFlowClick);

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
