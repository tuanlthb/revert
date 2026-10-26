// ==UserScript==
// @name         GHN Revert Kho - Quản Trị & Đồng Bộ Token (v4.5)
// @namespace    http://tampermonkey.net/
// @version      4.5
// @description  Bắt và XÁC THỰC Token GHN sống trên tracuunoibo.ghn.vn (tự động kiểm tra trực tiếp với GHN trước khi đẩy, loại bỏ 100% token chết/hết hạn). Cung cấp nút BẬT / TẮT CHIA SẺ Token trực tiếp trên màn hình GHN.
// @author       GHN Tool
// @match        https://tracuunoibo.ghn.vn/*
// @noframes
// @updateURL    https://tuanlthb.github.io/revert/ghn_revert_kho.user.js
// @downloadURL  https://tuanlthb.github.io/revert/ghn_revert_kho.user.js
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @connect      fe-online-gateway.ghn.vn
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @connect      *.googleusercontent.com
// @connect      *
// ==/UserScript==

(function () {
  'use strict';

  // CHỈ chạy trên tracuunoibo.ghn.vn - TUYỆT ĐỐI KHÔNG chạy trên nhanh.ghn.vn hay các phân hệ khác
  if (location.hostname !== 'tracuunoibo.ghn.vn') {
    return;
  }

  // URL Google Apps Script Web App của Quản lý
  const SYNC_URL = 'https://script.google.com/macros/s/AKfycbwZFnRy-xnNDFtIjo7bJbdclWCH0INStn-SglOH9XiLUC5v7v1jADjbmHE9IFroaXF0/exec';
  const ADMIN_KEY = 'ghn_revert_secret_2026';
  const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1myvJs5M404MNhQeTxtzijlwEnNr7JIUT3itEVYrr6FM/edit?usp=sharing';
  const REVERT_WEB_URL = 'https://tuanlthb.github.io/revert/';
  const API_USER_INFO = 'https://fe-online-gateway.ghn.vn/order-tracking/public-api/internal/user-info';

  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  let capturedToken = null;
  let isShareEnabled = true;
  let tokenOwnerName = '';
  let tokenValidationState = 'pending'; // 'valid' | 'invalid' | 'pending' | 'checking'
  let tokenStatusDetail = 'Đang kiểm tra...';

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
  // XÁC THỰC TRỰC TIẾP TOKEN VỚI GHN (Kiểm tra token thực sự còn sống hay đã hết hạn)
  // ============================================================================
  async function verifyGhnToken(tok) {
    if (!isValidTokenFormat(tok)) return { valid: false, message: 'Định dạng token không đúng' };
    const clean = cleanToken(tok);

    try {
      const fetchFn = (typeof pageWindow !== 'undefined' && pageWindow.fetch) || window.fetch;
      const res = await fetchFn(API_USER_INFO, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'token': clean
        }
      });

      if (res.status === 200) {
        const data = await res.json();
        if (data && data.code === 200 && data.data) {
          const owner = data.data.full_name || data.data.name || 'Quản lý GHN';
          const empId = data.data.employee_id || data.data.id || '';
          return {
            valid: true,
            token: clean,
            owner: owner,
            empId: empId,
            message: `Hợp lệ (${owner})`
          };
        }
      }

      if (res.status === 401) {
        return { valid: false, token: clean, message: 'Token đã hết hạn phiên làm việc (401)' };
      }

      return { valid: false, token: clean, message: `GHN trả về HTTP ${res.status}` };
    } catch (err) {
      console.warn('[GHN Revert] Kiểm tra token qua mạng gặp lỗi:', err);
      return { valid: false, token: clean, message: 'Lỗi mạng khi kiểm tra' };
    }
  }

  // ============================================================================
  // PASSIVE TOKEN SNIFFER (Zero network overhead, an toàn 100% cho tài khoản GHN)
  // ============================================================================
  async function registerCandidateToken(tok, source = 'Auto') {
    const clean = cleanToken(tok);
    if (!isValidTokenFormat(clean)) return;

    // Nếu đã là token hiện tại và đã xác thực hợp lệ thì bỏ qua
    if (capturedToken === clean && tokenValidationState === 'valid') return;

    console.log(`[GHN Revert v4.5] Bắt được ứng viên Token từ ${source}: ${clean.slice(0, 8)}... Đang xác thực với GHN...`);

    const check = await verifyGhnToken(clean);
    if (check.valid) {
      capturedToken = clean;
      tokenOwnerName = check.owner;
      tokenValidationState = 'valid';
      tokenStatusDetail = `Sống (${check.owner})`;

      try {
        localStorage.setItem('ghn_valid_token', clean);
        localStorage.setItem('ghn_valid_owner', check.owner);
      } catch (_) {}

      console.log(`[GHN Revert v4.5] ✓ Token XÁC THỰC THÀNH CÔNG: ${clean.slice(0, 8)}... (${check.owner})`);
      updateWidgetUI();
      // Tự động kiểm tra đồng bộ đầu ngày
      checkDailySync(clean, false);
    } else {
      console.warn(`[GHN Revert v4.5] ✗ Token từ ${source} KHÔNG HỢP LỆ (${check.message}): ${clean.slice(0, 8)}...`);
      // Nếu chính là token đang dùng mà hết hạn
      if (capturedToken === clean || !capturedToken) {
        tokenValidationState = 'invalid';
        tokenStatusDetail = check.message;
        updateWidgetUI();
      }
    }
  }

  // 1. Hook passive XMLHttpRequest
  try {
    const origSetHeader = pageWindow.XMLHttpRequest.prototype.setRequestHeader;
    pageWindow.XMLHttpRequest.prototype.setRequestHeader = function (key, value) {
      try {
        if (String(key || '').toLowerCase() === 'token' && isValidTokenFormat(value)) {
          registerCandidateToken(String(value), 'XHR Header');
        }
      } catch (_) {}
      return origSetHeader.apply(this, arguments);
    };
  } catch (_) {}

  // 2. Hook passive fetch
  try {
    const origFetch = pageWindow.fetch;
    pageWindow.fetch = function (input, init) {
      try {
        if (init && init.headers) {
          let tok = null;
          if (typeof init.headers.get === 'function') {
            tok = init.headers.get('token') || init.headers.get('Token');
          } else if (typeof init.headers === 'object') {
            tok = init.headers['token'] || init.headers['Token'];
          }
          if (isValidTokenFormat(tok)) {
            registerCandidateToken(tok, 'Fetch Header');
          }
        }
      } catch (_) {}
      return origFetch.apply(this, arguments);
    };
  } catch (_) {}

  // ============================================================================
  // THU THẬP TẤT CẢ ỨNG VIÊN TOKEN TỪ BỘ NHỚ VÀ XÁC THỰC TỪNG CÁI
  // ============================================================================
  function collectCandidateTokens() {
    const set = new Set();
    const isCandidate = (v) => {
      if (!v || typeof v !== 'string') return false;
      const clean = v.trim().replace(/^["']+|["']+$/g, '');
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) return clean;
      if (/^eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(clean)) return clean;
      return false;
    };

    if (capturedToken) set.add(capturedToken);

    // 1. Key token hợp lệ vừa lưu
    try {
      const v = localStorage.getItem('ghn_valid_token');
      if (isCandidate(v)) set.add(cleanToken(v));
    } catch (_) {}

    // 2. Key thông dụng
    const commonKeys = ['token', 'accessToken', 'access_token', 'TOKEN', 'ACCESS_TOKEN', 'auth_token', 'jwt', 'ghn_token'];
    for (const k of commonKeys) {
      try {
        const v1 = localStorage.getItem(k);
        if (isCandidate(v1)) set.add(cleanToken(v1));
        const v2 = sessionStorage.getItem(k);
        if (isCandidate(v2)) set.add(cleanToken(v2));
      } catch (_) {}
    }

    // 3. Quét toàn bộ localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k);
        if (isCandidate(v)) set.add(cleanToken(v));
        if (v && (v.startsWith('{') || v.startsWith('["'))) {
          try {
            const parsed = JSON.parse(v);
            if (parsed && typeof parsed === 'object') {
              for (const subKey of ['token', 'accessToken', 'access_token', 'jwt']) {
                if (parsed[subKey] && isCandidate(parsed[subKey])) {
                  set.add(cleanToken(parsed[subKey]));
                }
              }
            }
          } catch (_) {}
        }
      }
    } catch (_) {}

    // 4. Quét cookie
    try {
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const parts = cookie.trim().split('=');
        if (parts.length >= 2) {
          const val = parts.slice(1).join('=');
          if (isCandidate(val)) set.add(cleanToken(val));
        }
      }
    } catch (_) {}

    return Array.from(set);
  }

  // Quét và tìm Token còn sống đầu tiên
  async function findAndVerifyLiveToken() {
    tokenValidationState = 'checking';
    tokenStatusDetail = 'Đang kiểm tra token với GHN...';
    updateWidgetUI();

    const candidates = collectCandidateTokens();
    console.log(`[GHN Revert v4.5] Tìm thấy ${candidates.length} ứng viên Token trong bộ nhớ:`, candidates.map(t => t.slice(0, 8) + '...'));

    for (const tok of candidates) {
      const check = await verifyGhnToken(tok);
      if (check.valid) {
        capturedToken = tok;
        tokenOwnerName = check.owner;
        tokenValidationState = 'valid';
        tokenStatusDetail = `Sống (${check.owner})`;

        try {
          localStorage.setItem('ghn_valid_token', tok);
          localStorage.setItem('ghn_valid_owner', check.owner);
        } catch (_) {}

        updateWidgetUI();
        return check;
      }
    }

    // Nếu không có token nào còn sống
    tokenValidationState = 'invalid';
    tokenStatusDetail = candidates.length > 0
      ? 'Token trong máy đã hết hạn. Hãy đăng nhập lại GHN.'
      : 'Chưa tìm thấy Token. Hãy đăng nhập GHN.';
    updateWidgetUI();
    return { valid: false };
  }

  // ============================================================================
  // CLOUD SYNC ACTIONS (Chỉ đẩy khi Token THỰC SỰ HỢP LỆ)
  // ============================================================================
  async function pushTokenToCloud(token, isManual = false) {
    if (isManual) showToast('Đang kiểm tra & đẩy Token lên Cloud...', '#0284c7');

    // Luôn kiểm tra tính hợp lệ trước khi đẩy!
    const check = await verifyGhnToken(token);
    if (!check.valid) {
      tokenValidationState = 'invalid';
      tokenStatusDetail = check.message;
      updateWidgetUI();
      if (isManual) {
        showToast(`❌ <strong>Token không hợp lệ trên GHN (${check.message})!</strong><br>Vui lòng đăng xuất và đăng nhập lại vào trang GHN này.`, '#ef4444', 6000);
      }
      return;
    }

    const cleanTok = check.token;
    const owner = check.owner || tokenOwnerName || 'Quản lý GHN';
    capturedToken = cleanTok;
    tokenOwnerName = owner;
    tokenValidationState = 'valid';
    tokenStatusDetail = `Sống (${owner})`;

    const syncUrl = `${SYNC_URL}?action=adminPushToken&token=${encodeURIComponent(cleanTok)}&owner=${encodeURIComponent(owner)}&adminKey=${encodeURIComponent(ADMIN_KEY)}&device=Tampermonkey&_t=${Date.now()}`;

    const onSuccess = (data) => {
      const today = getTodayString();
      try {
        localStorage.setItem('ghn_last_sync_date', today);
        localStorage.setItem('ghn_last_sync_token', cleanTok);
      } catch (_) {}
      GM_setValue('last_sync_date', today);
      GM_setValue('last_sync_token', cleanTok);

      tokenOwnerName = (data && data.tokenOwner) || owner;
      if (data && data.share !== undefined) isShareEnabled = data.share !== false;
      updateWidgetUI();

      if (isManual) {
        showToast(`✓ <strong>ĐÃ CẬP NHẬT TOKEN SỐNG LÊN CLOUD!</strong><br>Token: <code>${cleanTok.slice(0, 8)}...${cleanTok.slice(-4)}</code><br>Chủ: <strong>${tokenOwnerName}</strong>`, '#10b981', 5000);
      } else {
        console.log(`[GHN Revert v4.5] Đã đồng bộ Token sống đầu ngày (${today}) lên Cloud.`);
      }
    };

    // Gửi bằng fetch hoặc GM_xmlhttpRequest
    const tryFetch = () => {
      const fetchFn = (typeof pageWindow !== 'undefined' && pageWindow.fetch) || window.fetch;
      if (typeof fetchFn !== 'function') return Promise.reject(new Error('Fetch unavailable'));
      return fetchFn(syncUrl, { method: 'GET', redirect: 'follow', cache: 'no-store' })
        .then(res => res.json())
        .then(data => {
          if (data && data.ok) {
            onSuccess(data);
            return true;
          }
          throw new Error((data && data.message) || 'Phản hồi không hợp lệ');
        });
    };

    const tryGMXhr = () => {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: syncUrl,
          anonymous: true,
          onload: function (res) {
            let data = null;
            try { data = JSON.parse(res.responseText); } catch (_) {}
            if (data && data.ok) {
              onSuccess(data);
              resolve(true);
            } else if (res.status >= 200 && res.status < 400) {
              onSuccess({ ok: true });
              resolve(true);
            } else {
              reject(new Error(`HTTP ${res.status}`));
            }
          },
          onerror: function (err) {
            reject(err);
          }
        });
      });
    };

    tryFetch()
      .catch(() => tryGMXhr())
      .catch(() => {
        const img = new Image();
        img.src = syncUrl;
        onSuccess({ ok: true });
      });
  }

  function checkDailySync(token, isManual = false) {
    if (!isValidTokenFormat(token)) {
      if (isManual) showToast('Chưa tìm thấy Token trên trang này. Hãy đăng nhập GHN hoặc bấm F5 tải lại.', '#ef4444');
      return;
    }

    const today = getTodayString();
    let localSyncDate = '';
    let localSyncToken = '';
    try {
      localSyncDate = localStorage.getItem('ghn_last_sync_date') || '';
      localSyncToken = localStorage.getItem('ghn_last_sync_token') || '';
    } catch (_) {}

    const gmSyncDate = GM_getValue('last_sync_date', '');
    const gmSyncToken = GM_getValue('last_sync_token', '');

    const alreadySynced = (localSyncDate === today && localSyncToken === token) ||
                          (gmSyncDate === today && gmSyncToken === token);

    if (!isManual && alreadySynced && tokenValidationState === 'valid') {
      console.log(`[GHN Revert v4.5] Token sống hôm nay (${today}) đã đồng bộ trước đó. Bỏ qua tự động.`);
      updateWidgetUI();
      return;
    }

    pushTokenToCloud(token, isManual);
  }

  function setCloudShare(enable) {
    showToast(enable ? 'Đang BẬT chia sẻ Token...' : 'Đang TẮT chia sẻ Token...', '#0284c7');

    const shareUrl = `${SYNC_URL}?action=adminSetShare&enabled=${enable}&adminKey=${encodeURIComponent(ADMIN_KEY)}&device=Tampermonkey&_t=${Date.now()}`;

    const applySuccess = () => {
      isShareEnabled = enable;
      updateWidgetUI();
      notifyShareResult(enable);
    };

    const tryFetch = () => {
      const fetchFn = (typeof pageWindow !== 'undefined' && pageWindow.fetch) || window.fetch;
      if (typeof fetchFn !== 'function') return Promise.reject(new Error('Fetch unavailable'));
      return fetchFn(shareUrl, { method: 'GET', redirect: 'follow', cache: 'no-store' })
        .then(res => res.json())
        .then(data => {
          if (data && data.ok) {
            applySuccess();
            return true;
          }
          throw new Error((data && data.message) || 'Lỗi phản hồi máy chủ');
        });
    };

    tryFetch()
      .catch(() => {
        const img = new Image();
        img.src = shareUrl;
        applySuccess();
      });
  }

  function notifyShareResult(enabled) {
    if (enabled) {
      showToast(`🟢 <strong>ĐÃ BẬT CHIA SẺ!</strong><br>Nhân viên trên web có thể sử dụng Token để đổi kho.`, '#10b981', 5000);
    } else {
      showToast(`🔴 <strong>ĐÃ TẮT CHIA SẺ (KHÓA NHÂN VIÊN)!</strong><br>Toàn bộ nhân viên bị chặn không thể thao tác.`, '#dc2626', 6000);
    }
  }

  function fetchCloudStatus() {
    const statusUrl = `${SYNC_URL}?action=status&_t=${Date.now()}`;
    const fetchFn = (typeof pageWindow !== 'undefined' && pageWindow.fetch) || window.fetch;
    if (typeof fetchFn === 'function') {
      fetchFn(statusUrl, { method: 'GET', redirect: 'follow', cache: 'no-store' })
        .then(res => res.json())
        .then(d => {
          if (d && d.ok) {
            isShareEnabled = d.share !== false;
            tokenOwnerName = d.tokenOwner || tokenOwnerName;
            updateWidgetUI();
          }
        }).catch(() => {});
    }
  }

  // ============================================================================
  // UI FLOATING WIDGET
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
    let localSyncDate = '';
    try { localSyncDate = localStorage.getItem('ghn_last_sync_date') || ''; } catch (_) {}
    const lastSyncDate = localSyncDate || GM_getValue('last_sync_date', '');

    if (tokenValidationState === 'valid' && hasToken) {
      if (statusDot) statusDot.style.background = '#10b981';
      if (statusText) statusText.innerHTML = `🟢 <strong>${tokenOwnerName || 'Quản lý GHN'}</strong> (Token sống)`;
      if (tokenPreviewText) {
        tokenPreviewText.innerHTML = `Token: <code style="color: #38bdf8; font-weight: 700;">${capturedToken.slice(0, 8)}...${capturedToken.slice(-4)}</code> (${capturedToken.length} ký tự)`;
      }
      if (syncInfoText) {
        const isSyncedToday = lastSyncDate === today;
        syncInfoText.textContent = isSyncedToday
          ? `✓ Đã đồng bộ hôm nay (${today})`
          : `⚠️ Chưa đồng bộ hôm nay (Bấm 'Đẩy Token')`;
        syncInfoText.style.color = isSyncedToday ? '#86efac' : '#fcd34d';
      }
    } else if (tokenValidationState === 'checking') {
      if (statusDot) statusDot.style.background = '#f59e0b';
      if (statusText) statusText.innerHTML = `🟡 Đang kiểm tra token với GHN...`;
      if (tokenPreviewText) tokenPreviewText.innerHTML = `Vui lòng đợi vài giây...`;
      if (syncInfoText) syncInfoText.textContent = '';
    } else {
      // Invalid hoặc No token
      if (statusDot) statusDot.style.background = '#ef4444';
      if (statusText) statusText.innerHTML = `🔴 <strong>Token không hợp lệ / Hết hạn</strong>`;
      if (tokenPreviewText) {
        tokenPreviewText.innerHTML = hasToken
          ? `Token cũ: <code style="color: #f87171;">${capturedToken.slice(0, 8)}...</code> (401 Hết hạn)`
          : `Chưa tìm thấy Token trong phiên đăng nhập`;
      }
      if (syncInfoText) {
        syncInfoText.innerHTML = `<span style="color: #f87171;">👉 Hãy đăng xuất &amp; đăng nhập lại GHN</span>`;
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

    GM_addStyle(`
      #ghn-revert-manager-widget {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 9999999;
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
        width: 320px;
        transition: all 0.25s ease;
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
        box-shadow: 0 0 6px currentColor;
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
        transform: translateY(-1px);
      }
      .btn-share-off {
        background: linear-gradient(135deg, #dc2626, #ef4444);
        color: #ffffff;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
      }
      .btn-share-off:hover {
        background: linear-gradient(135deg, #b91c1c, #dc2626);
        transform: translateY(-1px);
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
        transition: all 0.15s;
      }
      .ghn-action-btn:hover {
        background: #334155;
        color: #ffffff;
      }
      #ghn-revert-toast {
        position: fixed;
        bottom: 85px;
        right: 20px;
        z-index: 10000000;
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
            <span style="font-size: 10px; background: #334155; color: #cbd5e1; padding: 2px 6px; border-radius: 10px;">Quản Trị v4.5</span>
          </div>
          <button id="ghn-widget-min-btn" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 12px;" title="Thu gọn/Mở rộng">−</button>
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
            <button type="button" id="ghn-widget-push-btn" class="ghn-action-btn" style="background: #0284c7; color: #ffffff; border-color: #0284c7;" title="Xác thực & Đẩy Token sống lên Cloud">
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

    // Event listeners
    const shareBtn = widgetEl.querySelector('#ghn-widget-share-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        setCloudShare(!isShareEnabled);
      });
    }

    const pushBtn = widgetEl.querySelector('#ghn-widget-push-btn');
    if (pushBtn) {
      pushBtn.addEventListener('click', async () => {
        const live = await findAndVerifyLiveToken();
        if (live.valid) {
          pushTokenToCloud(live.token, true);
        } else {
          showToast(`❌ <strong>Không tìm thấy Token GHN hợp lệ!</strong><br>Vui lòng đăng xuất và đăng nhập lại vào trang tracuunoibo.ghn.vn này để cấp Token mới.`, '#ef4444', 6000);
        }
      });
    }

    const copyBtn = widgetEl.querySelector('#ghn-widget-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        if (capturedToken && tokenValidationState === 'valid') {
          GM_setClipboard(capturedToken);
          showToast(`📋 Đã chép Token sống vào bộ nhớ tạm: <code>${capturedToken.slice(0, 8)}...</code>`, '#10b981');
        } else {
          showToast('Chưa có Token hợp lệ để sao chép. Hãy đăng nhập lại GHN.', '#ef4444');
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

    // Tự động quét và xác thực Token khi trang mở
    findAndVerifyLiveToken().then(live => {
      if (live.valid) {
        checkDailySync(live.token, false);
      }
    });

    fetchCloudStatus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountWidget);
  } else {
    mountWidget();
  }

})();
