// ui.js
import {
  getSystemTZ, isValidTimeZone, parseUTCString, formatInTZ, ymdInTZ,
  csvEscape, formatExcelDateString, durationStringFromDates, inParisWorkWindows
} from './utils.js';

import {
  startTimer, startCountUp, stopTimer, restoreActiveTimer,
  isTimerRunning, getMutes, setMuteSound, setMuteNotifications, setMuteReminders,
  markActivity, msSinceLastActivity
} from './timer.js';

const $ = sel => document.querySelector(sel);

let displayTZ = localStorage.getItem('displayTZ') || getSystemTZ();

// ====== Table rendering ======
function ensureIdsOnLog(log) {
  let changed = false;
  log.forEach(item => {
    if (!item.id) { item.id = 's_' + Date.now() + '_' + Math.random().toString(36).slice(2,8); changed = true; }
  });
  if (changed) localStorage.setItem('time_log', JSON.stringify(log));
}

function renderLog() {
  const log = JSON.parse(localStorage.getItem('time_log') || '[]');
  ensureIdsOnLog(log);

  $('#startHeader').textContent = `Start (${displayTZ})`;
  $('#endHeader').textContent = `End (${displayTZ})`;

  const tbody = $('#logTable tbody');
  tbody.innerHTML = '';

  log.slice().reverse().forEach(row => {
    const startUtc = (row.start || '').replace(' UTC','');
    const endUtc = (row.end || '').replace(' UTC','');
    const startDt = parseUTCString(startUtc);
    const endDt = parseUTCString(endUtc);
    const startDisp = startDt ? formatInTZ(startDt, displayTZ) : '';
    const endDisp = endDt ? formatInTZ(endDt, displayTZ) : '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.task ? String(row.task).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) : ''}</td>
      <td class="nowrap">${row.duration || ''}</td>
      <td class="nowrap">${startDisp}</td>
      <td class="nowrap">${endDisp}</td>
      <td class="actions-col">
        <button class="btn btn-ghost" data-edit="${row.id}">Edit</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // wire edit buttons (event delegation alternative also works)
  tbody.querySelectorAll('button[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.getAttribute('data-edit')));
  });
}

window.addEventListener('time-log-updated', () => { renderLog(); maybeRerenderChart(); });

// ====== Export / Clear ======
function exportCSV() {
  const log = JSON.parse(localStorage.getItem('time_log') || '[]');
  if (log.length === 0) { alert('No data to export.'); return; }
  const header = ['Task', 'Duration', 'Start (UTC)', 'End (UTC)'];
  const rows = log.map(r => [r.task, r.duration, r.start, r.end]);
  const csv = [header.join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'time_log.csv'; a.click();
}

function clearHistory() {
  if (!confirm('Are you sure you want to delete all session history?')) return;
  localStorage.removeItem('time_log');
  renderLog();
  markActivity();
  maybeRerenderChart();
}

// ====== Toggles ======
function setBadge(el, isOn, labelOn, labelOff){
  el.textContent = isOn ? labelOn : labelOff;
  el.classList.remove('on','off'); el.classList.add(isOn ? 'on' : 'off');
}

function refreshMuteUI() {
  const m = getMutes();
  $('#muteSoundBtn').textContent = m.sound ? 'Unmute Sound' : 'Mute Sound';
  setBadge($('#muteSoundBadge'), !m.sound, 'Sound: On', 'Sound: Off');

  $('#muteNotifBtn').textContent = m.notifications ? 'Enable Notifications' : 'Disable Notifications';
  setBadge($('#muteNotifBadge'), !m.notifications, 'Notifications: On', 'Notifications: Off');

  $('#muteRemindersBtn').textContent = m.reminders ? 'Unmute Reminders' : 'Mute Reminders';
  setBadge($('#muteRemindersBadge'), !m.reminders, 'Reminders: On', 'Reminders: Off');
}

// ====== Idle Reminder (when NO timer running) ======
let idleCheckHandle = null;

function updateNextReminderEstimate() {
  const el = $('#nextReminderETA');
  const noTimerRunning = !isTimerRunning();
  const mutes = getMutes();

  if (!noTimerRunning || mutes.reminders || !inParisWorkWindows()) {
    el.textContent = '';
    return;
  }
  const remainingMs = Math.max(0, (20*60*1000) - msSinceLastActivity());
  const m = String(Math.floor(remainingMs / 60000)).padStart(2,'0');
  const s = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2,'0');
  el.textContent = remainingMs === 0 ? 'Reminder eligible now.' : `Next reminder in ~${m}:${s}`;
}

function maybeSendIdleReminder() {
  const noTimerRunning = !isTimerRunning();
  const mutes = getMutes();
  if (noTimerRunning && !mutes.reminders && inParisWorkWindows()) {
    if (msSinceLastActivity() >= 20*60*1000) {
      if (!mutes.notifications && typeof Notification !== 'undefined') {
        if (Notification.permission !== 'granted') Notification.requestPermission();
        if (Notification.permission === 'granted') new Notification('Reminder: no timer running', { body: 'Start a timer?' });
      }
      markActivity(); // reset
    }
  }
  updateNextReminderEstimate();
  scheduleNextIdleCheck();
}

function scheduleNextIdleCheck(delayMs = 60*1000) {
  if (idleCheckHandle) clearTimeout(idleCheckHandle);
  idleCheckHandle = setTimeout(maybeSendIdleReminder, delayMs);
}

// ====== Timezone UI ======
function applyTimezone() {
  const input = $('#tzInput').value.trim();
  if (!input) return;
  if (!isValidTimeZone(input)) {
    alert('That does not look like a valid IANA timezone.\nExamples: UTC, Europe/Paris, America/New_York');
    return;
  }
  displayTZ = input;
  localStorage.setItem('displayTZ', displayTZ);
  updateTZUI();
  renderLog();
  maybeRerenderChart();
}

function useSystemTimezone() {
  displayTZ = getSystemTZ();
  localStorage.setItem('displayTZ', displayTZ);
  updateTZUI();
  renderLog();
  maybeRerenderChart();
}

function updateTZUI() {
  $('#tzBadge').textContent = `TZ: ${displayTZ}`;
  $('#tzInput').value = displayTZ;
  $('#startHeader').textContent = `Start (${displayTZ})`;
  $('#endHeader').textContent = `End (${displayTZ})`;
  const note = $('#chartNote');
  if (note) note.innerHTML = `Minutes per day for the last five weekdays (grouped by <strong>${displayTZ}</strong> day, using each session’s <em>start time</em>).`;
}

// ====== Chart (last five weekdays) ======
function parseDurationToMinutes(durStr) {
  const [m, s] = String(durStr).split(':').map(x => parseInt(x, 10) || 0);
  return m + s / 60;
}
function getLastNWeekdays(n, tz) {
  const out = [];
  let cursor = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  cursor.setHours(12,0,0,0);
  while (out.length < n) {
    const day = cursor.getDay();
    if (day >= 1 && day <= 5) out.push(ymdInTZ(cursor, tz));
    cursor.setDate(cursor.getDate() - 1);
  }
  return out.reverse();
}
function totalsForDates(dateKeys, tz) {
  const totals = {}; dateKeys.forEach(k => totals[k] = 0);
  const log = JSON.parse(localStorage.getItem('time_log') || '[]');
  for (const row of log) {
    if (!row.start || !row.duration) continue;
    const raw = row.start.replace(' UTC','');
    const d = parseUTCString(raw);
    const key = ymdInTZ(d, tz);
    if (key in totals) totals[key] += parseDurationToMinutes(row.duration);
  }
  return totals;
}
function drawBars(labels, values) {
  const canvas = $('#barChart');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0,0,W,H);
  const margin = { left: 56, right: 24, top: 28, bottom: 56 };
  const chartW = W - margin.left - margin.right;
  const chartH = H - margin.top - margin.bottom;

  // Axes
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--border');
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + chartH);
  ctx.lineTo(margin.left + chartW, margin.top + chartH);
  ctx.stroke();

  // Scale
  const maxVal = Math.max(0, ...values);
  const niceMax = maxVal === 0 ? 60 : Math.ceil(maxVal / 30) * 30;
  const toY = (v) => margin.top + chartH - (v / niceMax) * chartH;

  // Grid + Y labels
  const textColor = getComputedStyle(document.body).getPropertyValue('--muted');
  ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Inter, Helvetica, Arial, sans-serif';
  for (let y=0; y<=niceMax; y+=30) {
    const yy = toY(y);
    ctx.strokeStyle = 'rgba(125,125,125,.12)';
    ctx.beginPath(); ctx.moveTo(margin.left, yy); ctx.lineTo(margin.left + chartW, yy); ctx.stroke();
    ctx.fillStyle = textColor;
    const hrs = Math.floor(y/60), mins = y%60;
    const label = hrs>0 ? `${hrs}h${String(mins).padStart(2,'0')}` : `${mins}m`;
    ctx.fillText(label, 8, yy+4);
  }

  // Bars
  const n = labels.length; const gap = 18;
  const barW = Math.min(72, (chartW - gap*(n+1)) / n);
  let x = margin.left + gap;

  const barFill = getComputedStyle(document.body).getPropertyValue('--primary');
  const barStroke = getComputedStyle(document.body).getPropertyValue('--primary-600');

  for (let i=0;i<n;i++){
    const v = values[i], y = toY(v), h = (margin.top+chartH) - y;
    ctx.fillStyle = barFill; ctx.globalAlpha = .85; ctx.fillRect(x, y, barW, h); ctx.globalAlpha = 1;
    ctx.strokeStyle = barStroke; ctx.strokeRect(x+.5, y+.5, barW-1, h-1);

    const totMin = Math.round(v);
    const hh = Math.floor(totMin/60), mm = totMin%60;
    const valLabel = hh>0 ? `${hh}:${String(mm).padStart(2,'0')}` : `${mm}m`;
    ctx.textAlign = 'center';
    if (h>18){ ctx.fillStyle = '#fff'; ctx.fillText(valLabel, x+barW/2, y+14); }
    else { ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text'); ctx.fillText(valLabel, x+barW/2, y-6); }

    const textColor2 = getComputedStyle(document.body).getPropertyValue('--muted');
    ctx.fillStyle = textColor2;
    ctx.fillText(labels[i], x+barW/2, margin.top+chartH+18);

    x += barW + gap;
  }

  const note = $('#chartNote');
  note.innerHTML = `Minutes per day for the last five weekdays (grouped by <strong>${displayTZ}</strong> day, using each session’s <em>start time</em>).`;
}

