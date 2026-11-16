'use strict';
const fs = require('fs');
const path = require('path');

// Tìm mọi file .csv nằm trong thư mục tên "COA_csv", ở bất kỳ độ sâu nào dưới COA_ROOT.
// Hỗ trợ cả hai cấu trúc:
//   COA/COA_csv/*.csv            (cấu trúc phẳng hiện tại)
//   COA/<Vendor>/COA_csv/*.csv   (cấu trúc cũ theo vendor)
// Thư mục PDF bị bỏ qua.
function listFiles(root) {
  if (!fs.existsSync(root)) throw new Error(`Không thấy thư mục COA_ROOT: ${root}`);
  const out = [];

  function walk(dir, depth) {
    if (depth > 4) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('~$')) continue;
      const p = path.join(dir, e.name);
      if (e.name.toLowerCase() === 'coa_csv') {
        const vendorFolder = path.resolve(dir) === path.resolve(root) ? '' : path.basename(dir);
        for (const f of fs.readdirSync(p, { withFileTypes: true })) {
          if (!f.isFile() || f.name.startsWith('~$') || f.name.startsWith('.')) continue;
          if (path.extname(f.name).toLowerCase() !== '.csv') continue;
          const fp = path.join(p, f.name);
          out.push({ vendor: vendorFolder, path: fp, name: f.name, mtimeMs: fs.statSync(fp).mtimeMs });
        }
      } else if (e.name.toLowerCase() !== 'pdf') {
        walk(p, depth + 1);
      }
    }
  }

  walk(root, 0);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// Thời điểm phiên bản: hậu tố _yyyyMMdd_HHmmss trong tên CSV, không có thì dùng ngày sửa file
function versionTime(name, mtimeMs) {
  const m = name.replace(/\.csv$/i, '').match(/_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : (mtimeMs || 0);
}
module.exports = { listFiles, versionTime };
