# COA Dashboard v2

## Cấu trúc
```
C:\coa-dashboard\
├─ package.json
├─ template.html        (Giao diện dashboard HTML)
├─ prepare_template.js  (Tạo template từ file HTML gốc nếu cần)
├─ linked_slicers.js    (Bộ lọc động liên kết các slicer)
├─ install_task.bat     (Tạo task Windows chạy tự động mỗi 15 phút)
├─ run_hidden.vbs       (Chạy ngầm ẩn cửa sổ console)
├─ test_parse.js        (Kiểm tra bộ phân tích số liệu Specification & Result)
├─ out\                 (Tự tạo khi chạy: build.log, file tạm)
└─ src\
   ├─ config.js   Đường dẫn động, Vendor aliases, Nhóm vật tư
   ├─ run.js      Chạy chính, ghi kết quả vào Wanek_Vendor_COA_Quality_Dashboard_Weekly_Report.html
   ├─ build.js    Đọc CSV 16 cột từ SharePoint, tách/gộp COA thông minh
   ├─ files.js    Tìm mọi thư mục COA_csv dưới COA_ROOT, lọc bản mới nhất
   ├─ csv.js      Đọc CSV chuẩn RFC 4180, xử lý UTF-8 BOM
   ├─ parse.js    Đọc Specification (LSL/USL) & Result (số, dải đo, số mũ)
   └─ dates.js    Chuẩn hoá ngày COA, tuần ISO, sửa ngày tương lai
```

## Chạy
```cmd
npm run build
```
hoặc chạy trực tiếp bằng node:
```cmd
node src/run.js
```
Kết quả kiểm tra tại: `out\build.log`

## Lưu ý
Toàn bộ mã nguồn sử dụng 100% thư viện chuẩn có sẵn của Node.js (`fs`, `path`), không phụ thuộc bất kỳ gói npm bên ngoài nào (`zero external dependencies`). Không cần chạy `npm install`.
