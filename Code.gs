/**
 * ============================================================================
 *  GHN REVERT HUB - MÁY CHỦ TRUNG GIAN & NHẬT KÝ ĐỔI KHO (Google Apps Script) v4.0
 * ============================================================================
 *  - Giữ Token GHN của Quản lý an toàn trên máy chủ (KHÔNG trả Token về máy nhân viên).
 *  - Nhân viên đăng nhập (tài khoản GHN / tên nhân viên) trước khi sử dụng.
 *  - Quản lý có nút BẬT / TẮT chia sẻ Token (ngay trên tracuunoibo hoặc web).
 *    Khi TẮT: toàn bộ nhân viên bị khóa không thể đổi kho.
 *  - Tự động GHI NHẬT KÝ ĐỔI KHO vào Google Sheet:
 *    https://docs.google.com/spreadsheets/d/1myvJs5M404MNhQeTxtzijlwEnNr7JIUT3itEVYrr6FM/edit?usp=sharing
 *    Cột: STT | Tài khoản | Họ tên | Mã đơn | Đổi kho từ kho nào đến kho nào | Thời gian | ...
 * ============================================================================
 */

const CONFIG = {
  // Google Sheet ghi log & quản lý tài khoản
  SPREADSHEET_ID: '1myvJs5M404MNhQeTxtzijlwEnNr7JIUT3itEVYrr6FM',

  // Khóa bí mật dùng cho Tampermonkey Quản lý (đẩy Token, Bật/Tắt Share)
  ADMIN_KEY: 'ghn_revert_secret_2026',

  // Tự động thêm tài khoản nhân viên mới vào tab "TaiKhoan" khi họ đăng nhập lần đầu
  AUTO_REGISTER_USERS: true,

  // (Tùy chọn) Google OAuth Client ID nếu muốn bật "Đăng nhập bằng Google". Để trống = tắt.
  GOOGLE_CLIENT_ID: '',

  // Thời gian giữ phiên đăng nhập (giây) - 6 giờ, tự gia hạn khi sử dụng
  SESSION_TTL: 21600,

  // Tra cứu kho cũ của từng đơn trước khi đổi để ghi log "Từ kho ... ➔ Đến kho ..."
  LOOKUP_OLD_WAREHOUSE: true,

  // Giới hạn số đơn mỗi lượt gửi
  MAX_ORDERS_PER_CALL: 100,

  TIMEZONE: 'Asia/Ho_Chi_Minh'
};

const GHN_BASE = 'https://fe-online-gateway.ghn.vn';
const API_USER_INFO = '/order-tracking/public-api/internal/user-info';
const API_UPDATE_ORDERS = '/order-tracking/public-api/internal/update-orders-warehouse';
const API_TRACKING_LOGS = '/order-tracking/public-api/internal/tracking-logs';
const API_WAREHOUSE_ALL = '/order-tracking/public-api/inside/warehouse-all';

const SHEET_USERS = 'TaiKhoan';
const SHEET_LOGS = 'NhatKyDoiKho';
const SHEET_ACCESS = 'NhatKyTruyCap';

const USER_HEADERS = ['Tài khoản', 'Mật khẩu (nhập mới)', 'Mật khẩu đã mã hóa', 'Họ tên', 'Email Google', 'Vai trò (admin/user)', 'Trạng thái (Hoạt động/Khóa)', 'Đăng nhập gần nhất', 'Ghi chú'];
const LOG_HEADERS = [
  'Số thứ tự',
  'Tài khoản',
  'Họ tên',
  'Mã đơn',
  'Đổi kho từ kho nào đến kho nào',
  'Thời gian',
  'Loại kho cập nhật',
  'Kho đích (mới)',
  'Kho ban đầu (cũ)',
  'Lý do đổi kho',
  'Kết quả',
  'Chi tiết / Mã Eform',
  'Mã phiên',
  'Thiết bị'
];
const ACCESS_HEADERS = ['Số thứ tự', 'Thời gian', 'Tài khoản', 'Họ tên', 'Hành động', 'Kết quả', 'Ghi chú', 'Thiết bị'];

const WAREHOUSE_TYPE_NAMES = { 1: 'Kho hiện tại', 2: 'Kho lấy', 3: 'Kho giao', 4: 'Kho trả' };
const WAREHOUSE_TYPE_KEYS = { 1: 'current_warehouse_id', 2: 'pick_warehouse_id', 3: 'deliver_warehouse_id', 4: 'return_warehouse_id' };

const PROXY_WHITELIST = {
  GET: [
    '/order-tracking/public-api/inside/warehouse-all',
    '/order-tracking/public-api/internal/warehouses-by-ward',
    '/order-tracking/public-api/master-data/provinces',
    '/order-tracking/public-api/master-data/districts',
    '/order-tracking/public-api/master-data/wards'
  ],
  POST: [
    '/order-tracking/public-api/v3/master-data/province/all',
    '/order-tracking/public-api/v3/master-data/ward/all-by-province-id'
  ]
};

