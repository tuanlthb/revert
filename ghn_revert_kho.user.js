// ==UserScript==
// @name         GHN Revert Kho - Tự Động Kết Nối & Đồng Bộ Token (v3.1)
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Tự động bắt Token GHN (UUID 36 ký tự & JWT) từ tracuunoibo.ghn.vn, truyền trực tiếp sang trang Revert Hub (tuanlthb.github.io/revert) và tự động đồng bộ lên Google Apps Script Cloud cho đội ngũ.
// @author       GHN Tool
// @match        https://tracuunoibo.ghn.vn/*
// @match        https://*.ghn.vn/*
// @match        https://tuanlthb.github.io/*
// @match        http://localhost*/*
// @match        http://127.0.0.1*/*
// @match        file:///*
// @match        *://*/*
// @updateURL    https://tuanlthb.github.io/revert/ghn_revert_kho.user.js
// @downloadURL  https://tuanlthb.github.io/revert/ghn_revert_kho.user.js
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        unsafeWindow
// @connect      fe-online-gateway.ghn.vn
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @connect      *
// ==/UserScript==

(function () {
  'use strict';

  // URL Google Apps Script cố định của bạn (tự động đồng bộ mà không cần nhập tay)
  const DEFAULT_SYNC_URL = 'https://script.google.com/macros/s/AKfycbwZFnRy-xnNDFtIjo7bJbdclWCH0INStn-SglOH9XiLUC5v7v1jADjbmHE9IFroaXF0/exec';
  const EXPIRED_DEFAULT_TOKEN = 'ed19b5b2-74a1-42f5-bdd3-d3deecd16278';

  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const isGhnInternalPage = location.hostname === 'tracuunoibo.ghn.vn';

  function getActiveSyncUrl() {
    try {
      const saved = (GM_getValue('ghn_sync_url', '') || '').trim();
      return saved || DEFAULT_SYNC_URL;
    } catch (_) {
      return DEFAULT_SYNC_URL;
    }
  }

  // Helper: validate token string (GHN internal token is a 36-char UUID or JWT)
  function isValidTokenFormat(tok) {
    if (!tok || typeof tok !== 'string') return false;
    const clean = tok.trim().replace(/^["']+|["']+$/g, '');
    if (clean.length < 10 || clean === 'null' || clean === 'undefined') return false;
    if (clean === EXPIRED_DEFAULT_TOKEN) return false;
    return true;
  }

  function cleanTokenString(tok) {
    if (!tok || typeof tok !== 'string') return '';
    return tok.trim().replace(/^["']+|["']+$/g, '');
  }

  // ============================================================================
  // MODE A: RUNNING ON TRACUUNOIBO.GHN.VN (CAPTURE & PUSH TOKEN)
  // ============================================================================
  if (isGhnInternalPage) {
    console.log('⚡ [GHN Revert Sync v3.1] Đang hoạt động trên tracuunoibo.ghn.vn');

    let capturedToken = null;

    function extractTokenFromStorage() {
      try {
        const raw = localStorage.getItem('token') || sessionStorage.getItem('token');
        const tok = cleanTokenString(raw);
        if (isValidTokenFormat(tok)) return tok;
      } catch (_) {}
      return null;
    }

    function onTokenCaptured(rawTok, sourceLabel) {
      const tok = cleanTokenString(rawTok);
      if (!isValidTokenFormat(tok)) return;
      if (tok === capturedToken) return;

      capturedToken = tok;
      const nowIso = new Date().toISOString();

      // 1. Save immediately into Tampermonkey cross-origin storage so Revert Hub gets it instantly
      try {
        GM_setValue('ghn_live_token', tok);
        GM_setValue('ghn_live_token_updated', nowIso);
      } catch (_) {}
      console.log(`⚡ [GHN Revert Sync v3.1] Đã bắt được Token từ ${sourceLabel}: ${tok.slice(0, 8)}...`);

      // 2. Update floating badge UI if ready
      updateBadgeStatus(tok);

      // 3. Always sync to Cloud when a new token is captured (or if not synced recently)
      const lastCloudTok = GM_getValue('last_synced_token', '');
      const syncUrl = getActiveSyncUrl();
      if (syncUrl && tok !== lastCloudTok) {
        syncTokenToCloud(tok, false);
      }
    }

    // Hook window.fetch at document-start to capture 'token' header from API requests
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
            if (isValidTokenFormat(tok)) {
              onTokenCaptured(tok, 'Fetch Header');
            }
          }
        } catch (_) {}
        return origFetch.apply(this, arguments);
      };
    }

    // Hook XMLHttpRequest.prototype.setRequestHeader at document-start
    try {
      const origSetHeader = pageWindow.XMLHttpRequest.prototype.setRequestHeader;
      pageWindow.XMLHttpRequest.prototype.setRequestHeader = function (key, value) {
        try {
          if (String(key || '').toLowerCase() === 'token' && isValidTokenFormat(value)) {
            onTokenCaptured(String(value), 'XHR Header');
          }
        } catch (_) {}
        return origSetHeader.apply(this, arguments);
      };
    } catch (_) {}

    // UI Elements on tracuunoibo.ghn.vn
    let floatingBtn = null;
    let toastEl = null;

    function notify(msg, color = '#10b981') {
      if (!toastEl) return;
      toastEl.style.borderLeftColor = color;
      toastEl.innerHTML = msg;
      toastEl.style.display = 'block';
      clearTimeout(toastEl._hideTimer);
      toastEl._hideTimer = setTimeout(() => {
        toastEl.style.display = 'none';
      }, 5000);
    }

    function updateBadgeStatus(tok) {
      if (!floatingBtn) return;
      if (isValidTokenFormat(tok)) {
        floatingBtn.innerHTML = `⚡ Token Revert: Đã đồng bộ (${tok.slice(0, 6)}...)`;
        floatingBtn.style.background = 'linear-gradient(135deg, #059669, #10b981)';
      } else {
        floatingBtn.innerHTML = `⚡ Đồng Bộ Token Revert`;
        floatingBtn.style.background = 'linear-gradient(135deg, #fa6400, #ea580c)';
      }
    }

    function syncTokenToCloud(token, isManual = false) {
      const syncUrl = getActiveSyncUrl();
      if (!syncUrl) return;

      if (isManual) notify('Đang đẩy Token mới lên Cloud...', '#0284c7');

      // Use GET ?token=... directly via GM_xmlhttpRequest (fastest & 100% reliable with Google Apps Script doGet)
      const sep = syncUrl.includes('?') ? '&' : '?';
      const getUrl = `${syncUrl}${sep}token=${encodeURIComponent(token)}&_t=${Date.now()}`;

      GM_xmlhttpRequest({
        method: 'GET',
        url: getUrl,
        onload: function (res) {
          if (res.status >= 200 && res.status < 400) {
            GM_setValue('last_synced_token', token);
            GM_setValue('last_synced_at', new Date().toISOString());
            notify(`✓ <strong>Đã tự động đẩy Token mới lên Cloud!</strong><br>Token: <code>${token.slice(0, 8)}...</code>`, '#10b981');
          } else {
            // Fallback POST
            GM_xmlhttpRequest({
              method: 'POST',
              url: syncUrl,
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              data: JSON.stringify({ token: token }),
              onload: function (res2) {
                if (res2.status >= 200 && res2.status < 400) {
                  GM_setValue('last_synced_token', token);
                  GM_setValue('last_synced_at', new Date().toISOString());
                  notify(`✓ <strong>Đã đồng bộ Token lên Cloud!</strong>`, '#10b981');
                } else if (isManual) {
                  notify(`⚠️ Lỗi HTTP ${res2.status} khi đồng bộ Cloud`, '#ef4444');
                }
              }
            });
          }
        },
        onerror: function () {
          if (isManual) notify(`❌ Không thể kết nối tới URL đồng bộ Cloud!`, '#ef4444');
        }
      });
    }

    function promptForSyncUrl() {
      const currentUrl = getActiveSyncUrl();
      const newUrl = prompt(
        'URL Google Apps Script Web App để TỰ ĐỘNG ĐỒNG BỘ Token cho đội ngũ:\n(Đã được cấu hình sẵn mặc định)',
        currentUrl
      );

      if (newUrl !== null) {
        const clean = newUrl.trim();
        GM_setValue('ghn_sync_url', clean || DEFAULT_SYNC_URL);
        const tok = capturedToken || extractTokenFromStorage();
        if (tok) {
          syncTokenToCloud(tok, true);
        } else {
          notify('Đã lưu URL Cloud! Hãy đăng nhập tracuunoibo.ghn.vn để bắt Token.', '#0284c7');
        }
      }
    }

    function mountGhnUI() {
      if (!document.body || document.getElementById('ghn-sync-status-badge')) return;

      GM_addStyle(`
        #ghn-sync-status-badge {
          position: fixed;
          right: 24px;
          bottom: 24px;
          z-index: 999999;
          background: linear-gradient(135deg, #fa6400, #ea580c);
          color: #fff;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px;
          font-weight: 700;
          padding: 9px 16px;
          border-radius: 50px;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.25);
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 8px;
          user-select: none;
        }
        #ghn-sync-status-badge:hover {
          transform: translateY(-2px) scale(1.02);
        }
        #ghn-sync-toast {
          position: fixed;
          bottom: 75px;
          right: 24px;
          z-index: 1000000;
          background: #0f172a;
          color: #38bdf8;
          padding: 10px 18px;
          border-radius: 8px;
          font-size: 12.5px;
          font-family: -apple-system, sans-serif;
          box-shadow: 0 10px 25px rgba(0,0,0,0.25);
          border-left: 4px solid #10b981;
          display: none;
        }
      `);

      toastEl = document.createElement('div');
      toastEl.id = 'ghn-sync-toast';
      document.body.appendChild(toastEl);

      floatingBtn = document.createElement('div');
      floatingBtn.id = 'ghn-sync-status-badge';
      floatingBtn.innerHTML = '⚡ Đồng Bộ Token Revert';
      floatingBtn.title = 'Bấm để đẩy ngay Token lên Cloud & Copy Token';
      document.body.appendChild(floatingBtn);

      const tok = extractTokenFromStorage();
      if (tok) {
        onTokenCaptured(tok, 'localStorage');
        // Force push once on page load to make sure Cloud always has the latest live token
        syncTokenToCloud(tok, false);
      }

      floatingBtn.addEventListener('click', () => {
        const currentTok = capturedToken || extractTokenFromStorage();
        const syncUrl = getActiveSyncUrl();

        if (currentTok) {
          GM_setValue('ghn_live_token', currentTok);
          GM_setValue('ghn_live_token_updated', new Date().toISOString());
          if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(currentTok);
          } else if (navigator.clipboard) {
            navigator.clipboard.writeText(currentTok);
          }
          if (syncUrl) {
            syncTokenToCloud(currentTok, true);
          }
        }

        let msg = `⚡ GHN REVERT KHO - TỰ ĐỘNG KẾT NỐI TOKEN (v3.1)\n\n`;
        msg += `• Trạng thái Token: ${currentTok ? ('ĐÃ LẤY & ĐẨY LÊN CLOUD (' + currentTok.slice(0, 12) + '...)') : 'Chưa tìm thấy (Hãy đăng nhập)'}\n`;
        msg += `• Cầu nối Tampermonkey: Tự động truyền sang trang Revert Hub\n`;
        msg += `• URL Cloud Đội Ngũ: ${syncUrl ? (syncUrl.slice(0, 42) + '...') : 'Chưa cài đặt'}\n\n`;
        msg += `Token của bạn đã được Copy vào bộ nhớ tạm và đẩy lên Cloud!\n`;
        msg += `Bấm [OK] nếu bạn muốn mở ngay trang công cụ Revert Hub.\n`;
        msg += `Bấm [Cancel] để đóng.`;

        if (confirm(msg) && currentTok) {
          window.open(`https://tuanlthb.github.io/revert/?token=${encodeURIComponent(currentTok)}`, '_blank');
        }
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountGhnUI);
    } else {
      mountGhnUI();
    }

    // Periodically check localStorage every 3s in case user logs in or refreshes token
    setInterval(() => {
      const tok = extractTokenFromStorage();
      if (tok && tok !== capturedToken) {
        onTokenCaptured(tok, 'Polling');
      }
    }, 3000);

    return;
  }

  // ============================================================================
  // MODE B: RUNNING ON REVERT HUB WEB APP (AUTO-INJECT LIVE TOKEN)
  // ============================================================================
  function tryBridgeTokenToRevertApp() {
    const tokenInput = document.getElementById('token-input');
    const updateBtn = document.getElementById('btn-update-warehouse');
    if (!tokenInput || !updateBtn) return false; // Not our Revert Hub app

    console.log('⚡ [GHN Revert Sync v3.1] Đã phát hiện trang GHN Revert Hub! Đang kết nối cầu nối Token tự động...');

    // Ensure Cloud URL is synced in both localStorage and Tampermonkey storage
    try {
      const activeUrl = getActiveSyncUrl();
      if (activeUrl && !localStorage.getItem('ghn_sync_url')) {
        localStorage.setItem('ghn_sync_url', activeUrl);
      }
    } catch (_) {}

    function pushLiveTokenIntoPage(tok, updatedAt) {
      const cleanTok = cleanTokenString(tok);
      if (!isValidTokenFormat(cleanTok)) return;

      // 1. Write directly to shared DOM & localStorage (works across Tampermonkey isolated world!)
      try {
        localStorage.setItem('ghn_bridged_token', cleanTok);
        localStorage.setItem('ghn_revert_token', cleanTok);
        document.documentElement.setAttribute('data-ghn-bridged-token', cleanTok);
        document.documentElement.setAttribute('data-ghn-bridged-updated', updatedAt || new Date().toISOString());
      } catch (_) {}

      // 2. Send window.postMessage (safe across isolated worlds in all browsers)
      try {
        window.postMessage({
          type: 'GHN_TOKEN_BRIDGED',
          token: cleanTok,
          updatedAt: updatedAt || new Date().toISOString(),
          source: 'Tampermonkey v3.1'
        }, '*');
      } catch (_) {}

      // 3. Also set input value directly if current value is empty or expired default token
      if (tokenInput && (!tokenInput.value || tokenInput.value === EXPIRED_DEFAULT_TOKEN || tokenInput.value !== cleanTok)) {
        tokenInput.value = cleanTok;
        const checkBtn = document.getElementById('btn-check-token');
        if (checkBtn) {
          setTimeout(() => checkBtn.click(), 100);
        }
      }
    }

    // 1. Immediately inject token stored in Tampermonkey
    const liveToken = GM_getValue('ghn_live_token', '');
    const liveUpdated = GM_getValue('ghn_live_token_updated', '');
    if (isValidTokenFormat(liveToken)) {
      pushLiveTokenIntoPage(liveToken, liveUpdated);
    }

    // 2. Listen for real-time token changes from tracuunoibo.ghn.vn tab
    if (typeof GM_addValueChangeListener === 'function') {
      GM_addValueChangeListener('ghn_live_token', function (name, oldVal, newVal) {
        if (isValidTokenFormat(newVal) && newVal !== oldVal) {
          pushLiveTokenIntoPage(newVal, new Date().toISOString());
        }
      });
    }

    return true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(tryBridgeTokenToRevertApp, 150);
    });
  } else {
    setTimeout(tryBridgeTokenToRevertApp, 150);
  }

})();
