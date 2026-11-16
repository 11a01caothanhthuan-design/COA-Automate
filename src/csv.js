'use strict';
// CSV RFC 4180: bỏ BOM, hỗ trợ ngoặc kép, dấu phẩy và xuống dòng trong ô.
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function csvToObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { columns: [], records: [] };
  const columns = rows[0].map((h) => h.replace(/\ufeff/g, '').trim());
  const records = rows.slice(1)
    .filter((r) => r.some((v) => String(v).trim() !== ''))
    .map((r, idx) => {
      const o = { __row: idx + 2 };
      columns.forEach((c, i) => { o[c] = r[i] == null ? '' : r[i]; });
      return o;
    });
  return { columns, records };
}
module.exports = { parseCsv, csvToObjects };
