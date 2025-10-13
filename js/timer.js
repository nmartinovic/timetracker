// timer.js
import {
  PERSIST_EVERY_MS, UP_REM_MS, MAX_UP_MS,
  formatTime, formatExcelDateString, durationStringFromDates,
  getSystemTZ, ymdInTZ, localDateTimeStrToUTCDate
} from './utils.js';


const q = sel => document.querySelector(sel);

function getDisplayTZ() {
  return localStorage.getItem('displayTZ') || getSystemTZ();
}

function parseTimeOfDay(raw) {
  const m = String(raw || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = +m[1], mm = +m[2];
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}

function computeEndMsFromLocalTime(hh, mm, tz) {
  const pad = n => String(n).padStart(2, '0');
  const now = new Date();
  // today at hh:mm in tz
  const todayYMD = ymdInTZ(now, tz);
  const todayLocalStr = `${todayYMD}T${pad(hh)}:${pad(mm)}`;
  let target = localDateTimeStrToUTCDate(todayLocalStr, tz).getTime();

  // if already passed, use tomorrow at hh:mm in tz
  if (target <= Date.now()) {
    const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    localNow.setDate(localNow.getDate() + 1);
    const tomorrowYMD = ymdInTZ(localNow, tz);
    const tomorrowLocalStr = `${tomorrowYMD}T${pad(hh)}:${pad(mm)}`;
    target = localDateTimeStrToUTCDate(tomorrowLocalStr, tz).getTime();
  }
  return target;
}


// ===== Shared state =====
const state = {
  timer: null,
  mode: null,           // 'down' | 'up' | null
  startTime: null,      // ms
  endTime: null,        // ms for countdown
  task: null,           // may be '' during count-up to force finalize modal
  durationMin: null,
  hasLoggedCurrent: false,
  dingTimeout: null,
  nextUpReminderAt: null, // ms
  lastPersist: 0,
  lastTitleText: '',
  lastCountdownText: '',
  lastTimerActivity: parseInt(localStorage.getItem('lastTimerActivity') || String(Date.now()), 10),
  // mutes
  muteSound: JSON.parse(localStorage.getItem('muteSound') || 'false'),
  muteNotifications: JSON.parse(localStorage.getItem('muteNotifications') || 'false'),
  muteReminders: JSON.parse(localStorage.getItem('muteReminders') || 'false'),
};

// ===== Persistence for active timer =====
function writeActiveTimer() {
  if (!state.startTime) return;
  const payload = {
    task: typeof state.task === 'string' ? state.task : '',
    startMs: state.startTime,
    endMs: state.endTime ?? null,
    hasLogged: !!state.hasLoggedCurrent,
    mode: state.mode || null,
    nextUpReminderAt: state.nextUpReminderAt ?? null
  };
  localStorage.setItem('active_timer', JSON.stringify(payload));
}
function clearActiveTimer() { localStorage.removeItem('active_timer'); }
function loadActiveTimer() {
  try { return JSON.parse(localStorage.getItem('active_timer') || 'null'); }
  catch(e){ return null; }
}

// ===== Activity & mutes =====
export function markActivity() {
  state.lastTimerActivity = Date.now();
  localStorage.setItem('lastTimerActivity', String(state.lastTimerActivity));
}
export function msSinceLastActivity() { return Date.now() - state.lastTimerActivity; }

export function getMutes() {
  return { sound: state.muteSound, notifications: state.muteNotifications, reminders: state.muteReminders };
}
export function setMuteSound(v) {
  state.muteSound = !!v; localStorage.setItem('muteSound', JSON.stringify(state.muteSound));
  const ding = q('#ding');
  if (state.muteSound && ding && !ding.paused) { try { ding.pause(); } catch(e){} }
}
export function setMuteNotifications(v) {
  state.muteNotifications = !!v; localStorage.setItem('muteNotifications', JSON.stringify(state.muteNotifications));
}
export function setMuteReminders(v) {
  state.muteReminders = !!v; localStorage.setItem('muteReminders', JSON.stringify(state.muteReminders));
}

export function isTimerRunning() { return state.timer !== null; }
export function getMode() { return state.mode; }
export function getCurrentStartMs() { return state.startTime; }
export function getCountdownDurationMin() { return state.mode === 'down' ? state.durationMin : null; }

// ===== Core timer controls =====
export function startTimer() {
  const task = q('#task').value.trim();
  const raw = q('#duration').value.trim();

  // Accept HH:MM (time-of-day in display TZ) OR numeric minutes
  const tod = parseTimeOfDay(raw);
  let minutes = null;
  let specificEndMs = null;

  if (tod) {
    const tz = getDisplayTZ();
    specificEndMs = computeEndMsFromLocalTime(tod.hh, tod.mm, tz);
    const diffMs = Math.max(0, specificEndMs - Date.now());
    minutes = Math.max(1, Math.ceil(diffMs / 60000)); // keep durationMin coherent
  } else {
    minutes = parseInt(raw, 10);
  }

  if (!task || isNaN(minutes) || minutes < 1) {
    alert('Please enter a valid task and either minutes (e.g., 25) or a time (e.g., 15:21).');
    return;
  }

  state.mode = 'down';
  state.startTime = Date.now();
  state.endTime = specificEndMs ?? (state.startTime + minutes * 60000);
  state.task = task;
  state.durationMin = minutes; // used if you adjust the start time later
  state.hasLoggedCurrent = false;
  state.nextUpReminderAt = null;

  updateTimerUI();
  markActivity();
  maybeAskNotificationPermission();

  writeActiveTimer();
  state.lastPersist = 0;
  state.lastTitleText = ''; state.lastCountdownText = '';

  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(tick, 1000);
}


/**
 * Start Count Up.
 * If a countdown is running, log it up to "now" first,
 * then start a fresh count-up from "now" with an EMPTY task
 * so Stop triggers the finalize modal.
 */
export function startCountUp() {
  const now = Date.now();

  // If mid-countdown, log that session up to now before switching
  if (state.mode === 'down' && state.startTime && !state.hasLoggedCurrent) {
    const prevTask = state.task;
    if (prevTask) {
      logSession(prevTask, now);      // end = when Count Up pressed
      state.hasLoggedCurrent = true;
    }
  }

  // Switch to count-up
  if (state.timer) clearInterval(state.timer);

  state.mode = 'up';
  state.startTime = now;     // new session begins at handoff
  state.endTime = null;
  state.durationMin = null;
  state.hasLoggedCurrent = false;

  // Force empty task so Stop triggers finalize modal
  q('#task').value = '';
  state.task = '';

  state.nextUpReminderAt = state.startTime + UP_REM_MS;

  updateTimerUI();
  markActivity();
  maybeAskNotificationPermission();

  writeActiveTimer();
  state.lastPersist = 0;
  state.lastTitleText = ''; state.lastCountdownText = '';

  state.timer = setInterval(tick, 1000);
}

export function stopTimer(log = true) {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;

  const modeAtStop = state.mode;
  const startAtStop = state.startTime;
  const taskAtStop = (typeof state.task === 'string') ? state.task.trim() : '';
  const endNow = Date.now();

  if (log && !state.hasLoggedCurrent && startAtStop) {
    if (modeAtStop === 'up' && !taskAtStop) {
      // Finalize count-up: capture times & trigger modal (event + fallback)
      const startUTC = formatExcelDateString(new Date(startAtStop)) + ' UTC';
      const endUTC   = formatExcelDateString(new Date(endNow)) + ' UTC';
      try { localStorage.setItem('pending_countup', JSON.stringify({ startUTC, endUTC })); } catch(e){}
      try { window.dispatchEvent(new CustomEvent('countup-need-task', { detail: { startUTC, endUTC } })); } catch(e){}
      // Don't log yet — user will name it in the modal.
    } else if (taskAtStop) {
      // Normal logging path
      logSession(taskAtStop, endNow);
      state.hasLoggedCurrent = true;
    }
  }

  // Clear active session state
  state.mode = null;
  state.endTime = null;
  state.startTime = null;
  state.task = null;
  state.durationMin = null;
  state.nextUpReminderAt = null;

  clearActiveTimer();

  q('#countdown').textContent = '00:00';
  document.title = 'Time Tracker';
  state.lastTitleText = 'Time Tracker';
  state.lastCountdownText = '00:00';

  markActivity();
}

// ===== NEW: Adjust start time for the current session =====
export function adjustStartTime(newStartMs) {
  if (!state.mode || !state.startTime) return false;

  const now = Date.now();
  state.startTime = newStartMs;

  if (state.mode === 'down') {
    // preserve duration; recompute end
    if (typeof state.durationMin === 'number' && isFinite(state.durationMin)) {
      state.endTime = state.startTime + state.durationMin * 60000;
    }
  } else if (state.mode === 'up') {
    // re-align next reminder to the next 20-min boundary after new start
    const elapsedSinceStart = now - state.startTime;
    const intervalsPassed = Math.ceil(elapsedSinceStart / UP_REM_MS);
    state.nextUpReminderAt = state.startTime + Math.max(1, intervalsPassed) * UP_REM_MS;
  }

  writeActiveTimer();
  markActivity();
  updateTimerUI();

  // Immediate boundary checks
  if (state.mode === 'down') {
    const remaining = (state.endTime || 0) - now;
    if (remaining <= 0 && !state.hasLoggedCurrent) {
      notifyCountdownOver(state.task);
      logSession(state.task, state.endTime);
      state.hasLoggedCurrent = true;
      stopTimer(false);
    }
  } else if (state.mode === 'up') {
    if (now - state.startTime >= MAX_UP_MS) {
      notifyAutoStop();
      stopTimer(true);
    }
  }
  return true;
}

// ===== Ticking / UI update =====
function tick() {
  if (!state.startTime || !state.mode) return;
  const now = Date.now();

  if (state.mode === 'down') {
    const remaining = (state.endTime || 0) - now;
    updateTimerUI();
    if (remaining <= 0 && !state.hasLoggedCurrent) {
      notifyCountdownOver(state.task);
      logSession(state.task, state.endTime);
      state.hasLoggedCurrent = true;
      stopTimer(false);
    }
  } else if (state.mode === 'up') {
    updateTimerUI();

    // 20-minute recurring reminder while counting up
    if (!state.muteReminders && !state.muteNotifications && typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted' && state.nextUpReminderAt && now >= state.nextUpReminderAt) {
        const tLabel = state.task && state.task.trim() ? state.task : 'Unnamed';
        new Notification('Timer still running', { body: `Task: ${tLabel} — ${formatTime(now - state.startTime)} elapsed` });
        if (!state.muteSound) {
          const ding = q('#ding');
          try { ding.currentTime = 0; ding.play(); setTimeout(() => { try { ding.pause(); } catch(e){} }, 1000); } catch(e){}
        }
        state.nextUpReminderAt += UP_REM_MS;
        writeActiveTimer();
      }
    }

    // Hard cap: auto-stop at 2 hours
    const elapsed = now - state.startTime;
    if (elapsed >= MAX_UP_MS) {
      notifyAutoStop();
      stopTimer(true); // will prompt finalize if task was empty
    }
  }
}

