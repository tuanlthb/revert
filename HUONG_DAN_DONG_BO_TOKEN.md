# Hướng Dẫn Vận Hành & Khắc Phục Lỗi Hệ Thống GHN Revert Hub (v4.4)

## 🔍 NGUYÊN NHÂN VÀ GIẢI PHÁP TRIỆT ĐỂ:

### 1. Vấn đề "Log Google Sheet vẫn liên tục ghi nhận Cập nhật Token chưa ngừng":
- **Nguyên nhân chính xác**:
  - Trong máy chủ `gas/Code.gs`, hàm `doGet` trước đây ghi log vào tab `NhatKyTruyCap` trên mỗi lượt gọi mà không kiểm tra xem Token có thay đổi hay không. Nếu trên máy của bạn có tab trình duyệt cũ đang mở hoặc bản Tampermonkey cũ chưa cập nhật, nó liên tục gửi tín hiệu khiến Google Sheet bị chèn hàng loạt dòng log.
- **Giải pháp triệt để v4.4**:
  - **Chặn đứng tại máy chủ `Code.gs`**: Hệ thống kiểm tra nếu `Token gửi lên == Token đang có`, máy chủ trả về kết quả ngay lập tức và **TUYỆT ĐỐI KHÔNG GHI THÊM BẤT KỲ DÒNG NÀO VÀO GOOGLE SHEET**.
  - **Giới hạn tần suất**: Đặt cơ chế đệm bộ nhớ (CacheService) chỉ cho phép ghi nhận lịch sử đổi Token tối đa 1 lần / giờ. Hiện tượng spam log trên Google Sheet được xử lý 100%!

### 2. Lỗi "Token không hợp lệ!" khi nhân viên thực hiện đổi kho:
- **Nguyên nhân chính xác**:
  - Token được lưu trên máy chủ trước đó là Token cũ đã hết hạn (hoặc do GHN tự động đổi phiên đăng nhập). Khi bản Tampermonkey trước chỉ đọc 1 key `localStorage.getItem('token')`, nó không bắt được Token thực tế của phiên đăng nhập hiện tại từ GHN.
- **Giải pháp triệt để v4.4**:
  - **Cơ chế Bắt Token Thụ Động (Passive Sniffer)**: Tự động ghi nhận Header `token` của GHN khi bạn làm việc trên `tracuunoibo.ghn.vn` mà **KHÔNG GỬI BẤT KỲ REQUEST PHỤ NÀO**, đảm bảo an toàn 100% cho tài khoản.
  - **Quét sâu bộ nhớ (Deep Storage Scan)**: Tự động tìm kiếm Token định dạng UUID 36 ký tự (ví dụ: `e0ec89b5-...`) trong toàn bộ `localStorage`, `sessionStorage` và `cookie`.
  - **Hiển thị trực quan trên Widget Tampermonkey**: Widget ở góc phải màn hình sẽ hiện rõ 8 ký tự đầu của Token: `Token: e0ec89b5... (36 ký tự)` để Quản lý nhìn thấy tận mắt Token thật đang hoạt động.
  - **Cung cấp nút "⚡ Đẩy Token" & "📋 Copy Token"**: Giúp bạn đẩy ngay Token sống lên Cloud chỉ với 1 cú nhấp chuột.

### 3. Ẩn hoàn toàn bảng Google Sheet và hướng dẫn lấy Token khỏi màn hình nhân viên:
- Đã gỡ bỏ toàn bộ liên kết mở Google Sheet khỏi giao diện chính (Header và Bảng kết quả).
- Chỉ có Quản lý khi đăng nhập tài khoản có quyền `admin` và mở cửa sổ **"Quản trị"** mới nhìn thấy nút mở Google Sheet.

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

### BƯỚC 2: Cập Nhật Tampermonkey v4.4 Trên Máy Quản Lý
1. Mở trình duyệt Chrome/Edge trên máy Quản lý $\rightarrow$ Bấm icon **Tampermonkey** $\rightarrow$ **Dashboard (Bảng điều khiển)** $\rightarrow$ Mở script **GHN Revert Kho**.
2. **Xóa toàn bộ** code cũ trong Tampermonkey.
3. Mở file [`ghn_revert_kho.user.js`](file:///d:/Revert/ghn_revert_kho.user.js), copy toàn bộ nội dung và dán vào Tampermonkey.
4. Bấm **Ctrl + S** để Lưu script.
5. Mở lại trang [https://tracuunoibo.ghn.vn/internal/revert](https://tracuunoibo.ghn.vn/internal/revert):
   - Bạn sẽ nhìn thấy Widget ở góc phải dưới màn hình:
     - `Chủ: [Tên của bạn]`
     - `Token: e0ec89b5... (36 ký tự)`
     - Bấm nút **"⚡ Đẩy Token"** $\rightarrow$ Hệ thống sẽ hiện thông báo xanh: *✓ Đã cập nhật Token sống lên Cloud!*
   - Script chỉ đồng bộ đúng 1 lần đầu ngày, không hề chạy ngầm gây ảnh hưởng tới tài khoản của bạn.

---

### BƯỚC 3: Cập Nhật Code Web Lên GitHub & Trải Nghiệm
1. Commit & Push các file đã sửa ([`index.html`](file:///d:/Revert/index.html), [`app.js`](file:///d:/Revert/app.js), [`styles.css`](file:///d:/Revert/styles.css)) lên kho lưu trữ GitHub của bạn.
2. Mở trang: [https://tuanlthb.github.io/revert/](https://tuanlthb.github.io/revert/)
3. Bấm **Ctrl + Shift + R** (hoặc **Ctrl + F5**) để trình duyệt làm mới bộ nhớ đệm:
   - Header sẽ báo: `🟢 Đã kết nối Token (Quản lý - Cập nhật lúc...)`
   - Nhân viên chỉ cần nhập đơn và chọn kho, bấm Cập nhật là đơn được đổi kho thành công ngay lập tức!
   - Không còn liên kết xem Sheet trên trang nhân viên, nhật ký đổi kho ghi nhận chuẩn xác từng đơn!
