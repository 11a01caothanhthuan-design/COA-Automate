'use strict';
// Đọc COA_csv → xử lý → nhúng vào template → xuất dashboard.html.
// Log, file tạm và khoá nằm ở WORK_DIR (trên máy), chỉ dashboard.html được chép sang OUTPUT_FILE.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { buildDataset } = require('./build');

const MARK = '/*__DATA__*/null';
const WORK_DIR = cfg.WORK_DIR || path.join(__dirname, '..', 'out');

const log = (m) => {
  const line = `${new Date().toISOString()}  ${m}`;
  console.log(line);
  try { fs.mkdirSync(WORK_DIR, { recursive: true }); fs.appendFileSync(path.join(WORK_DIR, 'build.log'), line + '\n'); } catch (_) {}
};

async function main() {
  if (!/\.html?$/i.test(cfg.OUTPUT_FILE)) {
    console.log(`LỖI: OUTPUT_FILE phải là đường dẫn tới FILE .html (hiện là: ${cfg.OUTPUT_FILE})`);
    process.exitCode = 1; return;
  }
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const lock = path.join(WORK_DIR, 'dashboard.lock');
  let owned = false;
  try {
    if (fs.existsSync(lock) && Date.now() - fs.statSync(lock).mtimeMs < 10 * 60 * 1000) return log('Đang có lượt chạy khác, bỏ qua');
    fs.writeFileSync(lock, String(process.pid));
    owned = true;

    const tpl = fs.readFileSync(cfg.TEMPLATE_FILE, 'utf8');
    if (!tpl.includes(MARK)) throw new Error('template.html chưa có dấu /*__DATA__*/null (chạy prepare_template.js)');
    const data = await buildDataset();
    const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');
    const html = tpl.replace(MARK, () => json);

    // Ghi xong ở máy rồi mới chép sang thư mục xuất (để không ai mở phải file ghi dở)
    const tmp = path.join(WORK_DIR, 'dashboard.tmp.html');
    fs.writeFileSync(tmp, html, 'utf8');
    fs.mkdirSync(path.dirname(cfg.OUTPUT_FILE), { recursive: true });
    for (let i = 0; ; i++) {
      try { fs.copyFileSync(tmp, cfg.OUTPUT_FILE); break; }
      catch (e) { if (i >= 5) throw e; await new Promise((r) => setTimeout(r, 2000)); }  // file đang bị mở
    }

    const p = data.metadata.pipeline;
    log(`OK  ${p.coa_count} COA từ ${p.pdf_count} PDF, ${p.csv_files} CSV (${p.superseded_csv} bản cũ, ${p.csv_old_format} cấu trúc cũ), ${p.vendor_count} vendor, ${p.unknown_dates} ngày Unknown, ${p.errors} cảnh báo/lỗi, ${p.seconds}s`);
    log(`  PDF tách nhiều COA: ${p.multi_coa_pdfs}`);
    log(`  Vendor: ${(p.vendors || []).join(' | ')}`);
    data.metadata.errors.forEach((e) => log(`  ${e.severity} ${e.code}  ${e.detail}  | ${e.path}`));
  } catch (e) {
    log('LỖI: ' + (e.stack || e.message));   // giữ nguyên dashboard.html cũ
    process.exitCode = 1;
  } finally {
    if (owned) { try { fs.unlinkSync(lock); } catch (_) {} }
  }
}
main();