function updateTimerUI() {
  if (!state.startTime || !state.mode) return;
  const now = Date.now();
  let timeString = '00:00';
  if (state.mode === 'down') {
    const remaining = Math.max(0, (state.endTime || 0) - now);
    timeString = formatTime(remaining);
  } else {
    const elapsed = Math.max(0, now - state.startTime);
    timeString = formatTime(elapsed);
  }

  if (timeString !== state.lastCountdownText) {
    q('#countdown').textContent = timeString;
    state.lastCountdownText = timeString;
  }
  const title = (state.mode === 'up' ? `↑${timeString}` : `${timeString}`) + ' - Time Tracker';
  if (title !== state.lastTitleText) {
    document.title = title;
    state.lastTitleText = title;
  }

  if (now - state.lastPersist >= PERSIST_EVERY_MS) {
    writeActiveTimer();
    state.lastPersist = now;
  }
}

function notifyCountdownOver(task) {
  if (!state.muteSound) {
    const ding = q('#ding');
    ding.currentTime = 0;
    ding.play();
    state.dingTimeout = setTimeout(() => { try { ding.pause(); } catch(e){} }, 3000);
  }
  if (!state.muteNotifications && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification('Time is up!', { body: `Task: ${task}` });
  }
}

function notifyAutoStop() {
  if (!state.muteNotifications && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification('Count up reached 2 hours — stopped', { body: 'Session was auto-stopped and recorded.' });
  }
  if (!state.muteSound) {
    const ding = q('#ding');
    try { ding.currentTime = 0; ding.play(); setTimeout(() => { try { ding.pause(); } catch(e){} }, 1000); } catch(e){}
  }
}