// ============================================================================
// ENTRY POINTS
// ============================================================================
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const props = PropertiesService.getScriptProperties();

    // 1. Nhận Token nhanh qua GET (hỗ trợ Tampermonkey, fetch, bookmarklet, image ping)
    const rawToken = p.token || p.ghnToken || '';
    if (rawToken || p.action === 'adminPushToken') {
      const tok = String(rawToken || p.token || '').trim().replace(/^["']+|["']+$/g, '');
      if (tok.length >= 20) {
        const currentTok = props.getProperty('GHN_TOKEN') || '';
        const currentOwner = props.getProperty('TOKEN_OWNER') || 'Quản lý GHN';
        const share = props.getProperty('SHARE_ENABLED') !== 'false';

        // NẾU TOKEN TRÙNG KHỚP TOKEN HIỆN TẠI: TRẢ VỀ NGAY, TUYỆT ĐỐI KHÔNG GHI LOG SHEET ĐỂ TRÁNH SPAM!
        if (tok === currentTok) {
          return jsonOut_({
            ok: true,
            code: 200,
            message: 'Token đã được lưu trước đó (không đổi).',
            share: share,
            hasToken: true,
            tokenAlive: true,
            tokenOwner: currentOwner,
            tokenUpdatedAt: props.getProperty('TOKEN_UPDATED_AT') || ''
          });
        }

        // Token mới -> Lưu vào Properties
        props.setProperties({
          GHN_TOKEN: tok,
          TOKEN_UPDATED_AT: new Date().toISOString()
        });

        let owner = (p.owner && String(p.owner).trim()) || currentOwner;
        if (owner && owner !== currentOwner) {
          props.setProperty('TOKEN_OWNER', owner);
        }

        // Chỉ ghi nhật ký truy cập nếu Token mới và giới hạn tần suất (1 giờ chỉ ghi 1 lần)
        const cache = CacheService.getScriptCache();
        const cacheKey = 'LOGGED_TOKEN_' + tok.slice(0, 12);
        if (!cache.get(cacheKey)) {
          logAccess_('tampermonkey-get', owner, 'Cập nhật Token', 'Thành công', 'Token: ' + tok.slice(0, 8) + '...', p.device || 'Tampermonkey');
          cache.put(cacheKey, '1', 3600);
        }

        return jsonOut_({
          ok: true,
          code: 200,
          message: 'Đã cập nhật Token sống lên Cloud!',
          share: share,
          hasToken: true,
          tokenAlive: true,
          tokenOwner: owner,
          tokenUpdatedAt: props.getProperty('TOKEN_UPDATED_AT')
        });
      }
    }

    // 2. Bật / Tắt Chia Sẻ nhanh qua GET
    if (p.action === 'setShare' || p.action === 'adminSetShare') {
      const enabled = String(p.enabled).toLowerCase() === 'true' || String(p.enabled) === '1';
      props.setProperty('SHARE_ENABLED', enabled ? 'true' : 'false');
      logAccess_('tampermonkey-get', 'Quản lý', enabled ? 'BẬT chia sẻ Token' : 'TẮT chia sẻ Token', 'Thành công', '', p.device || 'Tampermonkey');
      return jsonOut_({
        ok: true,
        code: 200,
        share: enabled,
        message: enabled ? 'Đã BẬT chia sẻ Token' : 'Đã TẮT chia sẻ Token'
      });
    }

    // 3. Kiểm tra trạng thái nhanh qua GET
    if (p.action === 'status' || p.action === 'adminStatus') {
      const token = props.getProperty('GHN_TOKEN') || '';
      const share = props.getProperty('SHARE_ENABLED') !== 'false'; // mặc định true
      return jsonOut_({
        ok: true,
        code: 200,
        share: share,
        hasToken: !!token,
        tokenAlive: !!token,
        tokenOwner: props.getProperty('TOKEN_OWNER') || 'Quản lý GHN',
        tokenUpdatedAt: props.getProperty('TOKEN_UPDATED_AT') || ''
      });
    }

    return jsonOut_({ ok: true, service: 'GHN Revert Hub Gateway v4.0', time: nowStr_() });
  } catch (err) {
    return jsonOut_({ ok: false, code: 500, error: err.toString() });
  }
}

