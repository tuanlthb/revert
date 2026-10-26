# GHN Revert Hub - Công Cụ Đổi Kho GHN Trực Tuyến (v4.3)

Ứng dụng web trực tuyến hỗ trợ chuyển đổi kho hàng loạt cho các đơn hàng thông qua hệ thống **GHN Tra Cứu Nội Bộ** (`https://tracuunoibo.ghn.vn/internal/revert`) kết hợp máy chủ bảo mật Google Apps Script và ghi log Google Sheet.

- **Trang web trực tuyến**: [https://tuanlthb.github.io/revert/](https://tuanlthb.github.io/revert/)
- **Bảng Nhật Ký Google Sheet**: [https://docs.google.com/spreadsheets/d/1myvJs5M404MNhQeTxtzijlwEnNr7JIUT3itEVYrr6FM/edit?usp=sharing](https://docs.google.com/spreadsheets/d/1myvJs5M404MNhQeTxtzijlwEnNr7JIUT3itEVYrr6FM/edit?usp=sharing)
- **Máy chủ trung gian Google Apps Script**: `https://script.google.com/macros/s/AKfycbwZFnRy-xnNDFtIjo7bJbdclWCH0INStn-SglOH9XiLUC5v7v1jADjbmHE9IFroaXF0/exec`

---

## 🌟 Cải Tiến Quan Trọng v4.3:

1. **Khắc Phục Triệt Để Lỗi HTTP 404 Khi Đổi Kho**:
   - Trình duyệt nhân viên gửi lệnh trực tiếp đến API GHN (`fe-online-gateway.ghn.vn`) với User-Agent chuẩn của trình duyệt (tránh tường lửa GHN chặn User-Agent của Google Apps Script).
   - Đơn hàng được đổi kho thành công thực tế, sau đó tự động gửi dữ liệu về Google Apps Script để lưu nhật ký vào Google Sheet.
2. **Cơ Chế Đồng Bộ Token An Toàn Tuyệt Đối Cho Tài Khoản GHN**:
   - Gỡ bỏ hoàn toàn việc can thiệp vào các hàm fetch / XHR của trang GHN.
   - Gỡ bỏ vòng lặp quét 3 giây.
   - **Chỉ tự động đẩy Token 1 lần duy nhất vào đầu ngày**, hoặc chỉ khi Quản lý chủ động bấm nút "⚡ Đẩy Token".
3. **Bảo Mật Giao Diện & Xóa Triệt Để Link Xem Log Trên Trang Đăng Nhập**:
   - Bổ sung cấu hình chống cache và mã xóa tự động mọi liên kết ngoài trong modal đăng nhập.
   - Chỉ Quản lý đăng nhập mới có quyền mở xem Bảng Nhật Ký Google Sheet.