function maybeAskNotificationPermission() {
  if (!state.muteNotifications && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
    Notification.requestPermission();
  }
}

// ===== Restore on load =====
export function restoreActiveTimer() {
  const saved = loadActiveTimer();
  if (!saved) return;

  state.task = typeof saved.task === 'string' ? saved.task : '';
  state.startTime = saved.startMs;
  state.endTime = saved.endMs ?? null;
  state.hasLoggedCurrent = !!saved.hasLogged;
  state.mode = saved.mode || (state.endTime ? 'down' : 'up');
  state.nextUpReminderAt = saved.nextUpReminderAt ?? null;

  const taskInput = q('#task');
  if (taskInput && typeof state.task === 'string') taskInput.value = state.task;

  if (!state.startTime) { clearActiveTimer(); return; }

  state.lastTitleText = ''; state.lastCountdownText = '';
  const now = Date.now();

  if (state.mode === 'up') {
    // If already past hard cap on restore, immediately auto-stop
    if (now - state.startTime >= MAX_UP_MS) {
      notifyAutoStop();
      stopTimer(true); // prompts finalize if needed
      return;
    }
    if (!state.nextUpReminderAt || state.nextUpReminderAt <= now) {
      const elapsedSinceStart = now - state.startTime;
      const intervalsPassed = Math.ceil(elapsedSinceStart / UP_REM_MS);
      state.nextUpReminderAt = state.startTime + intervalsPassed * UP_REM_MS;
    }
  }

  updateTimerUI();
  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(tick, 1000);

  if (state.mode === 'down' && state.endTime && now >= state.endTime && !state.hasLoggedCurrent) {
    logSession(state.task, state.endTime);
    state.hasLoggedCurrent = true;
    stopTimer(false);
  }
}

// ===== Logging =====
function logSession(task, endOverrideMs) {
  if (!state.startTime) return;
  const start = new Date(state.startTime);
  const end = new Date(typeof endOverrideMs === 'number' ? endOverrideMs : Date.now());
  const duration = durationStringFromDates(start, end);

  const session = {
    id: 's_' + Date.now() + '_' + Math.random().toString(36).slice(2,8),
    task,
    duration,
    start: formatExcelDateString(start) + ' UTC',
    end: formatExcelDateString(end) + ' UTC',
  };

  const log = JSON.parse(localStorage.getItem('time_log') || '[]');
  log.push(session);
  localStorage.setItem('time_log', JSON.stringify(log));

  window.dispatchEvent(new CustomEvent('time-log-updated'));
}
