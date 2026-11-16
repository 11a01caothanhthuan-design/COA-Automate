'use strict';
const fs = require('fs');
const path = require('path');

function resolveCoaRoot() {
  if (process.env.COA_ROOT) return process.env.COA_ROOT;
  const user = process.env.USERPROFILE || process.env.HOME || 'C:/Users/ttcao';
  const candidates = [
    'C:/Users/ttcao/Ashley Furniture Industries, Inc/A Team_Quality Laboratory Testing and Raw Material - COA_DOCUMENTS/COA',
    path.join(user, 'Ashley Furniture Industries, Inc', 'A Team_Quality Laboratory Testing and Raw Material - COA_DOCUMENTS', 'COA'),
    path.join(user, 'OneDrive - Ashley Furniture Industries, Inc', 'COA_DOCUMENTS', 'COA'),
    path.resolve(__dirname, '..', '..', 'COA'),
    'D:/DA/Wanek_3/COA'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

const resolvedCoaRoot = resolveCoaRoot();

function resolveOutputFile(coaRoot) {
  if (process.env.OUTPUT_FILE) return process.env.OUTPUT_FILE;
  const user = process.env.USERPROFILE || process.env.HOME || 'C:/Users/ttcao';
  const candidates = [
    'C:/Users/ttcao/Ashley Furniture Industries, Inc/A Team_Quality Laboratory Testing and Raw Material - COA_DOCUMENTS/COA_Dashboard/Wanek_Vendor_COA_Quality_Dashboard_Weekly_Report.html',
    path.join(user, 'Ashley Furniture Industries, Inc', 'A Team_Quality Laboratory Testing and Raw Material - COA_DOCUMENTS', 'COA_Dashboard', 'Wanek_Vendor_COA_Quality_Dashboard_Weekly_Report.html'),
    path.join(path.dirname(coaRoot), 'COA_Dashboard', 'Wanek_Vendor_COA_Quality_Dashboard_Weekly_Report.html')
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.dirname(c))) return c;
  }
  return candidates[0];
}

module.exports = {
  // Thư mục COA đã đồng bộ. Bên trong: COA/PDF và COA/COA_csv (hoặc COA/<Vendor>/COA_csv)
  COA_ROOT: resolvedCoaRoot,

  // Nơi xuất dashboard (thư mục COA_Dashboard đã đồng bộ lên SharePoint). Phải kết thúc bằng .html
  OUTPUT_FILE: resolveOutputFile(resolvedCoaRoot),

  // Log, file tạm, khoá: mặc định nằm trong thư mục out của project
  WORK_DIR: process.env.WORK_DIR || path.resolve(__dirname, '..', 'out'),

  TEMPLATE_FILE: process.env.TEMPLATE_FILE || path.join(__dirname, '..', 'template.html'),

  // Định dạng ngày đã xác minh (chỉ dùng khi COADate không phải yyyy-MM-dd)
  VENDOR_DATE_FORMAT: {
    'Dafa': 'MM/dd/yyyy', 'KHAI THANH': 'MM/dd/yyyy', 'TOMS': 'MM/dd/yyyy',
    'Far Eastern': 'dd/MM/yyyy', 'Mekong': null, 'Vikohassan': 'MM/dd/yyyy',
  },

  // COA không in ngày: lấy yyyyMMdd từ LotNumber hoặc tên file
  DATE_FROM_LOT_VENDORS: ['Mekong'],

  // Gộp các tên vendor khác nhau về một tên chuẩn (so sánh không phân biệt hoa/thường, dấu, ký tự đặc biệt).
  // Bên trái: tên AI ghi trong CSV. Bên phải: tên muốn hiện trên dashboard.
  VENDOR_ALIASES: {
    'VRG DONGWHA MDF JOINT STOCK COMPANY': 'AN THINH THANG',
    'VRG DONGWHA': 'AN THINH THANG',
    'VRG Dongwha MDF': 'AN THINH THANG',
    'Hoa My PAD': 'Hoa My',
    'Hoa My Co., Ltd': 'Hoa My',
    'HUA YING': 'HuaYing',
    'Ningbo Dafa Chemical Fiber Co.,Ltd': 'Dafa',
    'Ningbo Dafa New Material Co.,Ltd': 'Dafa',
    'Far Eastern Polytex (VN)': 'Far Eastern',
  },

  // Khi cột Vendor trống hoặc UNKNOWN_VENDOR: đoán vendor từ tên file PDF (biểu thức chính quy)
  VENDOR_BY_FILE: [
    { pattern: '^LOT_\\d{8}_PQ', vendor: 'Mekong' },
    { pattern: '^COA - PT0S', vendor: 'Vikohassan' },
    { pattern: '^COA_\\d{8}_(30651|73751)_', vendor: 'Dafa' },
    { pattern: 'SN-5[5-7]60', vendor: 'Far Eastern' },
    { pattern: 'HUAYING|HUA YING', vendor: 'HuaYing' },
    { pattern: 'AN THINH THANG', vendor: 'AN THINH THANG' },
    { pattern: 'Hoa_My|Hoa My', vendor: 'Hoa My' },
  ],

  // Nhóm vật liệu dự phòng khi cột MaterialCategory trống
  VENDOR_CATEGORY: {
    'Dafa': 'Fiber', 'Vikohassan': 'Fiber', 'Far Eastern': 'Fiber', 'TOMS': 'Fiber',
    'Mekong': 'Fiber', 'KHAI THANH': 'Fiber',
    'Thanh Cong': 'Plastic / Resin', 'HuaYing': 'Plastic / Resin', 'HUA YING': 'Plastic / Resin',
    'Tường Lực': 'Adhesive', 'Cao Cuong': 'Hardware', 'Ngoc Huong Phat': 'Hardware',
    'QUOC HUNG': 'Steel / Metal', 'AN THINH THANG': 'Wood',
  },

  // Quy đổi các biến thể tên nhóm về tên dùng trên dashboard
  CATEGORY_ALIASES: {
    'STEEL/METAL': 'Steel / Metal', 'METAL': 'Steel / Metal', 'STEEL': 'Steel / Metal',
    'PLASTIC/RESIN': 'Plastic / Resin', 'PLASTIC': 'Plastic / Resin', 'RESIN': 'Plastic / Resin',
    'FIBER': 'Fiber', 'FIBRE': 'Fiber', 'HARDWARE': 'Hardware', 'ADHESIVE': 'Adhesive',
    'WOOD': 'Wood', 'OTHER': 'Other',
  },

  // Thiếu một trong các cột này thì CSV bị bỏ qua (ghi lỗi vào build.log)
  CSV_REQUIRED: ['FileKey', 'SourceFile', 'Vendor', 'No', 'TestItem', 'Specification', 'Result'],

  // Cấu trúc CSV 16 cột. CSV thiếu cột thì để trống và ghi cảnh báo CSV_OLD_FORMAT
  CSV_COLUMNS: ['FileKey', 'SourceFile', 'Vendor', 'MaterialCategory', 'ProductName', 'ItemCode',
    'PONumber', 'LotNumber', 'COADate', 'No', 'TestItem', 'TestCondition', 'Unit',
    'Specification', 'Result', 'Judgement'],
};