function doPost(e) {
  let p = {};
  try {
    p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    p = {};
  }
  if (e && e.parameter) {
    for (const k in e.parameter) {
      if (p[k] === undefined) p[k] = e.parameter[k];
    }
  }

  try {
    switch (p.action) {
      case 'login': return jsonOut_(actionLogin_(p));
      case 'loginGoogle': return jsonOut_(actionLoginGoogle_(p));
      case 'logout': return jsonOut_(actionLogout_(p));
      case 'status': return jsonOut_(actionStatus_(p));
      case 'proxy': return jsonOut_(actionProxy_(p));
      case 'updateOrders': return jsonOut_(actionUpdateOrders_(p));
      case 'recordOrderLogs': return jsonOut_(actionRecordOrderLogs_(p));
      case 'adminStatus': return jsonOut_(actionAdminStatus_(p));
      case 'adminPushToken': return jsonOut_(actionAdminPushToken_(p));
      case 'adminSetShare': return jsonOut_(actionAdminSetShare_(p));
      default: return jsonOut_({ ok: false, code: 400, message: 'Hành động không hợp lệ: ' + p.action });
    }
  } catch (err) {
    const code = (err && err.httpCode) || 500;
    return jsonOut_({ ok: false, code: code, message: (err && err.message) || String(err) });
  }
}

/** Chạy 1 lần trong trình soạn thảo Apps Script để cấp quyền & tạo sẵn cấu trúc Sheet */
function khoiTaoHeThong() {
  getSheet_(SHEET_USERS, USER_HEADERS);
  getSheet_(SHEET_LOGS, LOG_HEADERS);
  getSheet_(SHEET_ACCESS, ACCESS_HEADERS);
  getSalt_();
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SHARE_ENABLED')) props.setProperty('SHARE_ENABLED', 'true');
  UrlFetchApp.fetch(GHN_BASE + API_USER_INFO, { muteHttpExceptions: true });
  Logger.log('✓ Đã khởi tạo xong. Mọi tab Sheet đã sẵn sàng!');
}

// ============================================================================
// AUTH: LOGIN / LOGOUT / SESSION
// ============================================================================
function actionLogin_(p) {
  const username = String(p.username || '').trim();
  const password = String(p.password || '').trim();
  if (!username) throw httpErr_(400, 'Vui lòng nhập tài khoản hoặc họ tên của bạn');

  const cache = CacheService.getScriptCache();
  const failKey = 'FAIL_' + username.toLowerCase();
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= 8) throw httpErr_(429, 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 10 phút.');

  let user = findUser_(function (row) { return row.username.toLowerCase() === username.toLowerCase(); });

  // Nếu người dùng chưa có tài khoản trong Sheet và bật AUTO_REGISTER_USERS:
  if (!user && CONFIG.AUTO_REGISTER_USERS) {
    user = autoRegisterUser_(username, password);
  }

  if (!user) {
    cache.put(failKey, String(fails + 1), 600);
    logAccess_(username, '', 'Đăng nhập', 'Thất bại', 'Tài khoản không tồn tại', p.device);
    throw httpErr_(401, 'Tài khoản không tồn tại. Vui lòng liên hệ Quản lý.');
  }

  // Nếu tài khoản có mật khẩu đã lưu, bắt buộc kiểm tra
  if (user.passwordHash) {
    const ok = user.passwordHash === hashPw_(user.username, password);
    if (!ok) {
      cache.put(failKey, String(fails + 1), 600);
      logAccess_(username, user.name, 'Đăng nhập', 'Thất bại', 'Sai mật khẩu', p.device);
      throw httpErr_(401, 'Sai mật khẩu. Vui lòng thử lại.');
    }
  }

  if (!user.active) {
    logAccess_(user.username, user.name, 'Đăng nhập', 'Từ chối', 'Tài khoản đang bị khóa', p.device);
    throw httpErr_(403, 'Tài khoản của bạn đang bị khóa. Liên hệ Quản lý.');
  }

  cache.remove(failKey);
  return createSessionResponse_(user, 'Mật khẩu / Tên nhân viên', p.device);
}

function autoRegisterUser_(username, password) {
  const sheet = getSheet_(SHEET_USERS, USER_HEADERS);
  const pwHash = password ? hashPw_(username, password) : '';
  const role = username.toLowerCase() === 'admin' ? 'admin' : 'user';
  const name = username; // dùng chính tên nhập vào làm họ tên
  const now = nowStr_();
  const newRow = [username, '', pwHash, name, '', role, 'Hoạt động', now, 'Tự động tạo'];
  sheet.appendRow(newRow);

  return {
    rowIndex: sheet.getLastRow(),
    username: username,
    passwordHash: pwHash,
    name: name,
    email: '',
    role: role,
    active: true
  };
}

