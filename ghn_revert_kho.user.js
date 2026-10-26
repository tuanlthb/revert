// ==UserScript==
// @name         GHN Revert Kho - Quản Trị & Đồng Bộ Token (v4.3)
// @namespace    http://tampermonkey.net/
// @version      4.3
// @description  Bắt Token GHN trên tracuunoibo.ghn.vn (Đồng bộ 1 lần duy nhất đầu ngày hoặc khi bấm nút, không chạy ngầm liên tục). Cung cấp NÚT BẬT / TẮT CHIA SẺ Token trực tiếp trên màn hình GHN.
// @author       GHN Tool
// @match        https://tracuunoibo.ghn.vn/*
// @updateURL    https://tuanlthb.github.io/revert/ghn_revert_kho.user.js
// @downloadURL  https://tuanlthb.github.io/revert/ghn_revert_kho.user.js
// @run-at       document-end
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

  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  let capturedToken = null;
  let isShareEnabled = true;
  let tokenOwnerName = '';

  function cleanToken(tok) {
    if (!tok || typeof tok !== 'string') return '';
    return tok.trim().replace(/^["']+|["']+$/g, '');
  }

  function isValidToken(tok) {
    const c = cleanToken(tok);
    return c.length >= 20 && c !== 'null' && c !== 'undefined';
  }

  function getTodayString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  // Lấy Token từ bộ nhớ phiên đăng nhập của GHN (không can thiệp Fetch/XHR để bảo đảm an toàn cho tài khoản)
  function extractTokenFromStorage() {
    try {
      const raw = localStorage.getItem('token') || sessionStorage.getItem('token');
      const t = cleanToken(raw);
      if (isValidToken(t)) return t;
    } catch (_) {}
    return null;
  }

  // ============================================================================
  // CLOUD SYNC ACTIONS (Chỉ chạy 1 lần đầu ngày hoặc khi người dùng bấm nút)
  // ============================================================================
  function pushTokenToCloud(token, isManual = false) {
    if (!isValidToken(token)) return;
    const cleanTok = cleanToken(token);
    if (isManual) showToast('Đang đẩy Token lên Cloud...', '#0284c7');

    const syncUrl = `${SYNC_URL}?action=adminPushToken&token=${encodeURIComponent(cleanTok)}&adminKey=${encodeURIComponent(ADMIN_KEY)}&device=Tampermonkey&_t=${Date.now()}`;

    const onSuccess = (data) => {
      const today = getTodayString();
      GM_setValue('last_sync_date', today);
      GM_setValue('last_sync_token', cleanTok);
      tokenOwnerName = (data && data.tokenOwner) || tokenOwnerName;
      if (data && data.share !== undefined) isShareEnabled = data.share !== false;
      updateWidgetUI();
      if (isManual) {
        showToast(`✓ <strong>Đã cập nhật Token sống lên Cloud!</strong>${tokenOwnerName ? '<br>Chủ: ' + tokenOwnerName : ''}`, '#10b981');
      } else {
        console.log(`[GHN Revert v4.3] Đã đồng bộ Token đầu ngày (${today}) lên Cloud.`);
      }
    };

    // Cách 1: Dùng fetch của trình duyệt (theo dõi redirect 302 mượt mà)
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

    // Cách 2: Dự phòng qua GM_xmlhttpRequest
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

    // Cách 3: Dự phòng Image Beacon
    const tryBeacon = () => {
      const img = new Image();
      img.src = syncUrl;
      onSuccess({ ok: true });
    };

    tryFetch()
      .catch(() => tryGMXhr())
      .catch(() => tryBeacon());
  }

  // Kiểm tra và chỉ tự động đồng bộ 1 LẦN DUY NHẤT VÀO ĐẦU NGÀY
  function checkDailySync(token, isManual = false) {
    if (!isValidToken(token)) {
      if (isManual) showToast('Chưa tìm thấy Token trên trang này. Hãy đăng nhập GHN.', '#ef4444');
      return;
    }

    capturedToken = token;
    const today = getTodayString();
    const lastSyncDate = GM_getValue('last_sync_date', '');
    const lastSyncToken = GM_getValue('last_sync_token', '');

    if (!isManual && lastSyncDate === today && lastSyncToken === token) {
      // Hôm nay đã đồng bộ rồi -> KHÔNG GỌI GÌ HẾT ĐỂ BẢO VỆ TÀI KHOẢN GHN
      console.log(`[GHN Revert v4.3] Token hôm nay (${today}) đã đồng bộ trước đó. Bỏ qua tự động.`);
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

    const tryGMXhr = () => {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: shareUrl,
          anonymous: true,
          onload: function () {
            applySuccess();
            resolve(true);
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
    const tok = capturedToken || extractTokenFromStorage();
    const hasToken = !!tok;

    const statusDot = widgetEl.querySelector('#ghn-widget-status-dot');
    const statusText = widgetEl.querySelector('#ghn-widget-status-text');
    const syncInfoText = widgetEl.querySelector('#ghn-widget-sync-info');
    const shareBtn = widgetEl.querySelector('#ghn-widget-share-btn');
    const shareDesc = widgetEl.querySelector('#ghn-widget-share-desc');

    const today = getTodayString();
    const lastSyncDate = GM_getValue('last_sync_date', '');

    if (hasToken) {
      if (statusDot) statusDot.style.background = '#10b981';
      if (statusText) statusText.innerHTML = `Token: <strong>${tokenOwnerName || tok.slice(0, 8) + '...'}</strong>`;
      if (syncInfoText) {
        syncInfoText.textContent = lastSyncDate === today
          ? `✓ Đã đồng bộ hôm nay (${today})`
          : `Chưa đồng bộ hôm nay (Bấm 'Đẩy Token')`;
        syncInfoText.style.color = lastSyncDate === today ? '#86efac' : '#fcd34d';
      }
    } else {
      if (statusDot) statusDot.style.background = '#ef4444';
      if (statusText) statusText.innerHTML = `Chưa bắt được Token (Hãy đăng nhập)`;
      if (syncInfoText) syncInfoText.textContent = '';
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
        width: 310px;
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
            <span style="font-size: 10px; background: #334155; color: #cbd5e1; padding: 2px 6px; border-radius: 10px;">Quản Trị</span>
          </div>
          <button id="ghn-widget-min-btn" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 12px;" title="Thu gọn/Mở rộng">−</button>
        </div>

        <div id="ghn-widget-body">
          <div class="ghn-widget-status-row">
            <div class="ghn-status-line">
              <span id="ghn-widget-status-dot" class="ghn-status-dot"></span>
              <span id="ghn-widget-status-text">Đang kiểm tra...</span>
            </div>
            <div id="ghn-widget-sync-info" style="font-size: 11px; margin-left: 17px; color: #94a3b8;"></div>
          </div>

          <button type="button" id="ghn-widget-share-btn" class="ghn-share-btn btn-share-on">
            <span class="share-icon">🟢</span> <span>CHIA SẺ: ĐANG BẬT</span>
          </button>
          <div id="ghn-widget-share-desc" class="ghn-share-desc">✓ Nhân viên được phép sử dụng (Bấm để Tắt)</div>

          <div class="ghn-widget-actions">
            <button type="button" id="ghn-widget-push-btn" class="ghn-action-btn" title="Cập nhật Token thủ công khi cần">
              <span>⚡ Đẩy Token</span>
            </button>
            <a href="${REVERT_WEB_URL}" target="_blank" class="ghn-action-btn" title="Mở trang web Revert Hub">
              <span>🌐 Revert Hub</span>
            </a>
            <a href="${SHEET_URL}" target="_blank" class="ghn-action-btn" style="grid-column: span 2;" title="Mở Google Sheet xem nhật ký đổi kho">
              <span>📊 Mở Sheet Nhật Ký Đổi Kho</span>
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
      pushBtn.addEventListener('click', () => {
        const tok = extractTokenFromStorage();
        checkDailySync(tok, true);
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

    // Tự động kiểm tra Token đầu ngày (chỉ 1 lần duy nhất)
    const tok = extractTokenFromStorage();
    if (tok) {
      checkDailySync(tok, false);
    }
    fetchCloudStatus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountWidget);
  } else {
    mountWidget();
  }

})();
