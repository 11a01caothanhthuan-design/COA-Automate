'use strict';
const RUN_ALL = 'ALL';
// Đọc COA_csv (cấu trúc 16 cột) → records + run_charts cho dashboard
const fs = require('fs');
const cfg = require('./config');
const { listFiles, versionTime } = require('./files');
const { csvToObjects } = require('./csv');
const { parseResult, specBounds } = require('./parse');
const { parseCoaDate, inferVendorFormats, dateFromDigits, isoWeek } = require('./dates');

const clean = (v) => String(v == null ? '' : v).replace(/[\u00a0\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
const key = (v) => clean(v).toUpperCase();
// Khoá so sánh tên: bỏ dấu tiếng Việt, bỏ ký tự đặc biệt, không phân biệt hoa/thường
const norm = (v) => clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'D')
  .toUpperCase().replace(/[^A-Z0-9]/g, '');
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const fmt = (n) => (Math.abs(n) >= 1e6 || (Math.abs(n) > 0 && Math.abs(n) < 1e-3)
  ? n.toExponential(2).replace('e+', '×10^') : String(+n.toPrecision(6)));
function specDisplay(b) {
  if (!b.ok) return 'No numeric specification';
  if (b.lsl != null && b.usl != null) return `${fmt(b.lsl)} to ${fmt(b.usl)}`;
  return b.lsl != null ? `≥ ${fmt(b.lsl)}` : `≤ ${fmt(b.usl)}`;
}
const byDate = (a, b) => (a.date === 'Unknown') - (b.date === 'Unknown') || String(a.date).localeCompare(b.date);
const findKey = (obj, name) => Object.keys(obj || {}).find((k) => norm(k) === norm(name));

// Giá trị xuất hiện nhiều nhất của một cột trong các dòng của một COA
function mostCommon(rows, col) {
  const count = new Map(); const first = new Map();
  for (const r of rows) {
    const v = clean(r[col]); if (!v) continue;
    const k = v.toUpperCase();
    count.set(k, (count.get(k) || 0) + 1);
    if (!first.has(k)) first.set(k, v);
  }
  let best = ''; let n = 0;
  for (const [k, c] of count) if (c > n) { n = c; best = first.get(k); }
  return best;
}
const distinctCount = (rows, col) => new Set(rows.map((r) => key(r[col])).filter(Boolean)).size;
// --- Conservative normalization for TestItem / TestCondition / Unit ---
// Only formatting variants and verified synonyms are merged. Method codes such as A02/A03/D01 are retained.
function normalizeTestText(value) {
  return clean(value).normalize('NFKC')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s*=\s*/g, '=')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\(\s*/g, '(').replace(/\s*\)/g, ')')
    .replace(/\b(\d+(?:\.\d+)?)\s*g\b/gi, '$1g')
    .replace(/\bG\.?\s*L\.?\s*=\s*(\d+(?:\.\d+)?)\s*mm\b/gi, 'G.L.=$1 mm')
    .replace(/\s+/g, ' ').trim();
}
function titleWord(s) { return s.slice(0, 1).toUpperCase() + s.slice(1).toLowerCase(); }
function normalizeTestItem(value) {
  let s = normalizeTestText(value).replace(/\s*\(\d+\)$/, '');
  const aliasKey = s.toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  if (aliasKey === 'HEAT NO' || aliasKey === 'HEAT NUMBER') return 'Heat Number';
  // Verified chemical-name formatting only; the analyte itself is not changed.
  const chem = s.match(/^Chemical\s+Composition\s*-\s*(Carbon|Manganese|Phosphorus|Sulfur)\s*\(([A-Za-z]{1,2})\)$/i);
  if (chem) return titleWord(chem[1]) + ' (' + chem[2][0].toUpperCase() + chem[2].slice(1).toLowerCase() + ')';
  return s;
}
function normalizeUnit(value) {
  let s = normalizeTestText(value)
    .replace(/[³]/g, '3').replace(/[²]/g, '2')
    .replace(/[ΩΩ]/g, 'ohm').replace(/[·.]/g, '*')
    .replace(/\s+/g, '').toLowerCase();
  const aliases = {
    'cm3/g': 'cm3/g', 'cm^3/g': 'cm3/g',
    'ohm*cm': 'Ω·cm', 'ohmcm': 'Ω·cm',
    'g/10min': 'g/10 min', 'n/mm2': 'N/mm2', 'mpa': 'MPa',
    'cps': 'CPS', '°c': '°C', '℃': '°C'
  };
  return aliases[s] || clean(value).normalize('NFKC').replace(/\s+/g, ' ').trim();
}