function actionLoginGoogle_(p) {
  if (!CONFIG.GOOGLE_CLIENT_ID) throw httpErr_(400, 'Chưa bật đăng nhập Google');
  const credential = String(p.credential || '');
  if (!credential) throw httpErr_(400, 'Thiếu thông tin đăng nhập Google');

  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw httpErr_(401, 'Phiên đăng nhập Google không hợp lệ');
  const info = JSON.parse(res.getContentText());
  if (info.aud !== CONFIG.GOOGLE_CLIENT_ID || String(info.email_verified) !== 'true') {
    throw httpErr_(401, 'Phiên đăng nhập Google không hợp lệ');
  }

  const email = String(info.email || '').toLowerCase();
  let user = findUser_(function (row) { return row.email && row.email.toLowerCase() === email; });

  if (!user && CONFIG.AUTO_REGISTER_USERS) {
    const sheet = getSheet_(SHEET_USERS, USER_HEADERS);
    const uname = email.split('@')[0];
    const role = 'user';
    const now = nowStr_();
    sheet.appendRow([uname, '', '', info.name || uname, email, role, 'Hoạt động', now, 'Google Login']);
    user = {
      rowIndex: sheet.getLastRow(),
      username: uname,
      name: info.name || uname,
      email: email,
      role: role,
      active: true
    };
  }

  if (!user) {
    logAccess_(email, info.name || '', 'Đăng nhập Google', 'Từ chối', 'Email chưa được cấp quyền', p.device);
    throw httpErr_(403, 'Email ' + email + ' chưa được cấp quyền sử dụng.');
  }

  if (!user.active) {
    logAccess_(user.username, user.name, 'Đăng nhập Google', 'Từ chối', 'Tài khoản đang bị khóa', p.device);
    throw httpErr_(403, 'Tài khoản của bạn đang bị khóa. Liên hệ Quản lý.');
  }

  return createSessionResponse_(user, 'Google (' + email + ')', p.device);
}

function createSessionResponse_(user, method, device) {
  const sid = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  const sess = { username: user.username, name: user.name || user.username, role: user.role, createdAt: Date.now() };
  CacheService.getScriptCache().put('S_' + sid, JSON.stringify(sess), CONFIG.SESSION_TTL);

  try {
    const sheet = getSheet_(SHEET_USERS, USER_HEADERS);
    sheet.getRange(user.rowIndex, 8).setValue(nowStr_());
  } catch (_) {}
  logAccess_(user.username, user.name, 'Đăng nhập', 'Thành công', method, device);

  const st = buildStatus_(sess);
  st.session = sid;
  return st;
}

function actionLogout_(p) {
  const sess = getSession_(p.session);
  if (sess) {
    CacheService.getScriptCache().remove('S_' + p.session);
    logAccess_(sess.username, sess.name, 'Đăng xuất', 'Thành công', '', p.device);
  }
  return { ok: true };
}

function getSession_(sid) {
  if (!sid || typeof sid !== 'string' || sid.length < 25) return null;
  const cache = CacheService.getScriptCache();
  const raw = cache.get('S_' + sid);
  if (!raw) return null;
  cache.put('S_' + sid, raw, CONFIG.SESSION_TTL); // gia hạn thời gian sống
  try { return JSON.parse(raw); } catch (_) { return null; }
}

function requireSession_(p) {
  const sess = getSession_(p.session);
  if (!sess) throw httpErr_(401, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  return sess;
}

function requireAdmin_(p) {
  if (p.adminKey) {
    if (String(p.adminKey) === CONFIG.ADMIN_KEY) {
      return { username: 'admin-key', name: 'Quản lý (Tampermonkey)', role: 'admin' };
    }
  }
  const sess = getSession_(p.session);
  if (sess && sess.role === 'admin') return sess;
  throw httpErr_(403, 'Bạn không có quyền quản trị.');
}

// ============================================================================
// STATUS & TOKEN USABILITY
// ============================================================================
function actionStatus_(p) {
  const sess = requireSession_(p);
  return buildStatus_(sess);
}

function buildStatus_(sess) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GHN_TOKEN') || '';
  const share = props.getProperty('SHARE_ENABLED') !== 'false'; // mặc định là true
  const ownerName = props.getProperty('TOKEN_OWNER') || 'Quản lý GHN';

  // Miễn có Token trên máy chủ và (chia sẻ đang bật hoặc người dùng là Admin) thì cho phép sử dụng
  const canUse = !!(token && (share || sess.role === 'admin'));
  let reason = '';
  if (!token) {
    reason = 'Quản lý chưa kết nối Token lên hệ thống - Hãy mở tracuunoibo.ghn.vn';
  } else if (!share && sess.role !== 'admin') {
    reason = 'Quản lý đang TẮT chia sẻ Token. Bạn tạm thời không thể đổi kho.';
  }

  return {
    ok: true,
    user: { username: sess.username, name: sess.name, role: sess.role },
    share: share,
    hasToken: !!token,
    tokenAlive: !!token,
    tokenOwner: ownerName,
    tokenUpdatedAt: props.getProperty('TOKEN_UPDATED_AT') || '',
    canUse: canUse,
    reason: reason,
    token: canUse ? token : '' // Cung cấp Token cho phiên đã xác thực để gọi API GHN trực tiếp từ trình duyệt
  };
}

