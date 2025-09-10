// utils.js
export const PERSIST_EVERY_MS = 5000;
export const UP_REM_MS = 20 * 60 * 1000;

export function getSystemTZ() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch(e){ return 'UTC'; }
}

export function isValidTimeZone(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; }
  catch(e){ return false; }
}

// Format Date -> "YYYY-MM-DD HH:MM:SS" in UTC (Excel-friendly)
export function formatExcelDateString(dateObj) {
  return dateObj.toISOString().replace('T', ' ').split('.')[0];
}

export function parseUTCString(s) {
  const m = String(s || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [_, Y,M,D,h,mn,sc] = m;
  const ms = Date.UTC(+Y, +M-1, +D, +h, +mn, +sc);
  const dt = new Date(ms);
  return isNaN(dt.getTime()) ? null : dt;
}

export function durationStringFromDates(startDt, endDt) {
  const ms = Math.max(0, endDt - startDt);
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
}

export function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(Math.abs(ms) / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function formatInTZ(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
  });
  const parts = dtf.formatToParts(date);
  const get = t => parts.find(p => p.type === t)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

export function ymdInTZ(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit' });
  const parts = dtf.formatToParts(date);
  const get = t => parts.find(p => p.type === t)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Paris work windows for idle reminders
export function inParisWorkWindows() {
  const nowParis = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const hh = nowParis.getHours();
  const mm = nowParis.getMinutes();
  const minutes = hh * 60 + mm;
  const morningStart = 9 * 60 + 30;
  const morningEnd   = 13 * 60;
  const aftStart     = 14 * 60;
  const aftEnd       = 18 * 60;
  return (minutes >= morningStart && minutes < morningEnd) || (minutes >= aftStart && minutes < aftEnd);
}

export function csvEscape(v){
  const s = String(v ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g,'""') + '"' : s;
}
