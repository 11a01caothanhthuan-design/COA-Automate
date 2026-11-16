'use strict';
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
function validYMD(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
function todayVN() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }); }
function addDays(isoStr, n) {
  const [y, m, d] = isoStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
const SLASH = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/;

// Học định dạng theo vendor: có ngày > 12 ở vị trí đầu => dd/MM; ở vị trí hai => MM/dd.
function inferVendorFormats(samples) {
  const ev = new Map();
  for (const s of samples) {
    const m = String(s.value == null ? '' : s.value).trim().match(SLASH);
    if (!m) continue;
    const a = +m[1], b = +m[2];
    const e = ev.get(s.vendor) || { dmy: 0, mdy: 0 };
    if (a > 12 && b <= 12) e.dmy++;
    else if (b > 12 && a <= 12) e.mdy++;
    ev.set(s.vendor, e);
  }
  const out = new Map();
  for (const [v, e] of ev) {
    if (e.dmy && e.mdy) out.set(v, 'CONFLICT');
    else if (e.dmy) out.set(v, 'dd/MM/yyyy');
    else if (e.mdy) out.set(v, 'MM/dd/yyyy');
  }
  return out;
}

// Ngày y-m-d ở tương lai: thử đảo tháng/ngày (agent hay đảo khi chuyển sang yyyy-MM-dd)
function checkYMD(y, m, d, label, future) {
  const dd = iso(y, m, d);
  if (!future(dd)) return { date: dd, status: 'OK', note: null };
  const sw = validYMD(y, d, m) ? iso(y, d, m) : null;
  if (sw && !future(sw)) return { date: sw, status: 'OK', note: `${label} is in the future; swapped month/day to ${sw}` };
  return { date: null, status: 'FUTURE_DATE', note: `${label} is in the future` };
}

// Trả về { date, status, note }. note != null nghĩa là có điều chỉnh cần ghi log.
function parseCoaDate(value, verifiedFormat, opts = {}) {
  const today = opts.today || todayVN();
  const limit = addDays(today, 1);
  const future = (d) => d > limit;

  if (value instanceof Date && !isNaN(value)) {
    const y = value.getUTCFullYear(), m = value.getUTCMonth() + 1, d = value.getUTCDate();
    return checkYMD(y, m, d, `Excel date ${iso(y, m, d)}`, future);
  }
  const t = String(value == null ? '' : value).trim();
  if (!t) return { date: null, status: 'MISSING', note: null };

  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m && validYMD(+m[1], +m[2], +m[3])) return checkYMD(+m[1], +m[2], +m[3], `"${t}"`, future);

  m = t.match(SLASH);
  if (!m) return { date: null, status: 'AMBIGUOUS', note: null };
  const a = +m[1], b = +m[2], y = +m[3];
  const mdy = validYMD(y, a, b) ? iso(y, a, b) : null;   // MM/dd/yyyy
  const dmy = validYMD(y, b, a) ? iso(y, b, a) : null;   // dd/MM/yyyy

  let fmt = verifiedFormat || null; let src = 'verified';
  if (!fmt && opts.inferredFormat && opts.inferredFormat !== 'CONFLICT') { fmt = opts.inferredFormat; src = 'inferred from vendor data'; }

  if (fmt) {
    const primary = fmt === 'MM/dd/yyyy' ? mdy : dmy;
    const other = fmt === 'MM/dd/yyyy' ? dmy : mdy;
    if (primary && !future(primary)) return { date: primary, status: 'OK', note: null };
    if (primary && future(primary)) {
      if (other && !future(other))
        return { date: other, status: 'OK', note: `"${t}" read as ${fmt} (${src}) is future ${primary}; used other order ${other}` };
      return { date: null, status: 'FUTURE_DATE', note: `"${t}" gives future date ${primary}` };
    }
    if (other) return { date: null, status: 'FORMAT_CONFLICT', note: `"${t}" is not valid as ${fmt} (${src})` };
    return { date: null, status: 'AMBIGUOUS', note: null };
  }
  if (mdy && dmy && mdy !== dmy) {
    const ok = [mdy, dmy].filter((d) => !future(d));
    if (ok.length === 1) return { date: ok[0], status: 'OK', note: `"${t}" ambiguous; only ${ok[0]} is not in the future` };
    return { date: null, status: ok.length ? 'AMBIGUOUS' : 'FUTURE_DATE', note: null };
  }
  const only = mdy || dmy;
  if (!only) return { date: null, status: 'AMBIGUOUS', note: null };
  return future(only) ? { date: null, status: 'FUTURE_DATE', note: `"${t}" gives future date ${only}` } : { date: only, status: 'OK', note: null };
}

// Lấy ngày yyyyMMdd nằm trong chuỗi (vd Lot "20260424" hoặc tên file "LOT_20260424_PQ")
function dateFromDigits(text, opts = {}) {
  const today = opts.today || todayVN();
  const all = String(text == null ? '' : text).match(/(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/g) || [];
  for (const x of all) {
    const y = +x.slice(0, 4), mo = +x.slice(4, 6), d = +x.slice(6, 8);
    if (validYMD(y, mo, d) && iso(y, mo, d) <= addDays(today, 1)) return iso(y, mo, d);
  }
  return null;
}

function isoWeek(dateStr) {
  if (!dateStr) return 'Unknown';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${pad(week)}`;
}
module.exports = { parseCoaDate, inferVendorFormats, dateFromDigits, isoWeek };
