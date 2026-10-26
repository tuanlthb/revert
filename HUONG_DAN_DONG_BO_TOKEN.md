# Hướng Dẫn Vận Hành & Khắc Phục Lỗi "Token Không Hợp Lệ" (v4.5)

## 🔍 NGUYÊN NHÂN CHÍNH XÁC:
- **Nguyên nhân cốt lõi**: Token lưu trên máy chủ trước đó (`ff61e51e-...`) đã bị **hết hạn phiên làm việc trên GHN (trả về lỗi HTTP 401)**. 
- Khi phiên làm việc GHN của Quản lý hết hạn, GHN vẫn lưu chuỗi mã cũ trong bộ nhớ trình duyệt `localStorage`. Các phiên bản script trước chỉ kiểm tra độ dài chuỗi ký tự mà **không kiểm tra xem Token có thực sự còn sống hay không**, dẫn đến việc vô tình đẩy một Token chết/hết hạn lên Cloud cho toàn bộ nhân viên dùng.
- Khi nhân viên bấm "Cập nhật đổi kho", GHN đối chiếu mã Token và từ chối: **`401 Token không hợp lệ!`**.

---

## 💡 GIẢI PHÁP ĐỘT PHÁ Ở PHIÊN BẢN v4.5:

1. **Xác thực trực tiếp với GHN trước khi đẩy (verifyGhnToken)**:
   - Tampermonkey sẽ trực tiếp gọi API GHN (`fe-online-gateway.ghn.vn/.../user-info`) để kiểm tra Token.
   - **Chỉ khi GHN phản hồi HTTP 200 (kèm thông tin tên Quản lý)** thì mới công nhận là Token sống và cho phép đẩy lên Cloud.
   - Nếu Token đã hết hạn (401), hệ thống sẽ **từ chối ngay và cảnh báo màu đỏ**, tuyệt đối không đẩy token chết lên Cloud.

2. **Quét và chọn lọc toàn bộ bộ nhớ (Deep Storage Scan)**:
   - Thu thập toàn bộ các mã Token có trong `localStorage`, `sessionStorage`, `cookie` và các request mạng.
   - Tự động thử nghiệm từng token một để tìm ra Token đang sống thực sự của phiên làm việc hiện tại.

3. **Cảnh báo trực quan trên Widget Quản lý**:
   - Nếu Token sống: Hiện chấm xanh `🟢 [Tên Quản lý] (Token sống)`.
   - Nếu Token hết hạn: Hiện chấm đỏ `🔴 Token đã hết hạn! Vui lòng đăng xuất & đăng nhập lại GHN`.

---

## 🚀 3 BƯỚC ĐỂ BẠN LÀM MỚI TOKEN VÀ VẬN HÀNH NGAY (CHỈ MẤT 1 PHÚT)

### BƯỚC 1: Cập Nhật Google Apps Script
1. Mở dự án Google Apps Script của bạn:  
   👉 [https://script.google.com](https://script.google.com)
2. Mở file **`Code.gs`** $\rightarrow$ **Xóa toàn bộ** code cũ.
3. Mở file [`gas/Code.gs`](file:///d:/Revert/gas/Code.gs), copy toàn bộ nội dung và dán vào `Code.gs`.
4. Bấm **Ctrl + S** để Lưu.
5. **Tạo phiên bản triển khai mới**:
   - Bấm nút xanh **Triển khai (Deploy)** $\rightarrow$ **Quản lý phiên bản triển khai (Manage deployments)**.
   - Bấm biểu tượng **Cây bút ✏️ (Chỉnh sửa / Edit)** tại phiên bản đang hoạt động.
   - Tại ô **Phiên bản (Version)**, chọn **"Phiên bản mới" (New version)**.
   - Bấm nút **Triển khai (Deploy)** màu xanh bên dưới.

---

### BƯỚC 2: Cập Nhật Tampermonkey v4.5 & Đăng Nhập Lại GHN
1. Mở trình duyệt Chrome/Edge trên máy Quản lý $\rightarrow$ Mở icon **Tampermonkey** $\rightarrow$ **Dashboard** $\rightarrow$ Mở script **GHN Revert Kho**.
2. **Xóa toàn bộ** code cũ trong Tampermonkey.
3. Mở file [`ghn_revert_kho.user.js`](file:///d:/Revert/ghn_revert_kho.user.js), copy toàn bộ nội dung và dán vào Tampermonkey $\rightarrow$ Bấm **Ctrl + S** để Lưu.
4. Mở lại trang GHN nội bộ:  
   👉 [https://tracuunoibo.ghn.vn/internal/revert](https://tracuunoibo.ghn.vn/internal/revert)
5. **RẤT QUAN TRỌNG ĐỂ CÓ TOKEN SỐNG MỚI**:
   - Nếu widget ở góc phải hiện màu đỏ báo Token hết hạn:
     👉 **Hãy bấm Đăng xuất tài khoản GHN của bạn ra và Đăng nhập lại**.
   - Khi đăng nhập lại xong, widget sẽ tự động chuyển sang màu xanh:  
     `🟢 [Tên của bạn] (Token sống)`
   - Bấm nút **"⚡ Đẩy Token"** $\rightarrow$ Hệ thống sẽ hiện thông báo xanh: *✓ ĐÃ CẬP NHẬT TOKEN SỐNG LÊN CLOUD!*

---

### BƯỚC 3: Cập Nhật Code Web Lên GitHub & Trải Nghiệm
1. Commit & Push các file đã sửa ([`index.html`](file:///d:/Revert/index.html), [`app.js`](file:///d:/Revert/app.js)) lên kho GitHub của bạn.
2. Mở trang Web: [https://tuanlthb.github.io/revert/](https://tuanlthb.github.io/revert/)
3. Bấm **Ctrl + F5** để tải lại trang:
   - Header sẽ hiện: `🟢 Đã kết nối Token ([Tên Quản lý])`
   - Nhân viên nhập đơn, chọn kho và đổi kho: **Đơn hàng được đổi kho thành công 100% không còn bất kỳ lỗi nào!**
