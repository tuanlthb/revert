# Hướng Dẫn Vận Hành Hệ Thống GHN Revert Hub (Phiên Bản v4.0)

Hệ thống **v4.0** đã được nâng cấp toàn diện theo 4 yêu cầu quan trọng:

1. **Khắc phục triệt để lỗi Token trên máy nhân viên**:
   - Token GHN của Quản lý được lưu an toàn trên máy chủ Google Apps Script.
   - Mọi máy tính của nhân viên khi vào `https://tuanlthb.github.io/revert/` đều tự động sử dụng Token của Quản lý để thao tác đổi kho mà **không cần cài Tampermonkey** và **không cần biết chuỗi Token thô**.
2. **Nút BẬT / TẮT Chia Sẻ Token (Quản trị tập trung)**:
   - Có công tắc **BẬT / TẮT CHIA SẺ** ngay trên Widget Tampermonkey tại `tracuunoibo.ghn.vn` và trên màn hình Quản trị của web.
   - Khi Quản lý **TẮT Chia Sẻ**: toàn bộ nhân viên sẽ lập tức bị khóa, không thể gửi lệnh đổi kho.
3. **Bảo mật Đăng Nhập & Ghi Nhật Ký Google Sheet tự động**:
   - Nhân viên phải đăng nhập tài khoản trước khi thao tác.
   - Mọi lượt đổi kho đều tự động ghi lại vào Google Spreadsheet:
     [Bảng Nhật Ký Đổi Kho Trực Tuyến](https://docs.google.com/spreadsheets/d/1myvJs5M404MNhQeTxtzijlwEnNr7JIUT3itEVYrr6FM/edit?usp=sharing)
     gồm đầy đủ các cột: `Số thứ tự`, `Tài khoản`, `Họ tên`, `Mã đơn`, `Đổi kho từ kho nào đến kho nào`, `Thời gian`, `Loại kho cập nhật`, `Kho đích (mới)`, `Kho ban đầu (cũ)`, `Lý do đổi kho`, `Kết quả`, `Chi tiết / Mã Eform`, `Mã phiên`, `Thiết bị`.
4. **Bảo mật giao diện**:
   - Đã **loại bỏ và ẩn hoàn toàn** thanh nhập / hiển thị Token thô trên giao diện web.
   - Chỉ hiển thị huy hiệu trạng thái: **"Đã kết nối Token GHN (Sẵn sàng)"** hoặc **"Quản lý đang TẮT chia sẻ"** / **"Chưa kết nối Token"**.

---

## 🚀 HƯỚNG DẪN CÀI ĐẶT & KÍCH HOẠT (CHỈ CẦN LÀM 1 LẦN)

### BƯỚC 1: Cập Nhật Mã Nguồn Google Apps Script
1. Truy cập vào dự án Apps Script hiện tại của bạn:
   [https://script.google.com](https://script.google.com)
2. Mở file mã nguồn `Code.gs`.
3. Xóa toàn bộ nội dung cũ trong `Code.gs` và copy toàn bộ nội dung từ file [`gas/Code.gs`](file:///d:/Revert/gas/Code.gs) dán vào.
4. Bấm biểu tượng **Lưu (Ctrl + S)**.
5. **Chạy hàm khởi tạo (rất quan trọng)**:
   - Ở thanh công cụ bên trên, tại ô chọn hàm cần chạy, chọn hàm **`khoiTaoHeThong`** rồi bấm **Run (Chạy)**.
   - Hệ thống sẽ yêu cầu cấp quyền truy cập Google Sheet lần đầu: bấm *Review Permissions (Xem lại quyền)* -> Chọn tài khoản Google của bạn -> *Advanced (Nâng cao)* -> *Go to ... (unsafe) / Tiếp tục* -> *Allow (Cho phép)*.
   - Sau khi chạy xong, mở link Google Sheet của bạn sẽ thấy 3 tab đã được tự động tạo sẵn và định dạng chuẩn: `NhatKyDoiKho`, `TaiKhoan`, `NhatKyTruyCap`.
6. **Triển khai phiên bản mới**:
   - Bấm nút xanh **Triển khai (Deploy)** ở góc trên bên phải -> Chọn **Quản lý phiên bản triển khai (Manage deployments)**.
   - Bấm biểu tượng **Cây bút (Chỉnh sửa / Edit)** tại phiên bản đang hoạt động.
   - Tại ô **Phiên bản (Version)**, chọn **"Phiên bản mới" (New version)**.
   - Bấm **Triển khai (Deploy)**.
   *(Đường link `https://script.google.com/macros/s/AKfycbwZFnRy-xnNDFtIjo7bJbdclWCH0INStn-SglOH9XiLUC5v7v1jADjbmHE9IFroaXF0/exec` sẽ được cập nhật phiên bản mới nhất).*

---

### BƯỚC 2: Cài Đặt Tampermonkey v4.0 Trên Máy Quản Lý
1. Mở trình duyệt Chrome/Edge trên máy tính của bạn (máy có đăng nhập `tracuunoibo.ghn.vn`).
2. Mở tiện ích **Tampermonkey** -> Bấm **Tạo script mới** (hoặc mở script GHN Revert cũ).
3. Copy toàn bộ nội dung trong file [`ghn_revert_kho.user.js`](file:///d:/Revert/ghn_revert_kho.user.js) và dán đè vào, sau đó bấm **Ctrl + S** để lưu.
4. Truy cập trang: [https://tracuunoibo.ghn.vn/internal/revert](https://tracuunoibo.ghn.vn/internal/revert)
   - Ở góc dưới bên phải màn hình sẽ xuất hiện **Bảng điều khiển Quản trị Token v4.0**.
   - Tiện ích sẽ **tự động bắt Token GHN** của bạn và tự động đẩy lên Google Apps Script.
   - Bạn sẽ thấy công tắc lớn:
     - 🟢 **`ĐANG BẬT CHIA SẺ (Bấm để Tắt)`** -> Mọi nhân viên trên web đều dùng được.
     - 🔴 **`ĐANG TẮT CHIA SẺ (Bấm để Bật)`** -> Khóa toàn bộ nhân viên.

---

### BƯỚC 3: Nhân Viên Sử Dụng Trên Web Revert
1. Nhân viên truy cập trang web: [https://tuanlthb.github.io/revert/](https://tuanlthb.github.io/revert/)
2. Màn hình yêu cầu đăng nhập sẽ hiện ra:
   - **Tài khoản**: Nhập tài khoản GHN hoặc Họ tên của nhân viên (ví dụ: `nguyenvana` hoặc `Nguyễn Văn A`).
   - **Mật khẩu**: Nhập mật khẩu bất kỳ (ví dụ: `123456`).
   *(Hệ thống đã bật chế độ tự động cấp quyền: nhân viên đăng nhập lần đầu với tên của mình sẽ được tự động thêm vào tab `TaiKhoan` trên Google Sheet. Bạn có thể khóa hoặc đổi mật khẩu nhân viên bất kỳ lúc nào trực tiếp trên Google Sheet).*
3. Sau khi đăng nhập:
   - Nếu bạn đang **BẬT chia sẻ**: Huy hiệu hiện xanh **`Đã kết nối Token GHN (Sẵn sàng)`**. Nhân viên chỉ việc dán danh sách mã đơn, chọn loại kho, chọn phường/xã hoặc chọn kho đích rồi bấm **Cập nhật kho**.
   - Nếu bạn đang **TẮT chia sẻ**: Huy hiệu hiện đỏ **`Quản lý đang TẮT chia sẻ Token`** kèm thanh cảnh báo. Nút cập nhật sẽ bị khóa và nếu cố tình gửi lệnh hệ thống máy chủ sẽ chặn lại và báo lỗi ngay.
4. Mọi thao tác đổi kho đều được ghi trực tiếp vào Google Sheet [NhatKyDoiKho](https://docs.google.com/spreadsheets/d/1myvJs5M404MNhQeTxtzijlwEnNr7JIUT3itEVYrr6FM/edit?usp=sharing) theo đúng định dạng bạn yêu cầu.