function requireUsableToken_(sess) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GHN_TOKEN') || '';
  const share = props.getProperty('SHARE_ENABLED') !== 'false';
  if (!token) throw httpErr_(503, 'Quản lý chưa kết nối Token lên hệ thống.');
  if (!share && sess.role !== 'admin') {
    throw httpErr_(403, 'Quản lý hiện đang TẮT chia sẻ Token. Bạn tạm thời không thể gửi yêu cầu cập nhật kho.');
  }
  return token;
}

function checkGhnToken_(token, force) {
  const cache = CacheService.getScriptCache();
  const key = 'ALIVE_' + sha256Hex_(token).slice(0, 20);
  if (!force) {
    const c = cache.get(key);
    if (c) { try { return JSON.parse(c); } catch (_) {} }
  }
  let result;
  try {
    const res = UrlFetchApp.fetch(GHN_BASE + API_USER_INFO, {
      method: 'get',
      headers: {
        token: token,
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      muteHttpExceptions: true
    });
    let data = null;
    try { data = JSON.parse(res.getContentText()); } catch (_) {}
    const d = data && data.data;
    result = {
      alive: !!(res.getResponseCode() === 200 && data && data.code === 200 && d),
      name: d ? (d.full_name || d.name || '') : '',
      empId: d ? String(d.employee_id || d.user_id || d.id || '') : '',
      message: data ? (data.code_message_value || data.message || '') : ('HTTP ' + res.getResponseCode())
    };
  } catch (err) {
    result = { alive: false, name: '', empId: '', message: 'Không kết nối được GHN: ' + err.message };
  }
  cache.put(key, JSON.stringify(result), result.alive ? 180 : 30);
  return result;
}

// ============================================================================
// PROXY (TRA CỨU DANH MỤC QUA SERVER)
// ============================================================================
function actionProxy_(p) {
  const sess = requireSession_(p);
  const token = requireUsableToken_(sess);

  const method = String(p.method || 'GET').toUpperCase();
  const path = String(p.path || '');
  const allowed = PROXY_WHITELIST[method] || [];
  if (allowed.indexOf(path) === -1) throw httpErr_(403, 'API không được phép qua proxy: ' + method + ' ' + path);

  let url = GHN_BASE + path;
  if (p.query && typeof p.query === 'object') {
    const qs = Object.keys(p.query).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(String(p.query[k]));
    }).join('&');
    if (qs) url += '?' + qs;
  }

  const opts = {
    method: method.toLowerCase(),
    headers: {
      token: token,
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    muteHttpExceptions: true
  };
  if (method === 'POST') {
    opts.contentType = 'application/json';
    opts.payload = JSON.stringify(p.body || {});
  }

  const res = UrlFetchApp.fetch(url, opts);
  let data;
  try { data = JSON.parse(res.getContentText()); }
  catch (_) { data = { code: res.getResponseCode(), message: res.getContentText().slice(0, 300) }; }
  return { ok: true, status: res.getResponseCode(), data: data };
}