function renderBarChartForLastFiveWeekdays() {
  const dates = getLastNWeekdays(5, displayTZ);
  const totals = totalsForDates(dates, displayTZ);
  const labels = dates.map(d => d.slice(5));
  const values = dates.map(d => Math.round((totals[d] || 0) * 10) / 10);
  drawBars(labels, values);
}
function toggleChart() {
  const wrap = $('#chartWrap');
  if (wrap.style.display === 'none' || wrap.style.display === '') { wrap.style.display = 'block'; renderBarChartForLastFiveWeekdays(); }
  else { wrap.style.display = 'none'; }
}
function maybeRerenderChart() {
  const wrap = $('#chartWrap');
  if (wrap.style.display !== 'none') renderBarChartForLastFiveWeekdays();
}

// ====== Modal add/edit ======
let modalMode = 'edit';
let modalEditingId = null;

function openModal(){ $('#modalBackdrop').style.display = 'grid'; }
function closeModal(){ $('#modalBackdrop').style.display = 'none'; }

function openEditModal(id) {
  const log = JSON.parse(localStorage.getItem('time_log') || '[]');
  const entry = log.find(x => x.id === id);
  if (!entry) { alert('Entry not found.'); return; }
  modalMode = 'edit'; modalEditingId = id;
  $('#modalTitle').textContent = 'Edit Session';
  $('#modalDeleteBtn').style.display = '';
  $('#modalTask').value = entry.task || '';
  $('#modalStart').value = (entry.start || '').replace(' UTC','');
  $('#modalEnd').value   = (entry.end || '').replace(' UTC','');
  openModal();
}
function openAddModal() {
  modalMode = 'add'; modalEditingId = null;
  $('#modalTitle').textContent = 'Add Past Session';
  $('#modalDeleteBtn').style.display = 'none';
  $('#modalTask').value = '';
  $('#modalStart').value = '';
  $('#modalEnd').value   = '';
  openModal();
}
function saveModal() {
  const task = $('#modalTask').value.trim();
  const startStr = $('#modalStart').value.trim();
  const endStr = $('#modalEnd').value.trim();
  if (!task) { alert('Task is required.'); return; }
  const startDt = parseUTCString(startStr);
  const endDt = parseUTCString(endStr);
  if (!startDt || !endDt) { alert('Please enter valid UTC times: YYYY-MM-DD HH:MM:SS'); return; }
  if (endDt <= startDt) { alert('End must be after Start.'); return; }

  const duration = durationStringFromDates(startDt, endDt);
  const payload = { task, duration, start: formatExcelDateString(startDt) + ' UTC', end: formatExcelDateString(endDt) + ' UTC' };

  const log = JSON.parse(localStorage.getItem('time_log') || '[]');
  ensureIdsOnLog(log);
  if (modalMode === 'edit') {
    const idx = log.findIndex(x => x.id === modalEditingId);
    if (idx === -1) { alert('Entry not found.'); return; }
    payload.id = log[idx].id; log[idx] = payload;
  } else {
    payload.id = 's_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    log.push(payload);
  }
  localStorage.setItem('time_log', JSON.stringify(log));
  closeModal(); renderLog(); maybeRerenderChart();
}
function deleteSessionFromModal() {
  if (!confirm('Delete this session?')) return;
  const log = JSON.parse(localStorage.getItem('time_log') || '[]');
  const idx = log.findIndex(x => x.id === modalEditingId);
  if (idx === -1) { alert('Entry not found.'); return; }
  log.splice(idx, 1);
  localStorage.setItem('time_log', JSON.stringify(log));
  closeModal(); renderLog(); maybeRerenderChart();
}

