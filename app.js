const STORAGE_KEY = "workTimeTracker.v1";
const SESSION_KEY = "workTimeTracker.session.v1";
const THEME_KEY = "workTimeTracker.theme";
const JSON_FILE = "work-time-tracker-data.json";

let state = {
  data: { days: {} },
  mode: "stopwatch",
  running: false,
  startedAt: null,
  pausedElapsed: 0,
  countdownDuration: 0,
  countdownRemaining: 0,
  countdownFinished: false,
  alarmOn: false,
  audioContext: null
};

const el = {
  todayLabel: document.getElementById("todayLabel"),
  todayTotal: document.getElementById("todayTotal"),
  todayTaskCount: document.getElementById("todayTaskCount"),
  weekTotal: document.getElementById("weekTotal"),
  timerDisplay: document.getElementById("timerDisplay"),
  timerStatus: document.getElementById("timerStatus"),
  modeTitle: document.getElementById("modeTitle"),
  taskName: document.getElementById("taskName"),
  taskInputWrap: document.getElementById("taskInputWrap"),
  countdownWrap: document.getElementById("countdownWrap"),
  hoursInput: document.getElementById("hoursInput"),
  minutesInput: document.getElementById("minutesInput"),
  secondsInput: document.getElementById("secondsInput"),
  startPauseBtn: document.getElementById("startPauseBtn"),
  resetTimerBtn: document.getElementById("resetTimerBtn"),
  finishBtn: document.getElementById("finishBtn"),
  todayTasks: document.getElementById("todayTasks"),
  todayEmpty: document.getElementById("todayEmpty"),
  historyList: document.getElementById("historyList"),
  historyEmpty: document.getElementById("historyEmpty"),
  historyFilter: document.getElementById("historyFilter"),
  resetDayBtn: document.getElementById("resetDayBtn"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  alarmBar: document.getElementById("alarmBar"),
  stopAlarmBtn: document.getElementById("stopAlarmBtn"),
  themeToggle: document.getElementById("themeToggle"),
  confirmModal: document.getElementById("confirmModal"),
  modalTitle: document.getElementById("modalTitle"),
  modalText: document.getElementById("modalText"),
  modalCancel: document.getElementById("modalCancel"),
  modalConfirm: document.getElementById("modalConfirm"),
  exportDataBtn: document.getElementById("exportDataBtn"),
  importDataBtn: document.getElementById("importDataBtn"),
  importDataInput: document.getElementById("importDataInput")
};

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeData(data) {
  if (!data || typeof data !== "object") return { days: {} };

  if (!data.days || typeof data.days !== "object" || Array.isArray(data.days)) {
    data.days = {};
  }

  Object.keys(data.days).forEach(key => {
    if (!data.days[key] || !Array.isArray(data.days[key].tasks)) {
      data.days[key] = { tasks: [] };
    }

    data.days[key].tasks = data.days[key].tasks
      .filter(task => task && typeof task === "object")
      .map(task => ({
        id: task.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: String(task.name || "Untitled task"),
        start: Number(task.start) || Date.now(),
        end: Number(task.end) || Date.now(),
        duration: Math.max(0, Number(task.duration) || 0)
      }));
  });

  return data;
}

function loadLocalData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeData(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function loadJsonFile() {
  try {
    const response = await fetch(JSON_FILE, { cache: "no-store" });
    if (!response.ok) return null;

    const json = await response.json();
    return normalizeData(json.data || json);
  } catch {
    return null;
  }
}

async function initializeData() {
  const localData = loadLocalData();

  if (localData) {
    state.data = localData;
    return;
  }

  const jsonData = await loadJsonFile();
  state.data = jsonData || { days: {} };
  saveData();
}

function saveData() {
  state.data = normalizeData(state.data);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function saveSessionState() {
  const session = {
    mode: state.mode,
    running: state.running,
    startedAt: state.startedAt,
    pausedElapsed: state.pausedElapsed,
    countdownDuration: state.countdownDuration,
    countdownRemaining: state.running
      ? countdownRemainingNow()
      : state.countdownRemaining,
    countdownFinished: state.countdownFinished,
    taskName: el.taskName.value,
    hours: el.hoursInput.value,
    minutes: el.minutesInput.value,
    seconds: el.secondsInput.value
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function loadSessionState() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;

    const session = JSON.parse(raw);
    if (!session || typeof session !== "object") return;

    state.mode = session.mode === "countdown" ? "countdown" : "stopwatch";
    state.running = Boolean(session.running);
    state.startedAt = Number(session.startedAt) || null;
    state.pausedElapsed = Math.max(0, Number(session.pausedElapsed) || 0);
    state.countdownDuration = Math.max(0, Number(session.countdownDuration) || 0);
    state.countdownRemaining = Math.max(0, Number(session.countdownRemaining) || 0);
    state.countdownFinished = Boolean(session.countdownFinished);

    if (session.taskName) el.taskName.value = session.taskName;
    if (session.hours !== undefined) el.hoursInput.value = session.hours;
    if (session.minutes !== undefined) el.minutesInput.value = session.minutes;
    if (session.seconds !== undefined) el.secondsInput.value = session.seconds;

    if (state.running && !state.startedAt) state.running = false;

    if (
      state.mode === "countdown" &&
      state.running &&
      countdownRemainingNow() <= 0
    ) {
      state.running = false;
      state.startedAt = null;
      state.countdownRemaining = 0;
      state.countdownFinished = true;
      saveSessionState();
    }
  } catch {
    localStorage.removeItem(SESSION_KEY);
  }
}

function clearSessionState() {
  localStorage.removeItem(SESSION_KEY);
}

function getDay(key = todayKey()) {
  if (!state.data.days[key]) state.data.days[key] = { tasks: [] };
  return state.data.days[key];
}

function formatDuration(totalSeconds) {
  totalSeconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(n => String(n).padStart(2, "0")).join(":");
}

function formatHumanDuration(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function dayTotal(key) {
  return getDay(key).tasks.reduce((sum, task) => sum + task.duration, 0);
}

function weekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function monthStart(date = new Date()) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateFromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(key) {
  return dateFromKey(key).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function stopwatchElapsed() {
  if (!state.running) return state.pausedElapsed;
  return state.pausedElapsed + Math.floor((Date.now() - state.startedAt) / 1000);
}

function countdownRemainingNow() {
  if (!state.running) return state.countdownRemaining;

  return Math.max(
    0,
    state.countdownRemaining -
      Math.floor((Date.now() - state.startedAt) / 1000)
  );
}

function currentElapsed() {
  if (state.mode === "countdown") {
    return state.countdownDuration - countdownRemainingNow();
  }

  return stopwatchElapsed();
}

function updateDisplay() {
  const elapsed = currentElapsed();

  if (state.mode === "stopwatch") {
    el.timerDisplay.textContent = formatDuration(stopwatchElapsed());
  } else {
    el.timerDisplay.textContent = formatDuration(countdownRemainingNow());
  }

  el.finishBtn.disabled = elapsed <= 0;

  if (state.running) {
    el.startPauseBtn.textContent = "⏸ Pause";
    el.timerStatus.textContent =
      state.mode === "countdown" ? "Timer is running" : "Working now";
  } else if (state.mode === "countdown" && state.countdownFinished) {
    el.startPauseBtn.textContent = "▶ Start";
    el.timerStatus.textContent = "Timer finished — click Finish to save it";
  } else if (elapsed > 0) {
    el.startPauseBtn.textContent = "▶ Resume";
    el.timerStatus.textContent = "Paused";
  } else {
    el.startPauseBtn.textContent = "▶ Start";
    el.timerStatus.textContent =
      state.mode === "countdown" ? "Set a duration and start" : "Ready to work";
  }
}

function renderStats() {
  el.todayTotal.textContent = formatDuration(dayTotal());
  el.todayTaskCount.textContent = getDay().tasks.length;

  const start = weekStart();
  let total = 0;

  Object.keys(state.data.days).forEach(key => {
    if (dateFromKey(key) >= start) total += dayTotal(key);
  });

  el.weekTotal.textContent = formatDuration(total);
}

function renderToday() {
  const tasks = [...getDay().tasks].reverse();

  el.todayTasks.innerHTML = tasks.map(task => `
    <div class="task-item">
      <div class="task-info">
        <span class="task-name">${escapeHtml(task.name)}</span>
        <span class="task-time">${formatTime(task.start)} – ${formatTime(task.end)}</span>
      </div>
      <span class="task-duration">${formatDuration(task.duration)}</span>
    </div>
  `).join("");

  el.todayEmpty.classList.toggle("hidden", tasks.length > 0);
}

function renderHistory() {
  const filter = el.historyFilter.value;
  const now = new Date();
  const start =
    filter === "week"
      ? weekStart(now)
      : filter === "month"
        ? monthStart(now)
        : null;

  const days = Object.keys(state.data.days)
    .filter(key => state.data.days[key].tasks.length)
    .filter(key => !start || dateFromKey(key) >= start)
    .sort((a, b) => b.localeCompare(a));

  el.historyList.innerHTML = days.map(key => {
    const tasks = [...state.data.days[key].tasks].reverse();

    return `
      <div class="history-day">
        <div class="history-day-head">
          <span class="history-day-title">${formatDate(key)}</span>
          <span class="history-day-total">${formatHumanDuration(dayTotal(key))}</span>
        </div>
        <div class="history-day-tasks">
          ${tasks.map(task => `
            <div class="task-item">
              <div class="task-info">
                <span class="task-name">${escapeHtml(task.name)}</span>
                <span class="task-time">${formatTime(task.start)} – ${formatTime(task.end)}</span>
              </div>
              <span class="task-duration">${formatDuration(task.duration)}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");

  el.historyEmpty.classList.toggle("hidden", days.length > 0);
}

function renderAll() {
  el.todayLabel.textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });

  renderStats();
  renderToday();
  renderHistory();
  updateDisplay();
}

function setMode(mode) {
  if (state.running) pauseSession();

  state.mode = mode;
  state.countdownFinished = false;
  state.countdownDuration = 0;
  state.countdownRemaining = 0;

  document.querySelectorAll(".mode-button").forEach(button => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });

  const isTimer = mode === "countdown";
  el.modeTitle.textContent = isTimer ? "Countdown Timer" : "Stopwatch";
  el.taskInputWrap.classList.remove("hidden");
  el.countdownWrap.classList.toggle("hidden", !isTimer);
  el.finishBtn.classList.remove("hidden");

  stopAlarm();
  resetTimer(false);
  saveSessionState();
  updateDisplay();
}

function getCountdownInput() {
  const h = Math.min(99, Math.max(0, Number(el.hoursInput.value) || 0));
  const m = Math.min(59, Math.max(0, Number(el.minutesInput.value) || 0));
  const s = Math.min(59, Math.max(0, Number(el.secondsInput.value) || 0));

  el.hoursInput.value = h;
  el.minutesInput.value = m;
  el.secondsInput.value = s;

  return h * 3600 + m * 60 + s;
}

function startSession() {
  const name = el.taskName.value.trim();

  if (!name) {
    el.taskName.focus();
    el.taskName.placeholder = "Enter a task name first";
    return;
  }

  if (state.mode === "countdown") {
    if (!state.running && state.countdownRemaining <= 0) {
      const duration = getCountdownInput();
      if (duration <= 0) return;

      state.countdownDuration = duration;
      state.countdownRemaining = duration;
      state.countdownFinished = false;
    }
  }

  state.startedAt = Date.now();
  state.running = true;

  stopAlarm();
  ensureAudio();
  saveSessionState();
  updateDisplay();
}

function pauseSession() {
  if (!state.running) return;

  if (state.mode === "stopwatch") {
    state.pausedElapsed += Math.floor(
      (Date.now() - state.startedAt) / 1000
    );
  } else {
    state.countdownRemaining = countdownRemainingNow();
  }

  state.running = false;
  state.startedAt = null;

  saveSessionState();
  updateDisplay();
}

function finishTask() {
  const duration = Math.floor(currentElapsed());
  const name = el.taskName.value.trim();

  if (!name || duration <= 0) {
    el.taskName.focus();
    return;
  }

  const now = Date.now();
  const start = now - duration * 1000;

  getDay().tasks.push({
    id: `${now}-${Math.random().toString(36).slice(2)}`,
    name,
    start,
    end: now,
    duration
  });

  saveData();

  state.running = false;
  state.startedAt = null;
  state.pausedElapsed = 0;
  state.countdownDuration = 0;
  state.countdownRemaining = 0;
  state.countdownFinished = false;

  el.taskName.value = "";

  stopAlarm();
  clearSessionState();
  renderAll();
}

function resetTimer(confirm = true) {
  const hasWork = currentElapsed() > 0;

  if (confirm && (state.running || hasWork)) {
    showConfirm(
      "Reset current timer?",
      "The current session will be discarded and will not be added to history.",
      () => resetTimer(false)
    );
    return;
  }

  state.running = false;
  state.startedAt = null;
  state.pausedElapsed = 0;
  state.countdownDuration = 0;
  state.countdownRemaining = 0;
  state.countdownFinished = false;

  stopAlarm();
  clearSessionState();
  updateDisplay();
}

function finishCountdown() {
  if (!state.running) return;

  state.countdownRemaining = countdownRemainingNow();
  state.running = false;
  state.startedAt = null;
  state.countdownRemaining = 0;
  state.countdownFinished = true;

  saveSessionState();
  playAlarm();
  updateDisplay();
}

function tick() {
  if (
    state.mode === "countdown" &&
    state.running &&
    countdownRemainingNow() <= 0
  ) {
    finishCountdown();
    return;
  }

  updateDisplay();
}

function ensureAudio() {
  if (!state.audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) state.audioContext = new AudioCtx();
  }

  if (state.audioContext?.state === "suspended") {
    state.audioContext.resume();
  }
}

function playAlarm() {
  ensureAudio();
  if (!state.audioContext) return;

  const ctx = state.audioContext;
  const start = ctx.currentTime;

  [0, 0.35, 0.7, 1.05].forEach(offset => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = offset % 0.7 === 0 ? 880 : 660;

    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(
      0.22,
      start + offset + 0.02
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + offset + 0.28
    );

    osc.connect(gain).connect(ctx.destination);
    osc.start(start + offset);
    osc.stop(start + offset + 0.3);
  });

  state.alarmOn = true;
  el.alarmBar.classList.remove("hidden");
}

function stopAlarm() {
  state.alarmOn = false;
  el.alarmBar.classList.add("hidden");
}

function resetDay() {
  if (state.running || currentElapsed() > 0) {
    showConfirm(
      "Reset today's record?",
      "Your completed history will remain, but the current unfinished session will be discarded.",
      performResetDay
    );
  } else {
    showConfirm(
      "Reset today's view?",
      "Today's completed tasks will be kept in History. This only prepares the tracker for a new day.",
      performResetDay
    );
  }
}

function performResetDay() {
  resetTimer(false);
  state.data.days[todayKey()] = { tasks: [] };
  saveData();
  renderAll();
}

function clearHistory() {
  showConfirm(
    "Clear all history?",
    "This permanently deletes every completed task stored in this browser. This cannot be undone.",
    () => {
      state.data.days = {};
      saveData();
      renderAll();
    }
  );
}

let modalAction = null;

function showConfirm(title, text, action) {
  el.modalTitle.textContent = title;
  el.modalText.textContent = text;
  modalAction = action;
  el.confirmModal.classList.remove("hidden");
}

function closeModal() {
  modalAction = null;
  el.confirmModal.classList.add("hidden");
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  el.themeToggle.textContent = theme === "dark" ? "☀" : "☾";
  localStorage.setItem(THEME_KEY, theme);
}

function exportPageDataAsJson() {
  saveData();
  saveSessionState();

  const payload = {
    app: "Work Time Tracker",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: state.data,
    session: JSON.parse(localStorage.getItem(SESSION_KEY) || "null")
  };

  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "work-time-tracker-data.json";

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function importPageDataFromJson(file) {
  const reader = new FileReader();

  reader.onload = () => {
    try {
      const payload = JSON.parse(reader.result);

      if (!payload || typeof payload !== "object" || !payload.data) {
        throw new Error("Invalid JSON");
      }

      state.data = normalizeData(payload.data);
      saveData();

      if (payload.session) {
        localStorage.setItem(
          SESSION_KEY,
          JSON.stringify(payload.session)
        );
      } else {
        clearSessionState();
      }

      location.reload();
    } catch {
      alert("Could not import this Work Time Tracker JSON file.");
    }
  };

  reader.readAsText(file);
}

document.querySelectorAll(".mode-button").forEach(button => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

el.startPauseBtn.addEventListener("click", () => {
  if (state.running) pauseSession();
  else startSession();
});

el.resetTimerBtn.addEventListener("click", () => resetTimer(true));
el.finishBtn.addEventListener("click", finishTask);
el.stopAlarmBtn.addEventListener("click", stopAlarm);
el.resetDayBtn.addEventListener("click", resetDay);
el.clearHistoryBtn.addEventListener("click", clearHistory);
el.historyFilter.addEventListener("change", renderHistory);

el.themeToggle.addEventListener("click", () => {
  const current = document.documentElement.dataset.theme || "light";
  applyTheme(current === "dark" ? "light" : "dark");
});

el.modalCancel.addEventListener("click", closeModal);

el.modalConfirm.addEventListener("click", () => {
  const action = modalAction;
  closeModal();
  if (action) action();
});

el.confirmModal.addEventListener("click", event => {
  if (event.target === el.confirmModal) closeModal();
});

[el.hoursInput, el.minutesInput, el.secondsInput].forEach(input => {
  input.addEventListener("input", () => {
    if (!state.running && state.mode === "countdown") {
      const duration = getCountdownInput();
      state.countdownDuration = duration;
      state.countdownRemaining = duration;
      state.countdownFinished = false;
      saveSessionState();
      updateDisplay();
    }
  });
});

el.exportDataBtn?.addEventListener("click", exportPageDataAsJson);

el.importDataBtn?.addEventListener("click", () => {
  el.importDataInput?.click();
});

el.importDataInput?.addEventListener("change", event => {
  const file = event.target.files?.[0];
  if (file) importPageDataFromJson(file);
});

window.addEventListener("beforeunload", () => {
  if (state.running) {
    saveSessionState();
  } else if (state.countdownFinished || currentElapsed() > 0) {
    saveSessionState();
  }

  saveData();
});

async function init() {
  await initializeData();
  loadSessionState();

  document.querySelectorAll(".mode-button").forEach(button => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });

  const isTimer = state.mode === "countdown";
  el.modeTitle.textContent = isTimer ? "Countdown Timer" : "Stopwatch";
  el.countdownWrap.classList.toggle("hidden", !isTimer);
  el.finishBtn.classList.remove("hidden");

  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  renderAll();

  if (state.mode === "countdown" && state.countdownFinished) {
    playAlarm();
  }

  setInterval(tick, 250);
}

init();