// ============================================================================
// CẬP NHẬT KHO + GHI NHẬT KÝ GOOGLE SHEET
// ============================================================================
function actionUpdateOrders_(p) {
  const sess = requireSession_(p);
  const token = requireUsableToken_(sess);

  const codes = (Array.isArray(p.order_codes) ? p.order_codes : [])
    .map(function (c) { return String(c || '').trim().toUpperCase(); })
    .filter(function (c) { return /^[A-Z0-9_\-]{4,40}$/.test(c); });
  if (codes.length === 0) throw httpErr_(400, 'Không có mã đơn hợp lệ');
  if (codes.length > CONFIG.MAX_ORDERS_PER_CALL) throw httpErr_(400, 'Tối đa ' + CONFIG.MAX_ORDERS_PER_CALL + ' đơn mỗi lượt');

  const type = Number(p.type);
  if (!WAREHOUSE_TYPE_NAMES[type]) throw httpErr_(400, 'Loại kho không hợp lệ');
  const whIdRaw = String(p.warehouse_id || '').trim();
  if (!/^\d{1,12}$/.test(whIdRaw)) throw httpErr_(400, 'Mã kho không hợp lệ');
  const warehouseId = Number(whIdRaw);
  const reason = String(p.reason || '').slice(0, 500);
  if (!reason) throw httpErr_(400, 'Thiếu lý do đổi kho');

  const whNames = getWarehouseNameMap_(token);
  const newWhName = whNames[String(warehouseId)] || String(p.warehouse_name || '').slice(0, 150);
  const newWhLabel = warehouseId + (newWhName ? ' - ' + newWhName : '');

  // 1. Tra cứu kho cũ của các đơn trước khi đổi
  let oldMap = {};
  if (CONFIG.LOOKUP_OLD_WAREHOUSE) {
    try { oldMap = lookupOldWarehouses_(token, codes, WAREHOUSE_TYPE_KEYS[type]); } catch (_) { oldMap = {}; }
  }

  // 2. Gửi lệnh cập nhật kho lên GHN
  const res = UrlFetchApp.fetch(GHN_BASE + API_UPDATE_ORDERS, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      token: token,
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    payload: JSON.stringify({ order_codes: codes, warehouse_id: warehouseId, type: type, reason: reason }),
    muteHttpExceptions: true
  });
  let data;
  try { data = JSON.parse(res.getContentText()); }
  catch (_) { data = { code: res.getResponseCode(), message: 'GHN trả về dữ liệu không hợp lệ' }; }

  // 3. Phân loại kết quả
  const resultMap = {};
  if (data && data.code === 200 && data.data) {
    const d = data.data;
    (d.success_order_codes || []).forEach(function (c) { resultMap[c] = { status: 'Thành công', detail: 'Cập nhật kho hoàn tất' }; });
    (d.wait_for_approve_order_codes || []).forEach(function (c) {
      resultMap[c] = { status: 'Chờ duyệt Eform', detail: d.eform_code ? ('Mã Eform: ' + d.eform_code) : 'Đã gửi Eform chờ duyệt' };
    });
    (d.fail_order_codes || []).forEach(function (f) {
      resultMap[f.order_code] = { status: 'Thất bại', detail: f.err_msg || 'Cập nhật kho thất bại' };
    });
  } else {
    const msg = (data && (data.code_message_value || data.message)) || ('HTTP ' + res.getResponseCode());
    codes.forEach(function (c) { resultMap[c] = { status: 'Thất bại', detail: msg }; });
  }

  // 4. GHI LOG VÀO GOOGLE SHEET (NhatKyDoiKho)
  // Cột: STT | Tài khoản | Họ tên | Mã đơn | Đổi kho từ kho nào đến kho nào | Thời gian | ...
  const batchId = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyMMddHHmmss') + '-' + Utilities.getUuid().slice(0, 4).toUpperCase();
  const timeStr = nowStr_();
  const device = String(p.device || '').slice(0, 120);

  const rows = codes.map(function (c) {
    const r = resultMap[c] || { status: 'Không rõ', detail: 'GHN không trả kết quả' };
    const oldId = oldMap[c];
    const oldLabel = oldId ? (oldId + (whNames[String(oldId)] ? ' - ' + whNames[String(oldId)] : '')) : 'Không xác định';
    const changeFromTo = (oldLabel !== 'Không xác định' ? oldLabel : 'Chưa rõ kho cũ') + ' ➔ ' + newWhLabel;

    return [
      sess.username,
      sess.name,
      c,
      changeFromTo,
      timeStr,
      WAREHOUSE_TYPE_NAMES[type],
      newWhLabel,
      oldLabel,
      reason,
      r.status,
      r.detail,
      batchId,
      device
    ];
  });

  appendRowsWithStt_(SHEET_LOGS, LOG_HEADERS, rows);

  const oldLabels = {};
  Object.keys(oldMap).forEach(function (c) {
    const id = oldMap[c];
    oldLabels[c] = id + (whNames[String(id)] ? ' - ' + whNames[String(id)] : '');
  });

  return { ok: true, data: data, old_warehouses: oldLabels, batch_id: batchId };
}

// GHI NHẬT KÝ ĐỔI KHO TỪ KẾT QUẢ CLIENT GỌI TRỰC TIẾP GHN (Tránh bị GHN chặn 404)
function actionRecordOrderLogs_(p) {
  const sess = requireSession_(p);

  const codes = (Array.isArray(p.order_codes) ? p.order_codes : [])
    .map(function (c) { return String(c || '').trim().toUpperCase(); })
    .filter(function (c) { return /^[A-Z0-9_\-]{4,40}$/.test(c); });
  if (codes.length === 0) throw httpErr_(400, 'Không có mã đơn hợp lệ');

  const type = Number(p.type);
  const whIdRaw = String(p.warehouse_id || '').trim();
  const warehouseId = Number(whIdRaw);
  const reason = String(p.reason || '').slice(0, 500);
  const newWhName = String(p.warehouse_name || '').slice(0, 150);
  const newWhLabel = warehouseId + (newWhName ? ' - ' + newWhName : '');

  const batchId = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyMMddHHmmss') + '-' + Utilities.getUuid().slice(0, 4).toUpperCase();
  const timeStr = nowStr_();
  const device = String(p.device || '').slice(0, 120);

  const ghnData = (p.ghn_data && p.ghn_data.data) ? p.ghn_data.data : (p.ghn_data || {});
  const oldMap = p.old_warehouses || {};

  // 1. Phân loại kết quả trả về từ GHN
  const resultMap = {};
  (ghnData.success_order_codes || []).forEach(function (c) {
    resultMap[c] = { status: 'Thành công', detail: 'Cập nhật kho hoàn tất' };
  });
  (ghnData.wait_for_approve_order_codes || []).forEach(function (c) {
    resultMap[c] = { status: 'Chờ duyệt Eform', detail: ghnData.eform_code ? ('Mã Eform: ' + ghnData.eform_code) : 'Đã gửi Eform chờ duyệt' };
  });
  (ghnData.fail_order_codes || []).forEach(function (f) {
    resultMap[f.order_code] = { status: 'Thất bại', detail: f.err_msg || 'Cập nhật kho thất bại' };
  });

  // Nếu có mã đơn chưa có trong danh sách phân loại (ví dụ GHN báo lỗi chung)
  codes.forEach(function (c) {
    if (!resultMap[c]) {
      const codeVal = p.ghn_data && p.ghn_data.code;
      const msgVal = (p.ghn_data && (p.ghn_data.code_message_value || p.ghn_data.message)) || ('Mã lỗi GHN: ' + codeVal);
      resultMap[c] = {
        status: (codeVal === 200) ? 'Thành công' : 'Thất bại',
        detail: (codeVal === 200) ? 'Hoàn tất' : msgVal
      };
    }
  });

  const rows = codes.map(function (c) {
    const r = resultMap[c] || { status: 'Không rõ', detail: 'Chưa có kết quả' };
    const oldLabel = oldMap[c] || 'Chưa rõ kho cũ';
    const changeFromTo = (oldLabel !== 'Không xác định' && oldLabel !== 'Chưa rõ kho cũ' ? oldLabel : 'Chưa rõ kho cũ') + ' ➔ ' + newWhLabel;

    return [
      sess.username,
      sess.name,
      c,
      changeFromTo,
      timeStr,
      WAREHOUSE_TYPE_NAMES[type] || 'Kho giao',
      newWhLabel,
      oldLabel,
      reason,
      r.status,
      r.detail,
      batchId,
      device
    ];
  });

  appendRowsWithStt_(SHEET_LOGS, LOG_HEADERS, rows);
  return { ok: true, count: rows.length, batch_id: batchId };
}