async function buildDataset(opts = {}) {
  const root = opts.root || cfg.COA_ROOT;
  const files = listFiles(root);
  const errors = [];
  const t0 = Date.now();
  const warn = (code, path, detail) => errors.push({ severity: 'WARNING', code, path, detail });

  // 1) Đọc CSV
  const rows = [];
  let oldFormat = 0;
  for (const f of files) {
    try {
      const { columns, records } = csvToObjects(fs.readFileSync(f.path, 'utf8'));
      const miss = cfg.CSV_REQUIRED.filter((c) => !columns.includes(c));
      if (miss.length) throw new Error(`Thiếu cột: ${miss.join(', ')}`);
      if (!records.length) throw new Error('File không có dòng dữ liệu');
      const missNew = cfg.CSV_COLUMNS.filter((c) => !columns.includes(c));
      if (missNew.length) { oldFormat++; warn('CSV_OLD_FORMAT', f.path, `Thiếu cột: ${missNew.join(', ')}`); }
      for (const r of records) rows.push({ ...r, __file: f });
    } catch (e) {
      errors.push({ severity: 'ERROR', code: 'CSV_READ_ERROR', path: f.path, detail: e.message });
    }
  }

  // 2) Chuẩn hoá vendor: tên trống/UNKNOWN → đoán từ tên file; gộp biến thể qua VENDOR_ALIASES
  //    và gộp các cách viết chỉ khác hoa/thường/dấu về một tên hiển thị.
  const displayByNorm = new Map();
  function vendorOf(r) {
    let v = clean(r.Vendor);
    if (!v || /^UNKNOWN/i.test(v)) {
      const src = clean(r.SourceFile) || r.__file.name;
      const hit = (cfg.VENDOR_BY_FILE || []).find((x) => new RegExp(x.pattern, 'i').test(src));
      v = hit ? hit.vendor : (r.__file.vendor || 'Unknown vendor');
    }
    const a = findKey(cfg.VENDOR_ALIASES, v);
    if (a) v = cfg.VENDOR_ALIASES[a];
    const n = norm(v);
    if (!displayByNorm.has(n)) displayByNorm.set(n, v);
    return displayByNorm.get(n);
  }
  for (const r of rows) {
    r.__vendor = vendorOf(r);
    if (/^Unknown vendor$/i.test(r.__vendor)) r.__unknownVendor = true;
  }

  // 3) Mỗi PDF (FileKey) chỉ lấy CSV mới nhất
  const pdfKey = (r) => clean(r.FileKey) || clean(r.SourceFile) || `MISSING_FILEKEY|${r.__file.path}`;
  const filesByPdf = new Map();
  for (const r of rows) {
    const k = pdfKey(r);
    if (!filesByPdf.has(k)) filesByPdf.set(k, new Map());
    filesByPdf.get(k).set(r.__file.path, r.__file);
  }
  const chosen = new Map(); let superseded = 0;
  for (const [k, m] of filesByPdf) {
    const list = [...m.values()].sort((a, b) =>
      versionTime(b.name, b.mtimeMs) - versionTime(a.name, a.mtimeMs) ||
      b.mtimeMs - a.mtimeMs || b.path.localeCompare(a.path));
    chosen.set(k, list[0].path);
    superseded += list.length - 1;
  }
  const current = rows.filter((r) => chosen.get(pdfKey(r)) === r.__file.path);

  // 4) Tách COA trong một PDF: CHỈ tách khi PDF thật sự có nhiều mã hàng/lô,
  //    tức mỗi nhóm ItemCode+LotNumber có từ 2 dòng chỉ tiêu trở lên.
  //    Nếu chỉ vài dòng bị ghi lệch (AI đọc sai), gộp lại thành 1 COA và cảnh báo.
  const rowsByPdf = new Map();
  for (const r of current) {
    const k = pdfKey(r);
    if (!rowsByPdf.has(k)) rowsByPdf.set(k, []);
    rowsByPdf.get(k).push(r);
  }
  const coaGroups = [];   // { pdf, rows, multi }
  for (const [pdf, rs] of rowsByPdf) {
    const subKey = (r) => `${key(r.ItemCode)}|${key(r.LotNumber)}`;
    const groups = new Map();
    for (const r of rs) { const s = subKey(r); if (!groups.has(s)) groups.set(s, []); groups.get(s).push(r); }
    const realSplit = groups.size > 1 && [...groups.values()].every((g) => g.length >= 2);
    if (realSplit) {
      for (const g of groups.values()) coaGroups.push({ pdf, rows: g, multi: true });
    } else {
      if (groups.size > 1) warn('ITEM_LOT_INCONSISTENT', rs[0].__file.path,
        `ItemCode/LotNumber khác nhau giữa ${groups.size} nhóm nhưng có nhóm chỉ 1 dòng → gộp thành 1 COA`);
      coaGroups.push({ pdf, rows: rs, multi: false });
    }
  }

  // 5) Học định dạng ngày theo vendor
  const inferred = inferVendorFormats(current.map((r) => ({ vendor: norm(r.__vendor), value: r.COADate })));
  for (const [v, f] of inferred) if (f === 'CONFLICT')
    warn('VENDOR_DATE_FORMAT_CONFLICT', v, 'Vendor có cả ngày dd/MM lẫn MM/dd');

  const canonicalName = new Map();
  const records = [];
  const runCharts = {};

  for (const { pdf, rows: rs, multi } of coaGroups) {
    const first = rs[0];
    const C = (col) => mostCommon(rs, col);
    for (const col of ['COADate', 'ProductName', 'MaterialCategory'])
      if (distinctCount(rs, col) > 1) warn('COA_FIELD_CONFLICT', first.__file.path,
        `${col} khác nhau giữa các dòng; dùng giá trị xuất hiện nhiều nhất "${C(col)}"`);

    const vendor = first.__vendor;
    if (first.__unknownVendor) warn('UNKNOWN_VENDOR', first.__file.path,
      `Không xác định được vendor (Vendor="${clean(first.Vendor)}"). Thêm quy tắc vào VENDOR_BY_FILE trong config.js`);

    const itemCode = C('ItemCode'); const po = C('PONumber'); const lot = C('LotNumber');
    const id = multi ? `${pdf}|${itemCode}|${lot}` : pdf;

    // Sản phẩm: gom theo mã hàng nếu có, không thì theo tên
    const rawName = C('ProductName');
    const ck = `${norm(vendor)}|${itemCode ? 'CODE:' + norm(itemCode) : 'NAME:' + norm(rawName)}`;
    if (!canonicalName.has(ck)) canonicalName.set(ck, itemCode && rawName && !key(rawName).includes(key(itemCode))
      ? `${itemCode} | ${rawName}` : (rawName || itemCode));
    const itemDisplay = canonicalName.get(ck) || 'Unknown product';

    // Ngày COA
    const vKey = findKey(cfg.VENDOR_DATE_FORMAT, vendor);
    const rawDate = C('COADate');
    let dt = parseCoaDate(rawDate, vKey ? cfg.VENDOR_DATE_FORMAT[vKey] : null, { inferredFormat: inferred.get(norm(vendor)) });
    if (dt.status === 'MISSING' && (cfg.DATE_FROM_LOT_VENDORS || []).some((v) => norm(v) === norm(vendor))) {
      const d = dateFromDigits(lot) || dateFromDigits(first.SourceFile) || dateFromDigits(first.__file.name);
      if (d) dt = { date: d, status: 'OK', note: `COADate missing; date decoded from Lot/file name = ${d}` };
    }
    if (dt.status !== 'OK' || dt.note)
      warn('COA_DATE_' + dt.status, first.__file.path, `vendor=${vendor}; item=${itemCode}; COADate="${rawDate}"${dt.note ? '; ' + dt.note : ''}`);
    const date = dt.date || 'Unknown';

    // Nhóm vật liệu
    const catKey = findKey(cfg.VENDOR_CATEGORY, vendor);
    const rawCat = C('MaterialCategory') || (catKey ? cfg.VENDOR_CATEGORY[catKey] : 'Other');
    const category = (cfg.CATEGORY_ALIASES || {})[key(rawCat).replace(/\s*\/\s*/g, '/')] || rawCat;

    const testSeen = new Set();
    const tests = rs.map((r) => {
      const rawTest = clean(r.TestItem);
      const rawCond = clean(r.TestCondition);
      const rawUnit = clean(r.Unit);
      const name = normalizeTestItem(rawTest);
      const cond = normalizeTestText(rawCond);
      const fullName = cond && !norm(name).includes(norm(cond)) ? name + ' (' + cond + ')' : name;
      const unit = normalizeUnit(rawUnit);
      const b = specBounds(r.Specification, unit);
      const pr = parseResult(r.Result);
      return {
        no: clean(r.No), name: fullName, unit, spec: clean(r.Specification),
        result: clean(r.Result), judgement: clean(r.Judgement),
        lsl: b.lsl, usl: b.usl, spec_ok: b.ok,
        values: pr.ResultParseStatus === 'OK' ? pr.Values : [],
        source_test_name: rawTest, test_condition: rawCond, source_unit: rawUnit,
        source_spec: clean(r.Specification), source_result: clean(r.Result),
        spec_display: specDisplay(b),
        _plot: pr.ResultParseStatus === 'OK' && pr.Values.length ? mean(pr.Values) : null,
      };
    }).filter((t) => {
      // Drop only exact duplicates after conservative normalization; preserve different Result/Spec/condition.
      const signature = [key(t.name), key(t.unit), key(t.spec), key(t.result), key(t.judgement)].join('|');
      if (testSeen.has(signature)) return false;
      testSeen.add(signature); return true;
    });
    const judg = [...new Set(tests.map((t) => key(t.judgement)).filter(Boolean))];

    records.push({
      id, vendor, category, material_type: itemDisplay, product_name: itemDisplay,
      item_display: itemDisplay, source_product_name: rawName, source_item_code: itemCode,
      date, year: date === 'Unknown' ? 'Unknown' : date.slice(0, 4), week: isoWeek(dt.date),
      date_basis: dt.date ? (dt.note ? `COA date (adjusted: ${dt.note})` : 'COADate printed on the COA')
        : `COA date ${dt.status.toLowerCase().replace(/_/g, ' ')}`,
      po, item: itemCode, lot, certificate: '', quantity: '',
      vendor_judgement: judg.length === 1 ? judg[0] : (judg.length ? 'MIXED' : ''), notes: '',
      source_file: clean(first.SourceFile), source_kind: 'CSV',
      tests: tests.map(({ _plot, ...t }) => t),
    });

    // Layer 1 gom theo VENDOR (không chia Item); series = TestItem + Unit + Spec
    const vc = (runCharts[vendor] ||= {});
    const ic = (vc[RUN_ALL] ||= {});
    for (const t of tests) {
      if (t._plot == null) continue;
      const sk = `${key(t.name)}|${key(t.unit)}|${t.spec_display}`;
      const s = (ic[sk] ||= {
        param: `${t.name} [${t.spec_display}]`, test_name: t.name, spec_key: sk, spec_display: t.spec_display,
        lsl: t.lsl, usl: t.usl, spec_ok: t.spec_ok, unit: t.unit, points: [],
      });
      s.points.push({
        po: po || '—', lot: lot || '—', item: itemDisplay, date, val: t._plot, raw: t.result, values: t.values,
        source_result: t.result, source_test_name: t.name, source: clean(first.SourceFile),
        date_basis: dt.date ? 'COADate' : 'COA date unavailable',
      });
    }
  }
  for (const v of Object.keys(runCharts)) for (const i of Object.keys(runCharts[v])) {
    runCharts[v][i] = Object.values(runCharts[v][i]).map((s) => ({ ...s, points: s.points.sort(byDate) }))
      .sort((a, b) => a.param.localeCompare(b.param));
  }
  records.sort(byDate);

  // Danh sách vendor để kiểm tra trùng tên (in vào build.log)
  const vendorList = [...new Set(records.map((r) => r.vendor))].sort();

  return {
    metadata: {
      title: 'Wanek Vendor COA Quality Dashboard - Weekly Report',
      generated_at: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }) + ' GMT+7',
      source: 'SharePoint COA_DOCUMENTS (synced)',
      pipeline: {
        csv_files: files.length, csv_old_format: oldFormat, pdf_count: rowsByPdf.size,
        csv_rows_current: current.length, superseded_csv: superseded,
        coa_count: records.length, vendor_count: vendorList.length, vendors: vendorList,
        multi_coa_pdfs: [...new Set(coaGroups.filter((g) => g.multi).map((g) => g.pdf))].length,
        unknown_dates: records.filter((r) => r.date === 'Unknown').length,
        errors: errors.length, seconds: +((Date.now() - t0) / 1000).toFixed(1),
      },
      errors: errors.slice(0, 300),
    },
    kpis: { excluded_docs: 0 },
    records, run_charts: runCharts,
  };
}
module.exports = { buildDataset };
