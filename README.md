# GHN Revert Hub - Công Cụ Đổi Kho GHN Trực Tuyến (v4.0)

Ứng dụng web trực tuyến hỗ trợ chuyển đổi kho hàng loạt cho các đơn hàng thông qua hệ thống **GHN Tra Cứu Nội Bộ** (`https://tracuunoibo.ghn.vn/internal/revert`) kết hợp máy chủ bảo mật Google Apps Script và ghi log Google Sheet.

- **Trang web trực tuyến**: [https://tuanlthb.github.io/revert/](https://tuanlthb.github.io/revert/)
- **Bảng Nhật Ký Google Sheet**: [https://docs.google.com/spreadsheets/d/1myvJs5M404MNhQeTxtzijlwEnNr7JIUT3itEVYrr6FM/edit?usp=sharing](https://docs.google.com/spreadsheets/d/1myvJs5M404MNhQeTxtzijlwEnNr7JIUT3itEVYrr6FM/edit?usp=sharing)
- **Máy chủ trung gian Google Apps Script**: `https://script.google.com/macros/s/AKfycbwZFnRy-xnNDFtIjo7bJbdclWCH0INStn-SglOH9XiLUC5v7v1jADjbmHE9IFroaXF0/exec`

---

## 🌟 Tính Năng Nổi Bật v4.0

1. **Bảo Mật Token Quản Lý Tuyệt Đối**:
   - Token GHN của Quản lý được giữ an toàn trên Google Apps Script, trình duyệt của nhân viên **không bao giờ nhận Token thô**.
   - Mọi máy tính của nhân viên khi vào web đều thao tác được qua máy chủ trung gian mà không cần cài extension hay lấy token thủ công.
2. **Nút BẬT / TẮT Chia Sẻ Token**:
   - Quản lý có công tắc **BẬT / TẮT CHIA SẺ** ngay trên Widget Tampermonkey tại `tracuunoibo.ghn.vn` và trên web.
   - Khi TẮT: hệ thống lập tức chặn toàn bộ nhân viên thao tác.
3. **Cơ Chế Đăng Nhập & Ghi Nhật Ký Google Sheet**:
   - Bắt buộc nhân viên đăng nhập trước khi sử dụng.
   - Tự động ghi lại lịch sử thao tác vào tab `NhatKyDoiKho` trên Google Sheet với các cột:
     `STT`, `Tài khoản`, `Họ tên`, `Mã đơn`, `Đổi kho từ kho nào đến kho nào`, `Thời gian`, `Loại kho cập nhật`, `Kho đích (mới)`, `Kho ban đầu (cũ)`, `Lý do đổi kho`, `Kết quả`, `Chi tiết / Mã Eform`, `Mã phiên`, `Thiết bị`.
4. **Chọn Phường/Xã Đúng (Hệ Thống Tự Chọn Kho)**:
   - Hỗ trợ cả 2 chuẩn địa chỉ GHN: Địa chỉ cũ (3 cấp: Tỉnh -> Quận -> Phường) và Địa chỉ mới V3 (2 cấp: Tỉnh -> Phường).
   - Tự động tra cứu và điền kho phụ trách theo đúng quy định của GHN.
5. **Giao Diện Chuẩn Hóa**:
   - Đã ẩn hoàn toàn ô nhập / hiển thị Token thô.
   - Chỉ hiển thị trạng thái kết nối Token GHN trực quan và thông tin nhân viên đang đăng nhập.
