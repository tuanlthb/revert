// ==UserScript==
// @name         GHN Revert Kho - Quản Trị & Đồng Bộ Token (v4.8)
// @namespace    http://tampermonkey.net/
// @version      4.8
// @description  Đọc Token GHN an toàn 100% trên tracuunoibo.ghn.vn (KHÔNG can thiệp mạng/fetch của trang, không gây đơ trang). Hỗ trợ đẩy Token đầu ngày và nút BẬT / TẮT CHIA SẺ Token với cơ chế đa tầng chống lỗi HTTP 404.
// @author       GHN Tool
// @match        https://tracuunoibo.ghn.vn/*
// @noframes
// @updateURL    https://tuanlthb.github.io/revert/ghn_revert_kho.user.js
// @downloadURL  https://tuanlthb.github.io/revert/ghn_revert_kho.user.js
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      fe-online-gateway.ghn.vn
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @connect      *.googleusercontent.com
// @connect      *
// ==/UserScript==

(function () {
  'use strict';

  // 1. CHỈ chạy trên tracuunoibo.ghn.vn
  if (location.hostname !== 'tracuunoibo.ghn.vn') {
    return;
  }

  // 2. Dọn dẹp triệt để các khóa rác của phiên bản cũ trong localStorage để trang GHN luôn sạch sẽ
  const LEGACY_KEYS = [
    'ghn_active_token',
    'ghn_valid_token',
    'ghn_valid_owner',
    'ghn_extracted_token',
    'ghn_revert_token',
    'ghn_bridged_token',
    'ghn_last_pushed_cloud_token'
  ];
  for (const k of LEGACY_KEYS) {
    try { localStorage.removeItem(k); } catch (_) {}
  }

  // 3. Không chạy khi đang ở luồng đăng nhập SSO (/login, /authorize) để tránh cản trở chuyển hướng
  if (location.pathname.startsWith('/login') || location.pathname.startsWith('/authorize')) {
    return;
  }

  // Cấu hình máy chủ Google Apps Script của Quản lý
  const SYNC_URL = 'https://script.google.com/macros/s/AKfycbwZFnRy-xnNDFtIjo7bJbdclWCH0INStn-SglOH9XiLUC5v7v1jADjbmHE9IFroaXF0/exec';
  const ADMIN_KEY = 'ghn_revert_secret_2026';
  const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1myvJs5M404MNhQeTxtzijlwEnNr7JIUT3itEVYrr6FM/edit?usp=sharing';
  const REVERT_WEB_URL = 'https://tuanlthb.github.io/revert/';
  const API_USER_INFO = 'https://fe-online-gateway.ghn.vn/order-tracking/public-api/internal/user-info';

  let capturedToken = '';
  let isShareEnabled = GM_getValue('share_enabled', true) !== false;
  let shareLockUntil = 0; // Khóa chống ghi đè trạng thái Share khi người dùng vừa bấm nút
  let isTogglingShare = false;
  let tokenOwnerName = GM_getValue('token_owner', '') || '';
  let tokenValidationState = 'pending'; // 'valid' | 'invalid' | 'pending' | 'checking'

  function cleanToken(tok) {
    if (!tok || typeof tok !== 'string') return '';
    return tok.trim().replace(/^["']+|["']+$/g, '');
  }

  function isValidTokenFormat(tok) {
    const c = cleanToken(tok);
    return c.length >= 20 && c !== 'null' && c !== 'undefined';
  }

  function getTodayString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  // ============================================================================
  // ĐỌC TOKEN CHÍNH THỨC CỦA TRACUUNOIBO.GHN.VN (Không quét bừa bãi, không hook)
  // ============================================================================
  function readOfficialGhnToken() {
    try {
      let t = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
      if (!t && document.cookie) {
        const m = document.cookie.match(/(?:^|;\s*)(?:token|accessToken|access_token)=([^;]+)/i);
        if (m) t = decodeURIComponent(m[1]);
      }
      const clean = cleanToken(t);
      if (isValidTokenFormat(clean)) return clean;
    } catch (_) {}
    return '';
  }

  function readOfficialGhnUser() {
    try {
      const raw = localStorage.getItem('user') || sessionStorage.getItem('user') || '';
      if (raw && raw.startsWith('{')) {
        const u = JSON.parse(raw);
        if (u && (u.full_name || u.name)) {
          return u.full_name || u.name;
        }
      }
    } catch (_) {}
    return '';
  }

  // ============================================================================
  // GỌI MÁY CHỦ GOOGLE APPS SCRIPT ĐA TẦNG (CHỐNG 100% LỖI HTTP 404 DO TÀI KHOẢN GOOGLE)
  // ============================================================================
  function callCloudGateway(action, params = {}, payload = null) {
    return new Promise((resolve) => {
      const queryParts = [
        `action=${encodeURIComponent(action)}`,
        `adminKey=${encodeURIComponent(ADMIN_KEY)}`,
        `device=Tampermonkey`,
        `_t=${Date.now()}`
      ];
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          queryParts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
        }
      }
      const fullGetUrl = `${SYNC_URL}?${queryParts.join('&')}`;

      // Tầng 1: GM_xmlhttpRequest POST với anonymous: true (Không mang cookie Google -> Chống lỗi 404)
      const tryPost = () => {
        return new Promise((resPost, rejPost) => {
          const bodyData = Object.assign({
            action: action,
            adminKey: ADMIN_KEY,
            device: 'Tampermonkey'
          }, params, payload || {});

          GM_xmlhttpRequest({
            method: 'POST',
            url: SYNC_URL,
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            data: JSON.stringify(bodyData),
            anonymous: true,
            nocache: true,
            timeout: 10000,
            onload: function (res) {
              let data = null;
              try { data = JSON.parse(res.responseText); } catch (_) {}
              if (data && (data.ok || res.status === 200)) {
                resPost(data || { ok: true });
              } else if (res.status >= 200 && res.status < 400) {
                resPost({ ok: true });
              } else {
                rejPost(new Error(data?.message || `HTTP ${res.status}`));
              }
            },
            onerror: rejPost,
            ontimeout: rejPost
          });
        });
      };

      // Tầng 2: GM_xmlhttpRequest GET với anonymous: true
      const tryGet = () => {
        return new Promise((resGet, rejGet) => {
          GM_xmlhttpRequest({
            method: 'GET',
            url: fullGetUrl,
            anonymous: true,
            nocache: true,
            timeout: 10000,
            onload: function (res) {
              let data = null;
              try { data = JSON.parse(res.responseText); } catch (_) {}
              if (data && (data.ok || res.status === 200)) {
                resGet(data || { ok: true });
              } else if (res.status >= 200 && res.status < 400) {
                resGet({ ok: true });
              } else {
                rejGet(new Error(data?.message || `HTTP ${res.status}`));
              }
            },
            onerror: rejGet,
            ontimeout: rejGet
          });
        });
      };

      // Tầng 3: Native fetch với credentials: omit (Không gửi cookie)
      const tryFetch = () => {
        return new Promise((resF, rejF) => {
          if (typeof fetch !== 'function') return rejF(new Error('Fetch unavailable'));
          fetch(fullGetUrl, {
            method: 'GET',
            mode: 'no-cors',
            credentials: 'omit',
            cache: 'no-store'
          }).then(() => {
            resF({ ok: true, fallback: true });
          }).catch(rejF);
        });
      };

      // Tầng 4: Image Ping (Luôn luôn kích hoạt được GET đến Google Apps Script)
      const tryImagePing = () => {
        try {
          const img = new Image();
          img.src = fullGetUrl;
        } catch (_) {}
        return Promise.resolve({ ok: true, fallback: true });
      };

      // Chạy thử tuần tự từ Tầng 1 đến Tầng 4
      tryPost()
        .catch(() => tryGet())
        .catch(() => tryFetch())
        .catch(() => tryImagePing())
        .then(result => resolve(result || { ok: true }));
    });
  }

  // ============================================================================
  // XÁC THỰC TOKEN VỚI GHN
  // ============================================================================
  async function verifyGhnToken(tok) {
    const clean = cleanToken(tok);
    if (!isValidTokenFormat(clean)) {
      return { valid: false, message: 'Chưa có Token trong phiên đăng nhập' };
    }

    // Ưu tiên 1: fetch() trực tiếp từ trang tracuunoibo (chuẩn CORS của trang, không phụ thuộc quyền GM)
    try {
      const res = await fetch(API_USER_INFO, {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'token': clean }
      });
      if (res.status === 200) {
        const data = await res.json();
        if (data && data.code === 200 && data.data) {
          const d = data.data;
          const owner = d.full_name || d.name || readOfficialGhnUser() || 'Quản lý GHN';
          return { valid: true, token: clean, owner: owner, message: `Hợp lệ (${owner})` };
        }
      } else if (res.status === 401) {
        return { valid: false, token: clean, message: 'Token đã hết hạn phiên (401)' };
      }
    } catch (_) {}

    // Ưu tiên 2: GM_xmlhttpRequest nếu fetch bị chặn
    try {
      return await new Promise((resolve) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: API_USER_INFO,
          headers: { 'Accept': 'application/json', 'token': clean },
          timeout: 8000,
          onload: function (res) {
            let data = null;
            try { data = JSON.parse(res.responseText); } catch (_) {}
            if (res.status === 200 && data && data.code === 200 && data.data) {
              const d = data.data;
              const owner = d.full_name || d.name || readOfficialGhnUser() || 'Quản lý GHN';
              resolve({ valid: true, token: clean, owner: owner, message: `Hợp lệ (${owner})` });
            } else if (res.status === 401 || (data && data.code === 401)) {
              resolve({ valid: false, token: clean, message: 'Token đã hết hạn phiên (401)' });
            } else {
              resolve({ valid: false, token: clean, message: `HTTP ${res.status}` });
            }
          },
          onerror: function () {
            resolve({ valid: false, token: clean, message: 'Lỗi kết nối máy chủ GHN' });
          },
          ontimeout: function () {
            resolve({ valid: false, token: clean, message: 'Hết thời gian chờ (Timeout)' });
          }
        });
      });
    } catch (_) {
      return { valid: false, token: clean, message: 'Lỗi xác thực' };
    }
  }

  async function inspectAndVerifyCurrentToken() {
    if (location.pathname.startsWith('/login') || location.pathname.startsWith('/authorize')) {
      return { valid: false };
    }

    const tok = readOfficialGhnToken();
    if (!tok) {
      capturedToken = '';
      tokenValidationState = 'invalid';
      updateWidgetUI();
      return { valid: false };
    }

    tokenValidationState = 'checking';
    updateWidgetUI();

    const check = await verifyGhnToken(tok);
    if (check.valid) {
      capturedToken = check.token;
      tokenOwnerName = check.owner;
      tokenValidationState = 'valid';
      GM_setValue('token_owner', check.owner);
      updateWidgetUI();
      return check;
    } else {
      capturedToken = tok;
      tokenValidationState = 'invalid';
      updateWidgetUI();
      return { valid: false, message: check.message };
    }
  }

  // ============================================================================
  // ĐỒNG BỘ TOKEN & BẬT/TẮT CHIA SẺ TRÊN CLOUD
  // ============================================================================
  async function pushTokenToCloud(token, isManual = false) {
    if (isManual) showToast('Đang xác thực & đẩy Token lên Cloud...', '#0284c7');

    const check = await verifyGhnToken(token);
    if (!check.valid) {
      tokenValidationState = 'invalid';
      updateWidgetUI();
      if (isManual) {
        showToast(`❌ <strong>Token không hợp lệ hoặc đã hết hạn (${check.message})!</strong><br>Hãy đăng xuất và đăng nhập lại trên trang GHN này.`, '#ef4444', 6000);
      }
      return;
    }

    const cleanTok = check.token;
    const owner = check.owner || tokenOwnerName || readOfficialGhnUser() || 'Quản lý GHN';
    capturedToken = cleanTok;
    tokenOwnerName = owner;
    tokenValidationState = 'valid';

    try {
      const res = await callCloudGateway('adminPushToken', { token: cleanTok, owner: owner });
      if (res && res.ok) {
        const today = getTodayString();
        GM_setValue('last_sync_date', today);
        GM_setValue('last_sync_token', cleanTok);

        if (res.tokenOwner) {
          tokenOwnerName = res.tokenOwner;
          GM_setValue('token_owner', tokenOwnerName);
        }
        if (typeof res.share === 'boolean' && Date.now() > shareLockUntil && !isTogglingShare) {
          isShareEnabled = res.share;
          GM_setValue('share_enabled', isShareEnabled);
        }
        updateWidgetUI();

        if (isManual) {
          showToast(`✓ <strong>ĐÃ CẬP NHẬT TOKEN SỐNG LÊN CLOUD!</strong><br>Chủ Token: <strong>${tokenOwnerName}</strong><br>Mã: <code>${cleanTok.slice(0, 8)}...${cleanTok.slice(-4)}</code>`, '#10b981', 5000);
        }
      } else {
        throw new Error((res && res.message) || 'Lỗi gửi yêu cầu');
      }
    } catch (err) {
      if (isManual) {
        showToast(`⚠️ Không thể đẩy Token lên Cloud: ${err.message}`, '#ef4444', 5000);
      }
    }
  }

  function checkDailySync(token, isManual = false) {
    if (!isValidTokenFormat(token)) return;

    const today = getTodayString();
    const gmSyncDate = GM_getValue('last_sync_date', '');
    const gmSyncToken = GM_getValue('last_sync_token', '');

    if (!isManual && gmSyncDate === today && gmSyncToken === token) {
      updateWidgetUI();
      return;
    }

    pushTokenToCloud(token, isManual);
  }

  async function setCloudShare(enable) {
    if (isTogglingShare) return;
    isTogglingShare = true;
    shareLockUntil = Date.now() + 15000;

    isShareEnabled = enable;
    GM_setValue('share_enabled', enable);
    updateWidgetUI();

    showToast(enable ? 'Đang BẬT chia sẻ Token...' : 'Đang TẮT chia sẻ Token...', '#0284c7', 2500);

    try {
      const res = await callCloudGateway('adminSetShare', { enabled: enable ? 'true' : 'false' });
      isTogglingShare = false;

      if (res && res.ok) {
        const confirmed = res.share !== undefined ? (res.share === true) : enable;
        isShareEnabled = confirmed;
        GM_setValue('share_enabled', confirmed);
        shareLockUntil = Date.now() + 15000;
        updateWidgetUI();
        notifyShareResult(confirmed);
      } else {
        throw new Error((res && res.message) || 'Lỗi máy chủ');
      }
    } catch (err) {
      isTogglingShare = false;
      showToast(`⚠️ Không thể kết nối máy chủ để đổi trạng thái chia sẻ: ${err.message}`, '#ef4444', 5000);
    }
  }

  function notifyShareResult(enabled) {
    if (enabled) {
      showToast(`🟢 <strong>ĐÃ BẬT CHIA SẺ!</strong><br>Nhân viên trên web có thể sử dụng Token để đổi kho.`, '#10b981', 5000);
    } else {
      showToast(`🔴 <strong>ĐÃ TẮT CHIA SẺ (KHÓA NHÂN VIÊN)!</strong><br>Toàn bộ nhân viên đã bị khóa thao tác đổi kho.`, '#dc2626', 6000);
    }
  }

  async function fetchCloudStatus() {
    if (isTogglingShare || Date.now() < shareLockUntil) return;
    try {
      const res = await callCloudGateway('status');
      if (res && res.ok) {
        if (!isTogglingShare && Date.now() > shareLockUntil && typeof res.share === 'boolean') {
          isShareEnabled = res.share;
          GM_setValue('share_enabled', res.share);
        }
        if (res.tokenOwner && !tokenOwnerName) {
          tokenOwnerName = res.tokenOwner;
        }
        updateWidgetUI();
      }
    } catch (_) {}
  }

  // ============================================================================
  // GIAO DIỆN WIDGET QUẢN TRỊ GỌN NHẸ
  // ============================================================================
  let widgetEl = null;
  let toastEl = null;

  function showToast(html, color = '#10b981', duration = 4000) {
    if (!toastEl) return;
    toastEl.style.borderLeftColor = color;
    toastEl.innerHTML = html;
    toastEl.style.display = 'block';
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => {
      toastEl.style.display = 'none';
    }, duration);
  }

  function updateWidgetUI() {
    if (!widgetEl) return;
    const hasToken = isValidTokenFormat(capturedToken);

    const statusDot = widgetEl.querySelector('#ghn-widget-status-dot');
    const statusText = widgetEl.querySelector('#ghn-widget-status-text');
    const tokenPreviewText = widgetEl.querySelector('#ghn-widget-token-preview');
    const syncInfoText = widgetEl.querySelector('#ghn-widget-sync-info');
    const shareBtn = widgetEl.querySelector('#ghn-widget-share-btn');
    const shareDesc = widgetEl.querySelector('#ghn-widget-share-desc');

    const today = getTodayString();
    const lastSyncDate = GM_getValue('last_sync_date', '');
    const lastSyncToken = GM_getValue('last_sync_token', '');

    if (tokenValidationState === 'valid' && hasToken) {
      if (statusDot) statusDot.style.background = '#10b981';
      if (statusText) statusText.innerHTML = `🟢 <strong>${tokenOwnerName || 'Quản lý GHN'}</strong> (Token sống)`;
      if (tokenPreviewText) {
        tokenPreviewText.innerHTML = `Token: <code style="color: #38bdf8; font-weight: 700;">${capturedToken.slice(0, 8)}...${capturedToken.slice(-4)}</code>`;
      }
      if (syncInfoText) {
        const isSyncedToday = lastSyncDate === today && lastSyncToken === capturedToken;
        syncInfoText.textContent = isSyncedToday
          ? `✓ Đã đồng bộ hôm nay (${today})`
          : `⚠️ Chưa đẩy mã mới này (Bấm 'Đẩy Token')`;
        syncInfoText.style.color = isSyncedToday ? '#86efac' : '#fcd34d';
      }
    } else if (tokenValidationState === 'checking') {
      if (statusDot) statusDot.style.background = '#f59e0b';
      if (statusText) statusText.innerHTML = `🟡 Đang kiểm tra Token...`;
      if (tokenPreviewText) tokenPreviewText.innerHTML = `Vui lòng đợi giây lát...`;
      if (syncInfoText) syncInfoText.textContent = '';
    } else {
      if (statusDot) statusDot.style.background = '#ef4444';
      if (statusText) statusText.innerHTML = `🔴 <strong>Chưa có Token hợp lệ</strong>`;
      if (tokenPreviewText) {
        tokenPreviewText.innerHTML = hasToken
          ? `Token cũ hết hạn: <code style="color: #f87171;">${capturedToken.slice(0, 8)}...</code>`
          : `Chưa đăng nhập trên tracuunoibo.ghn.vn`;
      }
      if (syncInfoText) {
        syncInfoText.innerHTML = `<span style="color: #fca5a5;">👉 Sau khi đăng nhập xong, bấm '⚡ Đẩy Token'</span>`;
      }
    }

    if (shareBtn) {
      if (isShareEnabled) {
        shareBtn.className = 'ghn-share-btn btn-share-on';
        shareBtn.innerHTML = `<span class="share-icon">🟢</span> <span>CHIA SẺ: ĐANG BẬT</span>`;
        if (shareDesc) shareDesc.textContent = '✓ Nhân viên được phép sử dụng (Bấm để Tắt)';
      } else {
        shareBtn.className = 'ghn-share-btn btn-share-off';
        shareBtn.innerHTML = `<span class="share-icon">🔴</span> <span>CHIA SẺ: ĐANG TẮT</span>`;
        if (shareDesc) shareDesc.textContent = '🔒 Đã khóa toàn bộ nhân viên (Bấm để Bật)';
      }
    }
  }

  function mountWidget() {
    if (!document.body || document.getElementById('ghn-revert-manager-widget')) return;
    if (location.pathname.startsWith('/login') || location.pathname.startsWith('/authorize')) return;

    GM_addStyle(`
      #ghn-revert-manager-widget {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        user-select: none;
      }
      .ghn-widget-card {
        background: #0f172a;
        color: #f8fafc;
        border-radius: 14px;
        padding: 14px 16px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
        border: 1px solid #334155;
        width: 310px;
      }
      .ghn-widget-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid #1e293b;
      }
      .ghn-widget-title {
        font-weight: 700;
        font-size: 13.5px;
        color: #fa6400;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .ghn-widget-status-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 12px;
        margin-bottom: 12px;
        background: #1e293b;
        padding: 8px 10px;
        border-radius: 6px;
      }
      .ghn-status-line {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .ghn-status-dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: #ef4444;
        display: inline-block;
      }
      .ghn-share-btn {
        width: 100%;
        border: none;
        border-radius: 8px;
        padding: 10px 12px;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: all 0.2s ease;
      }
      .btn-share-on {
        background: linear-gradient(135deg, #059669, #10b981);
        color: #ffffff;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
      }
      .btn-share-on:hover {
        background: linear-gradient(135deg, #047857, #059669);
      }
      .btn-share-off {
        background: linear-gradient(135deg, #dc2626, #ef4444);
        color: #ffffff;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
      }
      .btn-share-off:hover {
        background: linear-gradient(135deg, #b91c1c, #dc2626);
      }
      .ghn-share-desc {
        font-size: 11px;
        color: #94a3b8;
        text-align: center;
        margin-top: 5px;
        margin-bottom: 10px;
      }
      .ghn-widget-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }
      .ghn-action-btn {
        background: #1e293b;
        color: #cbd5e1;
        border: 1px solid #334155;
        border-radius: 6px;
        padding: 6px 8px;
        font-size: 11px;
        cursor: pointer;
        text-align: center;
        text-decoration: none;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
      }
      .ghn-action-btn:hover {
        background: #334155;
        color: #ffffff;
      }
      #ghn-revert-toast {
        position: fixed;
        bottom: 85px;
        right: 20px;
        z-index: 1000000;
        background: #020617;
        color: #f1f5f9;
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 12.5px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.4);
        border-left: 4px solid #10b981;
        display: none;
        max-width: 320px;
        line-height: 1.45;
      }
    `);

    toastEl = document.createElement('div');
    toastEl.id = 'ghn-revert-toast';
    document.body.appendChild(toastEl);

    widgetEl = document.createElement('div');
    widgetEl.id = 'ghn-revert-manager-widget';
    widgetEl.innerHTML = `
      <div class="ghn-widget-card">
        <div class="ghn-widget-header">
          <div class="ghn-widget-title">
            <span>⚡ GHN Revert</span>
            <span style="font-size: 10px; background: #334155; color: #cbd5e1; padding: 2px 6px; border-radius: 10px;">Quản Trị v4.7</span>
          </div>
          <button id="ghn-widget-min-btn" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 14px; font-weight: bold;" title="Thu gọn/Mở rộng">−</button>
        </div>

        <div id="ghn-widget-body">
          <div class="ghn-widget-status-row">
            <div class="ghn-status-line">
              <span id="ghn-widget-status-dot" class="ghn-status-dot"></span>
              <span id="ghn-widget-status-text">Đang kiểm tra...</span>
            </div>
            <div id="ghn-widget-token-preview" style="font-size: 11px; margin-left: 17px; color: #cbd5e1;"></div>
            <div id="ghn-widget-sync-info" style="font-size: 11px; margin-left: 17px; color: #94a3b8;"></div>
          </div>

          <button type="button" id="ghn-widget-share-btn" class="ghn-share-btn btn-share-on">
            <span class="share-icon">🟢</span> <span>CHIA SẺ: ĐANG BẬT</span>
          </button>
          <div id="ghn-widget-share-desc" class="ghn-share-desc">✓ Nhân viên được phép sử dụng (Bấm để Tắt)</div>

          <div class="ghn-widget-actions">
            <button type="button" id="ghn-widget-push-btn" class="ghn-action-btn" style="background: #0284c7; color: #ffffff; border-color: #0284c7;" title="Kiểm tra & Đẩy Token sống lên Cloud">
              <span>⚡ Đẩy Token</span>
            </button>
            <button type="button" id="ghn-widget-copy-btn" class="ghn-action-btn" title="Sao chép Token vào bộ nhớ tạm">
              <span>📋 Copy Token</span>
            </button>
            <a href="${REVERT_WEB_URL}" target="_blank" class="ghn-action-btn" title="Mở trang web Revert Hub">
              <span>🌐 Revert Hub</span>
            </a>
            <a href="${SHEET_URL}" target="_blank" class="ghn-action-btn" title="Mở Google Sheet xem nhật ký đổi kho">
              <span>📊 Sheet Nhật Ký</span>
            </a>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(widgetEl);

    updateWidgetUI();

    const shareBtn = widgetEl.querySelector('#ghn-widget-share-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        setCloudShare(!isShareEnabled);
      });
    }

    const pushBtn = widgetEl.querySelector('#ghn-widget-push-btn');
    if (pushBtn) {
      pushBtn.addEventListener('click', async () => {
        const live = await inspectAndVerifyCurrentToken();
        if (live.valid) {
          pushTokenToCloud(live.token, true);
        } else {
          showToast(`❌ <strong>Chưa có Token hợp lệ!</strong><br>Hãy đảm bảo bạn đã đăng nhập vào trang tracuunoibo.ghn.vn này rồi bấm lại.`, '#ef4444', 5000);
        }
      });
    }

    const copyBtn = widgetEl.querySelector('#ghn-widget-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const tok = readOfficialGhnToken() || capturedToken;
        if (isValidTokenFormat(tok)) {
          GM_setClipboard(tok);
          showToast(`📋 Đã copy Token vào bộ nhớ tạm: <code>${tok.slice(0, 8)}...</code>`, '#10b981');
        } else {
          showToast('Chưa tìm thấy Token để sao chép.', '#ef4444');
        }
      });
    }

    const minBtn = widgetEl.querySelector('#ghn-widget-min-btn');
    const bodyEl = widgetEl.querySelector('#ghn-widget-body');
    if (minBtn && bodyEl) {
      minBtn.addEventListener('click', () => {
        const isCollapsed = bodyEl.style.display === 'none';
        bodyEl.style.display = isCollapsed ? 'block' : 'none';
        minBtn.textContent = isCollapsed ? '−' : '+';
      });
    }

    setTimeout(async () => {
      await fetchCloudStatus();
      const live = await inspectAndVerifyCurrentToken();
      if (live.valid) {
        checkDailySync(live.token, false);
      }
    }, 1200);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(mountWidget, 500);
  } else {
    window.addEventListener('DOMContentLoaded', () => setTimeout(mountWidget, 500));
  }

})();