// ====== Init & wiring ======
export function initApp(){
  // Buttons
  $('#startBtn').addEventListener('click', () => startTimer());
  $('#countUpBtn').addEventListener('click', () => startCountUp());
  $('#stopBtn').addEventListener('click', () => stopTimer(true));

  $('#exportBtn').addEventListener('click', exportCSV);
  $('#clearBtn').addEventListener('click', clearHistory);
  $('#addPastBtn').addEventListener('click', openAddModal);

  $('#muteSoundBtn').addEventListener('click', () => { setMuteSound(!getMutes().sound); refreshMuteUI(); });
  $('#muteNotifBtn').addEventListener('click', () => { setMuteNotifications(!getMutes().notifications); refreshMuteUI(); });
  $('#muteRemindersBtn').addEventListener('click', () => { setMuteReminders(!getMutes().reminders); refreshMuteUI(); });

  $('#tzApplyBtn').addEventListener('click', applyTimezone);
  $('#tzSystemBtn').addEventListener('click', useSystemTimezone);

  $('#chartToggleBtn').addEventListener('click', toggleChart);

  // Modal actions & close behavior
  $('#modalSaveBtn').addEventListener('click', saveModal);
  $('#modalCancelBtn').addEventListener('click', closeModal);
  $('#modalDeleteBtn').addEventListener('click', deleteSessionFromModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  $('#modalBackdrop').addEventListener('click', e => { if (e.target.id === 'modalBackdrop') closeModal(); });

  // Initial UI state
  refreshMuteUI();
  updateTZUI();

  if (!localStorage.getItem('lastTimerActivity')) { markActivity(); }
  else {
    const v = parseInt(localStorage.getItem('lastTimerActivity'), 10);
    if (!isNaN(v)) localStorage.setItem('lastTimerActivity', String(v));
  }

  // Early ask so reminders can work
  const m = getMutes();
  if (!m.notifications && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
    Notification.requestPermission();
  }

  renderLog();

  // Restore active timer (also restores task input)
  restoreActiveTimer();

  // Idle reminder loop
  updateNextReminderEstimate();
  scheduleNextIdleCheck(60*1000);
  document.addEventListener('visibilitychange', () => {
    updateNextReminderEstimate();
    if (!document.hidden) scheduleNextIdleCheck(2*1000);
  });
}
