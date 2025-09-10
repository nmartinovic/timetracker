// timer.js
import { PERSIST_EVERY_MS, UP_REM_MS, formatTime, formatExcelDateString, durationStringFromDates } from './utils.js';

const q = sel => document.querySelector(sel);

// ===== Shared state =====
const state = {
  timer: null,
  mode: null,           // 'down' | 'up' | null
  startTime: null,      // ms
  endTime: null,        // ms for countdown
  task: null,
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
  if (!state.startTime || !state.task) return;
  const payload = {
    task: state.task,
    startMs: state.startTime,
    endMs: state.endTime ?? null,
    hasLogged: !!state.hasLoggedCurrent,
    mode: state.mode || null,
    nextUpReminderAt: state.nextUpReminderAt ?? null
  };
  localStorage.setItem('active_timer', JSON.stringify(payload));
}
function clearActiveTimer() {
  localStorage.removeItem('active_timer');
}
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
  // stop sound immediately
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

// ===== Core timer controls =====
export function startTimer() {
  const task = q('#task').value.trim();
  const minutes = parseInt(q('#duration').value, 10);
  if (!task || isNaN(minutes) || minutes < 1) { alert('Please enter a valid task and duration.'); return; }

  state.mode = 'down';
  state.startTime = Date.now();
  state.endTime = state.startTime + minutes * 60000;
  state.task = task;
  state.durationMin = minutes;
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

export function startCountUp() {
  const task = q('#task').value.trim();
  if (!task) { alert('Please enter a task name.'); return; }

  state.mode = 'up';
  state.startTime = Date.now();
  state.endTime = null;
  state.task = task;
  state.durationMin = null;
  state.hasLoggedCurrent = false;
  state.nextUpReminderAt = state.startTime + UP_REM_MS;

  updateTimerUI();
  markActivity();

  maybeAskNotificationPermission();

  writeActiveTimer();
  state.lastPersist = 0;
  state.lastTitleText = ''; state.lastCountdownText = '';

  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(tick, 1000);
}

export function stopTimer(log = true) {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;

  if (log && !state.hasLoggedCurrent && state.task && state.startTime) {
    logSession(state.task, Date.now());
    state.hasLoggedCurrent = true;
  }

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
  // charts re-render from ui.js on time-log-updated
}

// ===== Ticking / UI update =====
function tick() {
  if (!state.startTime || !state.mode) return;
  const now = Date.now();

  if (state.mode === 'down') {
    const remaining = (state.endTime || 0) - now;
    updateTimerUI();
    if (remaining <= 0 && !state.hasLoggedCurrent) {
      notify(state.task);
      logSession(state.task, state.endTime);
      state.hasLoggedCurrent = true;
      stopTimer(false);
    }
  } else if (state.mode === 'up') {
    updateTimerUI();
    // recurring 20m reminder
    if (!state.muteReminders && !state.muteNotifications && typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted' && state.nextUpReminderAt && now >= state.nextUpReminderAt) {
        new Notification('Timer still running', { body: `Task: ${state.task} — ${formatTime(now - state.startTime)} elapsed` });
        if (!state.muteSound) {
          const ding = q('#ding');
          try { ding.currentTime = 0; ding.play(); setTimeout(() => { try { ding.pause(); } catch(e){} }, 1000); } catch(e){}
        }
        state.nextUpReminderAt += UP_REM_MS;
        writeActiveTimer();
      }
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

  // Throttle localStorage write
  if (now - state.lastPersist >= PERSIST_EVERY_MS) {
    writeActiveTimer();
    state.lastPersist = now;
  }
}

function notify(task) {
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

function maybeAskNotificationPermission() {
  if (!state.muteNotifications && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
    Notification.requestPermission();
  }
}

// ===== Restore on load =====
export function restoreActiveTimer() {
  const saved = loadActiveTimer();
  if (!saved) return;

  state.task = saved.task;
  state.startTime = saved.startMs;
  state.endTime = saved.endMs ?? null;
  state.hasLoggedCurrent = !!saved.hasLogged;
  state.mode = saved.mode || (state.endTime ? 'down' : 'up');
  state.nextUpReminderAt = saved.nextUpReminderAt ?? null;

  // reflect task in input
  const taskInput = q('#task');
  if (taskInput && typeof state.task === 'string') taskInput.value = state.task;

  if (!state.startTime || !state.task) { clearActiveTimer(); return; }

  state.lastTitleText = ''; state.lastCountdownText = ''; // force repaint
  const now = Date.now();

  if (state.mode === 'up') {
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

  // Notify UI to re-render table & chart
  window.dispatchEvent(new CustomEvent('time-log-updated'));
}
