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

// Parse "YYYY-MM-DD HH:MM:SS" (UTC) -> Date
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

// Display helpers (no offset math here)
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

/* =======================
   Timezone conversions for <input type="datetime-local">
   ======================= */

// Build "YYYY-MM-DDTHH:MM" for a UTC Date as seen in given TZ
export function utcDateToLocalDateTimeValue(utcDate, tz) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hour12:false
  });
  const p = dtf.formatToParts(utcDate);
  const g = t => p.find(x => x.type === t)?.value || '00';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}

// Convert "YYYY-MM-DDTHH:MM" (interpreted in tz) -> UTC Date
export function localDateTimeStrToUTCDate(localStr, tz) {
  if (!localStr) return null;
  const s = localStr.replace(' ', 'T');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const Y = +m[1], Mo = +m[2], D = +m[3], H = +m[4], Mi = +m[5], S = +(m[6] || 0);

  // Iteratively solve for the UTC instant whose wall time in tz equals the target
  let guess = Date.UTC(Y, Mo-1, D, H, Mi, S);
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
    }).formatToParts(new Date(guess));
    const g = t => +(parts.find(p => p.type === t)?.value || '0');
    const y2 = g('year'), mo2 = g('month'), d2 = g('day'), h2 = g('hour'), mi2 = g('minute'), s2 = g('second');

    // difference (desired - formatted) in minutes
    const desired = Date.UTC(Y, Mo-1, D, H, Mi, 0);
    const got     = Date.UTC(y2, mo2-1, d2, h2, mi2, 0);
    const diffMin = (desired - got) / 60000;

    if (Math.abs(diffMin) < 0.5) break;
    guess += diffMin * 60000;
  }
  return new Date(guess);
}
