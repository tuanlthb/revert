# GHN Revert Hub - Công Cụ Cập Nhật Kho Đơn Hàng GHN

Ứng dụng web trực tuyến hỗ trợ chuyển đổi kho hàng loạt cho các đơn hàng thông qua hệ thống **GHN Tra Cứu Nội Bộ** (`https://tracuunoibo.ghn.vn/internal/revert`).

---

## 🌟 Các Tính Năng Nổi Bật

1. **Kết nối trực tiếp API GHN**:
   - Sử dụng chính xác endpoint nội bộ của GHN: `https://fe-online-gateway.ghn.vn/order-tracking/public-api/internal/update-orders-warehouse`.
   - Chạy được trực tiếp trên trình duyệt mọi nơi (mở file `index.html` hoặc đưa lên GitHub Pages, Vercel, Netlify) vì hệ thống GHN đã cấu hình `Access-Control-Allow-Origin: *`.
2. **Quản lý Token thông minh**:
   - Nhập Token một lần, tự động lưu trong `localStorage`.
   - Tự động kiểm tra tính hợp lệ và hiển thị thông tin nhân viên (Tên, Mã nhân viên).
3. **Đầy đủ 4 tùy chọn kho**:
   - 🚚 **Kho Giao** (`Deliver` - value: `3`)
   - 🏢 **Kho Hiện Tại** (`Current` - value: `1`)
   - 📦 **Kho Lấy** (`Pick` - value: `2`)
   - 🔄 **Kho Trả** (`Return` - value: `4`)
4. **Tìm kiếm hơn 1.650 bưu cục toàn quốc**:
   - Tìm kiếm thời gian thực theo Tên bưu cục, Mã kho (ID), hoặc Địa chỉ / Tỉnh thành.
   - Dữ liệu kho được lưu sẵn trong `warehouses.data.js` và tự động đồng bộ khi có kết nối mạng.
5. **Chuẩn hóa danh mục lý do đổi kho**:
   - Khu vực giáp ranh với BC khác gần hơn (`area_closer_to_other_bc`)
   - Chuyển BC khác hỗ trợ quá tải (`overload_support_other_bc`)
   - Chuyển về BC mới mở (`newly_opened_bc`)
   - Sai cân nặng kích thước chuyển về đúng BC phụ trách (`wrong_weight_dimension_correct_bc`)
   - Địa chỉ nằm ở khu vực BC khác phụ trách (`address_other_bc`)
   - Lý do khác (`other_reason`) kèm ô nhập diễn giải chi tiết.
6. **Xử lý đơn hàng loạt an toàn**:
   - Tự động chuẩn hóa mã đơn, lọc trùng lặp, hỗ trợ dán trực tiếp từ cột Excel hoặc tải file `.xlsx`, `.csv`.
   - Hỗ trợ chia gói (batching: 30 / 50 / 100 đơn/lượt) kèm thanh tiến trình và nút dừng khẩn cấp.
7. **Báo cáo kết quả & Xuất Excel**:
   - Phân loại 3 nhóm: Thành công / Chờ duyệt Eform / Thất bại.
   - Xuất file `.xlsx` đầy đủ thông tin đối soát.

---

## 🚀 Cách Sử Dụng

### Bước 1: Mở ứng dụng
- Bạn có thể mở trực tiếp file `d:\Revert\index.html` bằng trình duyệt Chrome, Edge, Cốc Cốc,...
- Hoặc deploy thư mục này lên bất kỳ hosting tĩnh miễn phí nào (GitHub Pages, Vercel, Cloudflare Pages).

### Bước 2: Lấy Token GHN
Có 2 cách đơn giản nhất:
- **Cách 1**: Đăng nhập `tracuunoibo.ghn.vn`, nhấn `F12` -> tab **Console** -> gõ:
  ```javascript
  copy(localStorage.getItem('token') || sessionStorage.getItem('token'));
  ```
  Nhấn `Enter`, token sẽ được copy vào clipboard.
- **Cách 2**: Cài đặt Userscript bổ trợ `ghn_revert_kho.user.js` vào Tampermonkey. Khi vào trang GHN, nhấn nút nổi "Revert Kho Nhanh" để copy token tự động.

### Bước 3: Dán Token và Thao tác
1. Dán token vào ô Token trên cùng và bấm **"Lưu & Kết Nối"**.
2. Dán danh sách đơn hàng vào ô số 1 (hoặc bấm nút "File" để tải file Excel lên).
3. Chọn loại kho muốn cập nhật (Kho Giao / Kho Hiện Tại / Kho Lấy / Kho Trả).
4. Tìm và chọn kho chuyển sang tại ô số 2.
5. Chọn lý do đổi kho.
6. Bấm nút **"CẬP NHẬT KHO"** và xác nhận trên hộp thoại.
7. Theo dõi tiến trình và tải báo cáo Excel khi hoàn tất.
