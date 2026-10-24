# Hướng Dẫn Thiết Lập Tự Động Kết Nối & Đồng Bộ Token GHN (Bản Mới v3.0)

Hệ thống đã được nâng cấp lên **v3.0**, khắc phục triệt để các nguyên nhân khiến Token chưa tự động kết nối được trước đây:

1. **Sửa lỗi lọc độ dài Token UUID 36 ký tự**: Trên `tracuunoibo.ghn.vn`, Token phiên đăng nhập của nhân viên có định dạng UUID 36 ký tự (ví dụ: `ed19b5b2-74a1-42f5-bdd3-d3deecd16278`). Bản cũ kiểm tra `token.length < 50` nên đã bỏ qua không đồng bộ Token 36 ký tự này. Bản v3.0 đã mở khóa hoàn toàn cho cả Token UUID 36 ký tự và JWT.
2. **Bổ sung Cầu nối trực tiếp Tampermonkey (Zero-Config)**: Khi bạn cài [`ghn_revert_kho.user.js`](file:///d:/Revert/ghn_revert_kho.user.js) vào Tampermonkey, script sẽ tự động bắt Token từ cả `localStorage` lẫn các gói tin mạng (`fetch`/`XHR`) trên `tracuunoibo.ghn.vn` và **bơm trực tiếp sang trang `index.html`** ngay trên trình duyệt của bạn mà không cần cấu hình gì thêm!
3. **Sửa lỗi chặn CORS trên Google Apps Script**: Đổi phương thức gửi sang `text/plain;charset=utf-8` kết hợp fallback `GET ?token=...`, giúp đẩy và tải Token qua Google Apps Script thành công 100% không bao giờ bị trình duyệt chặn CORS.

---

## ⚡ Cách 1: Tự Động Kết Nối Ngay Trên Máy Của Bạn (Không Cần Cấu Hình Cloud)

1. Mở tiện ích **Tampermonkey** trên trình duyệt của bạn.
2. Cập nhật (copy & dán đè) toàn bộ nội dung file [`ghn_revert_kho.user.js`](file:///d:/Revert/ghn_revert_kho.user.js) (v3.0) và bấm **Lưu (Ctrl+S)**.
3. Mở trang [https://tracuunoibo.ghn.vn/internal/revert](https://tracuunoibo.ghn.vn/internal/revert) (hoặc tải lại trang F5). Bạn sẽ thấy nút góc dưới bên phải chuyển sang màu xanh lá: **`⚡ Token Revert: Đã kết nối (...)`**.
4. Mở trang [`index.html`](file:///d:/Revert/index.html) -> Trang web sẽ **tự động nhận ngay Token mới nhất** từ Tampermonkey và báo **`Đã kết nối: Lê Thanh Tuấn`**!
   *(Lưu ý: Nếu mở file `file:///D:/Revert/index.html` trực tiếp từ ổ cứng, hãy bật "Allow access to file URLs / Cho phép truy cập vào các URL tệp" cho tiện ích Tampermonkey trong phần Quản lý tiện ích `chrome://extensions`).*

---

## ☁️ Cách 2: Đồng Bộ Lên Cloud Cho Nhân Viên / Người Khác Dùng Chung

Nếu bạn gửi trang web cho nhân viên ở máy tính khác sử dụng:

### Bước 1: Tạo Web App trên Google Apps Script (Miễn phí 100%)
1. Truy cập: [https://script.google.com](https://script.google.com) > Nhấn **"Dự án mới" (New Project)**.
2. Xóa mã mặc định và dán đoạn mã v2 (hỗ trợ cả GET và POST chống lỗi CORS) sau vào:

```javascript
function doGet(e) {
  var props = PropertiesService.getScriptProperties();
  if (e && e.parameter && e.parameter.token) {
    var newTok = String(e.parameter.token).trim();
    props.setProperty('GHN_TOKEN', newTok);
    props.setProperty('UPDATED_AT', new Date().toISOString());
    return ContentService.createTextOutput(JSON.stringify({ code: 200, message: 'Updated', token: newTok }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var token = props.getProperty('GHN_TOKEN') || '';
  var updatedAt = props.getProperty('UPDATED_AT') || '';
  return ContentService.createTextOutput(JSON.stringify({ code: 200, token: token, updated_at: updatedAt }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var data = JSON.parse(raw);
    var tok = data.token || (e && e.parameter && e.parameter.token) || '';
    if (tok) {
      props.setProperty('GHN_TOKEN', String(tok).trim());
      props.setProperty('UPDATED_AT', new Date().toISOString());
      return ContentService.createTextOutput(JSON.stringify({ code: 200, message: 'Updated' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ code: 400, message: 'Missing token' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ code: 500, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

3. Nhấn **Ctrl + S** để lưu.
4. Nhấn **Triển khai (Deploy)** > **Tùy chọn triển khai mới (New deployment)** > Chọn loại **Ứng dụng web (Web app)**:
   - **Thực thi dưới dạng (Execute as)**: `Tôi (Me)`
   - **Ai có quyền truy cập (Who has access)**: **`Bất kỳ ai (Anyone)`**
5. Nhấn **Triển khai** và copy đường link `https://script.google.com/macros/s/.../exec`.

### Bước 2: Dán Link vào Trang Web Revert
1. Mở trang [`index.html`](file:///d:/Revert/index.html) > Bấm nút **"Tự động đồng bộ"** trên thanh Token.
2. Dán đường link `https://script.google.com/macros/s/.../exec` vào ô URL.
3. Bạn có thể bấm nút **"Đẩy Token lên Cloud"** để đẩy ngay Token hiện tại lên, sau đó bấm **"Lưu Cấu Hình"**.
4. Bạn cũng có thể dán cố định link này vào biến `DEFAULT_SYNC_URL` ở dòng 44 trong file [`app.js`](file:///d:/Revert/app.js) để mọi nhân viên mở trang lên là tự động nhận Token!
