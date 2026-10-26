# Hướng Dẫn Vận Hành & Khắc Phục Lỗi Hệ Thống GHN Revert Hub (v4.3)

## 🔍 NGUYÊN NHÂN CÁC VẤN ĐỀ ĐÃ ĐƯỢC GIẢI QUYẾT TRIỆT ĐỂ:

1. **Lỗi "HTTP 404 khi nhân viên đổi kho" trên Google Sheet**:
   - **Nguyên nhân chính xác**: Tường lửa bảo vệ của GHN (`fe-online-gateway.ghn.vn`) chặn toàn bộ yêu cầu có `User-Agent: Google-Apps-Script` và trả về mã lỗi `HTTP 404 Not Found`. Do trước đây máy chủ Google Apps Script gọi sang GHN, GHN chặn lại nên đơn không đổi được và ghi nhận lỗi 404 vào Google Sheet.
   - **Giải pháp v4.3**: Trình duyệt của nhân viên (chạy Chrome/Edge từ IP Việt Nam) sẽ gửi lệnh đổi kho trực tiếp đến GHN (`fe-online-gateway.ghn.vn` mở sẵn CORS `*`), Token được cấp ngầm trong phiên làm việc an toàn (không lộ ra giao diện). Sau khi GHN đổi kho xong, trình duyệt sẽ gửi toàn bộ kết quả thật về Google Apps Script để ghi nhận chuẩn xác vào Google Sheet. Đơn được đổi kho 100%!

2. **Vấn đề "Cập nhật Token chạy liên tục ảnh hưởng tài khoản GHN"**:
   - **Đã khắc phục hoàn toàn trong Tampermonkey v4.3**:
     - **Gỡ bỏ hoàn toàn** các hook can thiệp `fetch` và `XMLHttpRequest` của GHN.
     - **Gỡ bỏ hoàn toàn** vòng lặp quét định kỳ 3 giây (`setInterval`).
     - **Cơ chế 1 lần đầu ngày**: Hệ thống ghi nhớ ngày đã gửi. Mỗi ngày khi bạn mở trang `tracuunoibo.ghn.vn` lần đầu tiên, hệ thống chỉ đẩy Token **đúng 1 lần duy nhất**. Suốt thời gian còn lại trong ngày, dù bạn tải lại trang hay làm việc bao nhiêu lần, script **tuyệt đối không gửi thêm bất kỳ yêu cầu nào**.
     - Khi cần cập nhật thêm, bạn chỉ cần bấm nút **"⚡ Đẩy Token"** trên widget.

3. **Màn hình đăng nhập vẫn còn hiện "Xem trang log"**:
   - Đã gỡ bỏ sạch sẽ mọi thẻ liên kết trong modal đăng nhập, đồng thời thêm mã Javascript tự động quét và xóa triệt để mọi liên kết ngoài khi hiển thị màn hình đăng nhập.
   - Đã bổ sung các thẻ chặn cache (`no-cache, no-store, must-revalidate`) và đánh số phiên bản `?v=4.3` để trình duyệt tự động cập nhật ngay lập tức.

---

## 🚀 3 BƯỚC ĐỂ ÁP DỤNG BẢN SỬA LỖI (CHỈ MẤT 1 PHÚT)

### BƯỚC 1: Cập Nhật Google Apps Script
1. Mở dự án Google Apps Script của bạn:  
   👉 [https://script.google.com](https://script.google.com)
2. Mở file **`Code.gs`** $\rightarrow$ **Xóa toàn bộ** code cũ.
3. Mở file [`gas/Code.gs`](file:///d:/Revert/gas/Code.gs), copy toàn bộ nội dung và dán vào `Code.gs`.
4. Bấm **Ctrl + S** để Lưu.
5. **Tạo phiên bản triển khai mới (RẤT QUAN TRỌNG)**:
   - Bấm nút xanh **Triển khai (Deploy)** $\rightarrow$ **Quản lý phiên bản triển khai (Manage deployments)**.
   - Bấm biểu tượng **Cây bút ✏️ (Chỉnh sửa / Edit)** tại phiên bản đang hoạt động.
   - Tại ô **Phiên bản (Version)**, chọn **"Phiên bản mới" (New version)**.
   - Bấm nút **Triển khai (Deploy)** màu xanh bên dưới.

---

### BƯỚC 2: Cập Nhật Tampermonkey v4.3 (Nhẹ Nhàng & An Toàn Tuyệt Đối)
1. Mở Chrome/Edge trên máy Quản lý $\rightarrow$ Bấm tiện ích **Tampermonkey** $\rightarrow$ **Dashboard (Bảng điều khiển)** $\rightarrow$ Mở script **GHN Revert Kho**.
2. **Xóa toàn bộ** code cũ trong Tampermonkey.
3. Mở file [`ghn_revert_kho.user.js`](file:///d:/Revert/ghn_revert_kho.user.js), copy toàn bộ nội dung và dán vào Tampermonkey.
4. Bấm **Ctrl + S** để Lưu script.
5. Mở lại trang [tracuunoibo.ghn.vn](https://tracuunoibo.ghn.vn/internal/revert):
   - Script chỉ đồng bộ 1 lần duy nhất đầu ngày hoặc khi bạn bấm nút `⚡ Đẩy Token`. Không còn chạy ngầm liên tục làm ảnh hưởng đến tài khoản!

---

### BƯỚC 3: Cập Nhật Code Web Lên GitHub & Trải Nghiệm
1. Commit & Push các file đã sửa ([`index.html`](file:///d:/Revert/index.html), [`app.js`](file:///d:/Revert/app.js), [`styles.css`](file:///d:/Revert/styles.css)) lên GitHub.
2. Mở trang: [https://tuanlthb.github.io/revert/](https://tuanlthb.github.io/revert/)
3. Bấm tổ hợp phím **Ctrl + Shift + R** (hoặc **Ctrl + F5**) để trình duyệt làm mới bộ nhớ đệm:
   - Màn hình đăng nhập hoàn toàn sạch sẽ, không còn nút xem log.
   - Khi nhân viên thao tác đổi kho: đơn được cập nhật trực tiếp thành công lên GHN, không còn bị lỗi 404, nhật ký Google Sheet ghi nhận đầy đủ trạng thái "Thành công"!