function lookupOldWarehouses_(token, codes, typeKey) {
  const out = {};
  const CHUNK = 20;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const part = codes.slice(i, i + CHUNK);
    const reqs = part.map(function (c) {
      return {
        url: GHN_BASE + API_TRACKING_LOGS,
        method: 'post',
        contentType: 'application/json',
        headers: {
      token: token,
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
        payload: JSON.stringify({ order_code: c, source: 'inside_system' }),
        muteHttpExceptions: true
      };
    });
    const responses = UrlFetchApp.fetchAll(reqs);
    responses.forEach(function (res, idx) {
      try {
        const json = JSON.parse(res.getContentText());
        if (json && json.code === 200) {
          const v = findKeyBfs_(json.data, typeKey);
          if (v) out[part[idx]] = v;
        }
      } catch (_) {}
    });
  }
  return out;
}

function findKeyBfs_(root, key) {
  const queue = [root];
  let steps = 0;
  while (queue.length && steps < 5000) {
    const node = queue.shift();
    steps++;
    if (!node || typeof node !== 'object') continue;
    if (!Array.isArray(node) && Object.prototype.hasOwnProperty.call(node, key)) {
      const v = node[key];
      if (v !== null && v !== '' && v !== 0 && v !== undefined) return v;
    }
    for (const k in node) {
      if (node[k] && typeof node[k] === 'object') queue.push(node[k]);
    }
  }
  return null;
}

