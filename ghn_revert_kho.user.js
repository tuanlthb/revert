// ==UserScript==
// @name         GHN Revert Kho - Quản Trị & Đồng Bộ Token (v4.0)
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Tự động bắt Token GHN trên tracuunoibo.ghn.vn, đẩy lên Google Apps Script cho đội ngũ và cung cấp NÚT BẬT / TẮT CHIA SẺ Token trực tiếp trên màn hình GHN.
// @author       GHN Tool
// @match        https://tracuunoibo.ghn.vn/*
// @match        https://*.ghn.vn/*
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
// @connect      *
// ==/UserScript==

(function () {
  'use strict';

  // URL Google Apps Script Web App của Quản lý
  const SYNC_URL = 'https://script.google.com/macros/s/AKfycbwZFnRy-xnNDFtIjo7bJbdclWCH0INStn-SglOH9XiLUC5v7v1jADjbmHE9IFroaXF0/exec';
  const ADMIN_KEY = 'ghn_revert_secret_2026';
  const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1myvJs5M404MNhQeTxtzijlwEnNr7JIUT3itEVYrr6FM/edit?usp=sharing';
  const REVERT_WEB_URL = 'https://tuanlthb.github.io/revert/';

  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const isGhnInternalPage = location.hostname === 'tracuunoibo.ghn.vn';

  let capturedToken = null;
  let isShareEnabled = true;
  let lastSyncedToken = '';
  let tokenOwnerName = '';

  function cleanToken(tok) {
    if (!tok || typeof tok !== 'string') return '';
    return tok.trim().replace(/^["']+|["']+$/g, '');
  }

  function isValidToken(tok) {
    const c = cleanToken(tok);
    return c.length >= 20 && c !== 'null' && c !== 'undefined';
  }

  // ============================================================================
  // TOKEN EXTRACTION & HOOKS
  // ============================================================================
  function extractTokenFromStorage() {
    try {
      const raw = localStorage.getItem('token') || sessionStorage.getItem('token');
      const t = cleanToken(raw);
      if (isValidToken(t)) return t;
    } catch (_) {}
    return null;
  }

  function onTokenFound(rawTok, source) {
    const tok = cleanToken(rawTok);
    if (!isValidToken(tok)) return;
    if (tok === capturedToken) return;

    capturedToken = tok;
    console.log(`⚡ [GHN Revert v4.0] Đã bắt được Token từ ${source}: ${tok.slice(0, 8)}...`);

    // Tự động đẩy Token lên Google Apps Script cho đội ngũ
    if (tok !== lastSyncedToken) {
      pushTokenToCloud(tok, false);
    }
    updateWidgetUI();
  }

  // Hook Fetch API
  const origFetch = pageWindow.fetch;
  if (typeof origFetch === 'function') {
    pageWindow.fetch = function (input, init) {
      try {
        if (init && init.headers) {
          let tok = null;
          if (typeof Headers !== 'undefined' && init.headers instanceof Headers) {
            tok = init.headers.get('token') || init.headers.get('Token');
          } else if (typeof init.headers === 'object') {
            tok = init.headers.token || init.headers.Token;
          }
          if (isValidToken(tok)) onTokenFound(tok, 'Fetch Header');
        }
      } catch (_) {}
      return origFetch.apply(this, arguments);
    };
  }

  // Hook XMLHttpRequest
  try {
    const origSetHeader = pageWindow.XMLHttpRequest.prototype.setRequestHeader;
    pageWindow.XMLHttpRequest.prototype.setRequestHeader = function (key, value) {
      try {
        if (String(key || '').toLowerCase() === 'token' && isValidToken(value)) {
          onTokenFound(String(value), 'XHR Header');
        }
      } catch (_) {}
      return origSetHeader.apply(this, arguments);
    };
  } catch (_) {}

  // ============================================================================
  // CLOUD SYNC ACTIONS
  // ============================================================================
  function pushTokenToCloud(token, isManual = false) {
    if (!isValidToken(token)) return;
    if (isManual) showToast('Đang đẩy Token lên Cloud...', '#0284c7');

    const payload = JSON.stringify({
      action: 'adminPushToken',
      adminKey: ADMIN_KEY,
      token: token,
      device: 'Tampermonkey / tracuunoibo'
    });

    GM_xmlhttpRequest({
      method: 'POST',
      url: SYNC_URL,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      data: payload,
      onload: function (res) {
        let success = false;
        try {
          const data = JSON.parse(res.responseText);
          if (data && data.ok) {
            success = true;
            tokenOwnerName = data.tokenOwner || '';
            isShareEnabled = data.share !== false;
          }
        } catch (_) {}

        if (success) {
          lastSyncedToken = token;
          updateWidgetUI();
          showToast(`✓ <strong>Đã cập nhật Token sống lên Cloud!</strong>${tokenOwnerName ? '<br>Chủ: ' + tokenOwnerName : ''}`, '#10b981');
        } else {
          // Fallback via GET ?token=...
          GM_xmlhttpRequest({
            method: 'GET',
            url: `${SYNC_URL}?token=${encodeURIComponent(token)}&_t=${Date.now()}`,
            onload: function (res2) {
              if (res2.status >= 200 && res2.status < 400) {
                lastSyncedToken = token;
                updateWidgetUI();
                showToast(`✓ Đã đồng bộ Token lên Cloud!`, '#10b981');
              } else if (isManual) {
                showToast(`⚠️ Lỗi HTTP ${res2.status} khi đẩy Token`, '#ef4444');
              }
            }
          });
        }
      },
      onerror: function () {
        // Fallback GET
        GM_xmlhttpRequest({
          method: 'GET',
          url: `${SYNC_URL}?token=${encodeURIComponent(token)}&_t=${Date.now()}`,
          onload: function (r) {
            if (r.status >= 200 && r.status < 400) {
              lastSyncedToken = token;
              showToast(`✓ Đã đồng bộ Token lên Cloud (GET)`, '#10b981');
            }
          }
        });
      }
    });
  }

  function setCloudShare(enable) {
    showToast(enable ? 'Đang BẬT chia sẻ Token...' : 'Đang TẮT chia sẻ Token...', '#0284c7');

    const payload = JSON.stringify({
      action: 'adminSetShare',
      adminKey: ADMIN_KEY,
      enabled: enable,
      device: 'Tampermonkey / tracuunoibo'
    });

    GM_xmlhttpRequest({
      method: 'POST',
      url: SYNC_URL,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      data: payload,
      onload: function (res) {
        let ok = false;
        try {
          const d = JSON.parse(res.responseText);
          if (d && d.ok) {
            ok = true;
            isShareEnabled = d.share !== false;
          }
        } catch (_) {}

        if (!ok) {
          // Fallback qua GET
          GM_xmlhttpRequest({
            method: 'GET',
            url: `${SYNC_URL}?action=setShare&enabled=${enable}&_t=${Date.now()}`,
            onload: function (r2) {
              isShareEnabled = enable;
              updateWidgetUI();
              notifyShareResult(enable);
            }
          });
          return;
        }

        updateWidgetUI();
        notifyShareResult(enable);
      },
      onerror: function () {
        GM_xmlhttpRequest({
          method: 'GET',
          url: `${SYNC_URL}?action=setShare&enabled=${enable}&_t=${Date.now()}`,
          onload: function () {
            isShareEnabled = enable;
            updateWidgetUI();
            notifyShareResult(enable);
          }
        });
      }
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
    GM_xmlhttpRequest({
      method: 'GET',
      url: `${SYNC_URL}?action=status&_t=${Date.now()}`,
      onload: function (res) {
        try {
          const d = JSON.parse(res.responseText);
          if (d && d.ok) {
            isShareEnabled = d.share !== false;
            tokenOwnerName = d.tokenOwner || tokenOwnerName;
            updateWidgetUI();
          }
        } catch (_) {}
      }
    });
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
    const shareBtn = widgetEl.querySelector('#ghn-widget-share-btn');
    const shareDesc = widgetEl.querySelector('#ghn-widget-share-desc');

    if (hasToken) {
      if (statusDot) statusDot.style.background = '#10b981';
      if (statusText) statusText.innerHTML = `Token sống: <strong>${tokenOwnerName || tok.slice(0, 8) + '...'}</strong>`;
    } else {
      if (statusDot) statusDot.style.background = '#ef4444';
      if (statusText) statusText.innerHTML = `Chưa bắt được Token (Hãy đăng nhập)`;
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
        align-items: center;
        gap: 8px;
        font-size: 12px;
        margin-bottom: 12px;
        background: #1e293b;
        padding: 6px 10px;
        border-radius: 6px;
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
            <span id="ghn-widget-status-dot" class="ghn-status-dot"></span>
            <span id="ghn-widget-status-text">Đang kiểm tra...</span>
          </div>

          <button type="button" id="ghn-widget-share-btn" class="ghn-share-btn btn-share-on">
            <span class="share-icon">🟢</span> <span>CHIA SẺ: ĐANG BẬT</span>
          </button>
          <div id="ghn-widget-share-desc" class="ghn-share-desc">✓ Nhân viên được phép sử dụng (Bấm để Tắt)</div>

          <div class="ghn-widget-actions">
            <button type="button" id="ghn-widget-push-btn" class="ghn-action-btn" title="Đẩy lại Token sống lên Cloud">
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
        const tok = capturedToken || extractTokenFromStorage();
        if (tok) {
          pushTokenToCloud(tok, true);
        } else {
          showToast('Chưa tìm thấy Token trên trang này. Hãy đăng nhập GHN.', '#ef4444');
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

    // Khởi tạo trạng thái
    const tok = extractTokenFromStorage();
    if (tok) onTokenFound(tok, 'localStorage');
    fetchCloudStatus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountWidget);
  } else {
    mountWidget();
  }

  // Quét định kỳ kiểm tra Token sống
  setInterval(() => {
    const tok = extractTokenFromStorage();
    if (tok && tok !== capturedToken) {
      onTokenFound(tok, 'Polling');
    }
  }, 3000);

})();
