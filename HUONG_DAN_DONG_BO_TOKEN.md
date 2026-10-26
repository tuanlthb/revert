# Hướng Dẫn Vận Hành & Khắc Phục Lỗi Đồng Bộ Token (v4.2)

## 🌟 CẬP NHẬT MỚI Ở BẢN v4.2:
1. **Khắc phục lỗi đè tool báo cáo trên `nhanh.ghn.vn`**:
   - Đã loại bỏ hoàn toàn `@match https://*.ghn.vn/*`.
   - Script Tampermonkey giờ đây **CHỈ chạy duy nhất trên trang `https://tracuunoibo.ghn.vn/*`**, tuyệt đối không chạy và không hiện widget trên `nhanh.ghn.vn` hay bất kỳ trang nào khác, trả lại nguyên trạng tool báo cáo của bạn.
2. **Ẩn hoàn toàn Google Sheet & Hướng dẫn lấy Token đối với nhân viên**:
   - Màn hình đăng nhập đã gỡ bỏ hoàn toàn đường dẫn tới Google Sheet.
   - Thanh Menu Header và Bảng Kết Quả đã ẩn các nút mở Google Sheet và nút Hướng Dẫn đối với nhân viên thường.
   - **Chỉ khi Quản lý (Admin) đăng nhập**: Nút mở Google Sheet mới xuất hiện, đồng thời trong bảng **Quản Lý Chia Sẻ** (`#modal-admin`) có sẵn nút mở Google Sheet và nút xem Hướng Dẫn Cài Đặt Tampermonkey riêng cho Quản lý.

---

## 🚀 2 BƯỚC CẬP NHẬT NHANH (CHỈ MẤT 1 PHÚT)

### BƯỚC 1: Cập Nhật Script Tampermonkey Trên Trình Duyệt Quản Lý (Quan Trọng)
1. Mở Chrome/Edge trên máy bạn (máy có đăng nhập GHN).
2. Bấm biểu tượng **Tampermonkey** trên thanh công cụ $\rightarrow$ Chọn **Bảng điều khiển (Dashboard)** $\rightarrow$ Bấm mở script **GHN Revert Kho**.
3. **Xóa hết** code cũ trong Tampermonkey.
4. Mở file [`ghn_revert_kho.user.js`](file:///d:/Revert/ghn_revert_kho.user.js) trong thư mục này, copy toàn bộ nội dung và dán vào Tampermonkey.
5. Bấm **Ctrl + S** để lưu.
6. **Kiểm tra**:
   - Mở lại trang `nhanh.ghn.vn`: **Widget hoàn toàn biến mất**, tool báo cáo hoạt động bình thường!
   - Mở lại trang [https://tracuunoibo.ghn.vn/internal/revert](https://tracuunoibo.ghn.vn/internal/revert): Widget GHN Revert xuất hiện bình thường và tự động đẩy Token lên Cloud.

---

### BƯỚC 2: Kiểm Tra Trang Web Revert
1. Tải lại trang web: [https://tuanlthb.github.io/revert/](https://tuanlthb.github.io/revert/)
2. Màn hình đăng nhập giờ đây rất gọn gàng, bảo mật, không còn hiển thị link Google Sheet hay hướng dẫn token nào.
3. Khi nhân viên đăng nhập: chỉ thấy nút thao tác đổi kho, không thấy link Google Sheet hay nút Hướng Dẫn.
4. Khi Quản lý đăng nhập (`admin`):
   - Sẽ xuất hiện nút **Nhật Ký Google Sheet** trên góc phải.
   - Bấm nút **Quản lý Chia Sẻ** để Bật/Tắt quyền nhân viên, xem thông tin Token và mở Bảng Google Sheet hoặc xem lại Hướng dẫn Tampermonkey.