function getWarehouseNameMap_(token) {
  const cache = CacheService.getScriptCache();
  const count = Number(cache.get('WHN_COUNT') || 0);
  if (count > 0) {
    const keys = [];
    for (let i = 0; i < count; i++) keys.push('WHN_' + i);
    const got = cache.getAll(keys);
    if (Object.keys(got).length === count) {
      const map = {};
      keys.forEach(function (k) { Object.assign(map, JSON.parse(got[k])); });
      return map;
    }
  }

  const map = {};
  try {
    let offset = 0;
    for (let page = 0; page < 5; page++) {
      const res = UrlFetchApp.fetch(GHN_BASE + API_WAREHOUSE_ALL + '?offset=' + offset + '&limit=1000', {
        headers: {
      token: token,
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
        muteHttpExceptions: true
      });
      const json = JSON.parse(res.getContentText());
      const list = (json && json.data && json.data.warehouses) || [];
      list.forEach(function (w) { map[String(w.locationId)] = w.locationName; });
      if (list.length < 1000) break;
      offset += 1000;
    }
  } catch (_) {}

  const ids = Object.keys(map);
  if (ids.length > 0) {
    const chunks = {};
    let n = 0;
    for (let i = 0; i < ids.length; i += 400) {
      const part = {};
      ids.slice(i, i + 400).forEach(function (id) { part[id] = map[id]; });
      chunks['WHN_' + n] = JSON.stringify(part);
      n++;
    }
    chunks['WHN_COUNT'] = String(n);
    cache.putAll(chunks, 21600);
  }
  return map;
}

// ============================================================================
// ADMIN: BẬT / TẮT CHIA SẺ & CẬP NHẬT TOKEN
// ============================================================================
function actionAdminStatus_(p) {
  requireAdmin_(p);
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GHN_TOKEN') || '';
  let owner = props.getProperty('TOKEN_OWNER') || '';
  if (token && !owner) {
    try {
      const info = checkGhnToken_(token, !!p.force);
      if (info && info.name) {
        owner = info.name;
        props.setProperty('TOKEN_OWNER', owner);
      }
    } catch (_) {}
  }
  return {
    ok: true,
    share: props.getProperty('SHARE_ENABLED') !== 'false',
    hasToken: !!token,
    tokenAlive: !!token,
    tokenOwner: owner || 'Quản lý GHN',
    tokenUpdatedAt: props.getProperty('TOKEN_UPDATED_AT') || '',
    message: token ? 'Token đang hoạt động trên hệ thống' : 'Chưa có Token'
  };
}

function actionAdminPushToken_(p) {
  const admin = requireAdmin_(p);
  const token = String(p.token || '').trim().replace(/^["']+|["']+$/g, '');
  if (token.length < 20 || token.length > 2000) throw httpErr_(400, 'Token không hợp lệ');

  const props = PropertiesService.getScriptProperties();
  const current = props.getProperty('GHN_TOKEN') || '';

  let ownerName = (p.owner && String(p.owner).trim()) || props.getProperty('TOKEN_OWNER') || 'Quản lý GHN';

  props.setProperties({
    GHN_TOKEN: token,
    TOKEN_UPDATED_AT: new Date().toISOString(),
    TOKEN_OWNER: ownerName
  });

  if (token !== current) {
    logAccess_(admin.username, admin.name, 'Cập nhật Token', 'Thành công', 'Chủ Token: ' + ownerName, p.device);
  }
  return actionAdminStatus_({ adminKey: p.adminKey, session: p.session });
}

function actionAdminSetShare_(p) {
  const admin = requireAdmin_(p);
  const enabled = p.enabled === true || String(p.enabled).toLowerCase() === 'true' || String(p.enabled) === '1';
  PropertiesService.getScriptProperties().setProperty('SHARE_ENABLED', enabled ? 'true' : 'false');
  logAccess_(admin.username, admin.name, enabled ? 'BẬT chia sẻ Token' : 'TẮT chia sẻ Token', 'Thành công', '', p.device);
  return actionAdminStatus_({ adminKey: p.adminKey, session: p.session });
}

// ============================================================================
// SHEET HELPERS
// ============================================================================
function getSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function getSheet_(name, headers) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#fa6400').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#fa6400').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendRowsWithStt_(sheetName, headers, rows) {
  if (!rows.length) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getSheet_(sheetName, headers);
    const last = sheet.getLastRow();
    // Prepend Số thứ tự (1, 2, 3...)
    const values = rows.map(function (r, i) { return [last + i].concat(r); });
    sheet.getRange(last + 1, 1, values.length, headers.length).setValues(values);
  } finally {
    lock.releaseLock();
  }
}

function logAccess_(username, name, action, result, note, device) {
  try {
    appendRowsWithStt_(SHEET_ACCESS, ACCESS_HEADERS, [[nowStr_(), username || '', name || '', action, result, note || '', String(device || '').slice(0, 120)]]);
  } catch (_) {}
}

function findUser_(predicate) {
  const sheet = getSheet_(SHEET_USERS, USER_HEADERS);
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const values = sheet.getRange(2, 1, last - 1, USER_HEADERS.length).getValues();

  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    const row = {
      rowIndex: i + 2,
      username: String(r[0] || '').trim(),
      plain: String(r[1] || ''),
      passwordHash: String(r[2] || '').trim(),
      name: String(r[3] || '').trim(),
      email: String(r[4] || '').trim(),
      role: String(r[5] || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user',
      active: String(r[6] || '').trim().toLowerCase().indexOf('khóa') === -1 && String(r[6] || '').trim().toLowerCase().indexOf('khoa') === -1
    };
    if (!row.username) continue;

    // Tự động mã hóa mật khẩu mới nhập vào Sheet
    if (row.plain) {
      row.passwordHash = hashPw_(row.username, row.plain);
      sheet.getRange(row.rowIndex, 2, 1, 2).setValues([['', row.passwordHash]]);
      row.plain = '';
    }
    if (predicate(row)) return row;
  }
  return null;
}

// ============================================================================
// UTILS
// ============================================================================
function getSalt_() {
  const props = PropertiesService.getScriptProperties();
  let salt = props.getProperty('PW_SALT');
  if (!salt) {
    salt = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('PW_SALT', salt);
  }
  return salt;
}

function hashPw_(username, password) {
  return sha256Hex_(getSalt_() + '|' + String(username).toLowerCase() + '|' + password);
}

function sha256Hex_(str) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function nowStr_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
}

function httpErr_(code, message) {
  const e = new Error(message);
  e.httpCode = code;
  return e;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
