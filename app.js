/**
 * GHN Revert Hub - Online Warehouse Revert Tool
 * Connects directly to https://fe-online-gateway.ghn.vn
 */

(function () {
  'use strict';

  // --- API CONSTANTS ---
  const API_BASE = 'https://fe-online-gateway.ghn.vn';
  const API_USER_INFO = `${API_BASE}/order-tracking/public-api/internal/user-info`;
  const API_WAREHOUSES = `${API_BASE}/order-tracking/public-api/inside/warehouse-all`;
  const API_UPDATE_ORDERS = `${API_BASE}/order-tracking/public-api/internal/update-orders-warehouse`;
  const API_CHECK_OWNERSHIP = `${API_BASE}/order-tracking/public-api/internal/check-warehouse-ownership`;
  const API_WAREHOUSES_BY_WARD = `${API_BASE}/order-tracking/public-api/internal/warehouses-by-ward`;

  // Master Data APIs (Old Address - 3 levels: Province -> District -> Ward)
  const API_PROVINCES_OLD = `${API_BASE}/order-tracking/public-api/master-data/provinces`;
  const API_DISTRICTS_OLD = `${API_BASE}/order-tracking/public-api/master-data/districts`;
  const API_WARDS_OLD = `${API_BASE}/order-tracking/public-api/master-data/wards`;

  // Master Data APIs (New Address V3 - 2 levels: Province -> Ward)
  const API_PROVINCES_NEW = `${API_BASE}/order-tracking/public-api/v3/master-data/province/all`;
  const API_WARDS_NEW = `${API_BASE}/order-tracking/public-api/v3/master-data/ward/all-by-province-id`;

  const WAREHOUSE_TYPE_NAMES = {
    1: 'Kho hiện tại',
    2: 'Kho lấy',
    3: 'Kho giao',
    4: 'Kho trả'
  };

  // Map numeric warehouse type to API ward warehouse type key (matches Hs in official GHN bundle)
  const WARD_WAREHOUSE_TYPE_MAP = {
    2: 'pick',
    3: 'deliver',
    4: 'return'
  };

  const REASON_LABELS = {
    'area_closer_to_other_bc': 'Khu vực giáp ranh với BC khác gần hơn',
    'overload_support_other_bc': 'Chuyển BC khác hỗ trợ quá tải',
    'newly_opened_bc': 'Chuyển về BC mới mở',
    'wrong_weight_dimension_correct_bc': 'Sai cân nặng kích thước chuyển về đúng BC phụ trách',
    'address_other_bc': 'Địa chỉ nằm ở khu vực BC khác phụ trách',
    'other_reason': 'Lý do khác'
  };

  // --- FIXED DEFAULT TOKEN & SYNC URL ---
  const FIXED_DEFAULT_TOKEN = 'ed19b5b2-74a1-42f5-bdd3-d3deecd16278';
  // URL Google Apps Script cố định để mọi nhân viên mở web đều tự động tải Token mà không cần cấu hình
  const DEFAULT_SYNC_URL = 'https://script.google.com/macros/s/AKfycbwZFnRy-xnNDFtIjo7bJbdclWCH0INStn-SglOH9XiLUC5v7v1jADjbmHE9IFroaXF0/exec';

  // --- APPLICATION STATE ---
  const state = {
    token: FIXED_DEFAULT_TOKEN,
    isTokenValid: false,
    user: null,
    warehouses: [],
    selectedWarehouse: null,
    selectedType: 3, // Default: Deliver (Kho Giao)
    selectedReasonKey: 'area_closer_to_other_bc',
    customReasonText: '',
    orders: [],
    isProcessing: false,
    shouldStop: false,

    // Ward selection & auto-warehouse state
    selectedWardAddress: null,
    wardWarehouses: null,
    wardRequestId: 0,
    wardModal: {
      isNewAddress: false,
      provincesOld: [],
      districtsOld: [],
      wardsOld: [],
      provincesNew: [],
      wardsNew: [],
      selectedOldProvince: null, // { value, label }
      selectedOldDistrict: null, // { value, label }
      selectedOldWard: null,     // { value, label }
      selectedNewProvince: null, // { value, label }
      selectedNewWard: null,     // { value, label }
      loadingMaster: false
    },

    results: {
      success: [],
      eform: [],
      failed: [],
      logs: []
    }
  };

  // --- DOM ELEMENTS ---
  const els = {
    tokenInput: document.getElementById('token-input'),
    btnToggleToken: document.getElementById('btn-toggle-token'),
    btnSaveToken: document.getElementById('btn-save-token'),
    btnCheckToken: document.getElementById('btn-check-token'),
    tokenPill: document.getElementById('token-pill'),
    tokenStatusText: document.getElementById('token-status-text'),
    userInfoBadge: document.getElementById('user-info-badge'),
    userAvatarText: document.getElementById('user-avatar-text'),
    userFullName: document.getElementById('user-fullname'),
    userIdCode: document.getElementById('user-id-code'),

    ordersTextarea: document.getElementById('orders-textarea'),
    orderCounterBadge: document.getElementById('order-counter-badge'),
    btnPasteClipboard: document.getElementById('btn-paste-clipboard'),
    excelFileInput: document.getElementById('excel-file-input'),
    btnCleanOrders: document.getElementById('btn-clean-orders'),
    btnClearOrders: document.getElementById('btn-clear-orders'),

    typeCards: document.querySelectorAll('.type-card'),

    // Ward Selector Elements
    wardSelectorGroup: document.getElementById('ward-selector-group'),
    wardSelectorBox: document.getElementById('ward-selector-box'),
    wardSelectorText: document.getElementById('ward-selector-text'),
    btnClearWard: document.getElementById('btn-clear-ward'),
    wardAutofillFeedback: document.getElementById('ward-autofill-feedback'),

    // Ward Modal Elements
    modalSelectWard: document.getElementById('modal-select-ward'),
    btnCloseWardModal: document.getElementById('btn-close-ward-modal'),
    btnCancelWardModal: document.getElementById('btn-cancel-ward-modal'),
    btnConfirmWardModal: document.getElementById('btn-confirm-ward-modal'),
    addressModeSwitch: document.getElementById('address-mode-switch'),
    wardGridOld: document.getElementById('ward-grid-old'),
    wardGridNew: document.getElementById('ward-grid-new'),
    inputOldProvince: document.getElementById('input-old-province'),
    dropdownOldProvince: document.getElementById('dropdown-old-province'),
    inputOldDistrict: document.getElementById('input-old-district'),
    dropdownOldDistrict: document.getElementById('dropdown-old-district'),
    inputOldWard: document.getElementById('input-old-ward'),
    dropdownOldWard: document.getElementById('dropdown-old-ward'),
    inputNewProvince: document.getElementById('input-new-province'),
    dropdownNewProvince: document.getElementById('dropdown-new-province'),
    inputNewWard: document.getElementById('input-new-ward'),
    dropdownNewWard: document.getElementById('dropdown-new-ward'),
    wardAddressPreview: document.getElementById('ward-address-preview'),
    wardAddressPreviewText: document.getElementById('ward-address-preview-text'),

    whSearchInput: document.getElementById('wh-search-input'),
    whClearBtn: document.getElementById('wh-clear-btn'),
    whDropdown: document.getElementById('wh-dropdown'),
    whTotalCount: document.getElementById('wh-total-count'),
    selectedWhPreview: document.getElementById('selected-wh-preview'),
    previewWhName: document.getElementById('preview-wh-name'),
    previewWhMeta: document.getElementById('preview-wh-meta'),
    previewWhBadge: document.getElementById('preview-wh-badge'),

    reasonSelect: document.getElementById('reason-select'),
    customReasonTextarea: document.getElementById('custom-reason-textarea'),
    batchSizeSelect: document.getElementById('batch-size-select'),

    btnUpdateWarehouse: document.getElementById('btn-update-warehouse'),
    btnStopExecution: document.getElementById('btn-stop-execution'),
    progressCard: document.getElementById('progress-card'),
    progressBarFill: document.getElementById('progress-bar-fill'),
    progressPercent: document.getElementById('progress-percent'),
    progressStatusText: document.getElementById('progress-status-text'),

    btnExportExcel: document.getElementById('btn-export-excel'),
    btnClearResults: document.getElementById('btn-clear-results'),
    resultTabBtns: document.querySelectorAll('.result-tab-btn'),
    tabPaneSuccess: document.getElementById('tab-pane-success'),
    tabPaneEform: document.getElementById('tab-pane-eform'),
    tabPaneFailed: document.getElementById('tab-pane-failed'),
    tabPaneLogs: document.getElementById('tab-pane-logs'),
    tabCountSuccess: document.getElementById('tab-count-success'),
    tabCountEform: document.getElementById('tab-count-eform'),
    tabCountFailed: document.getElementById('tab-count-failed'),

    emptySuccess: document.getElementById('empty-success'),
    tableWrapSuccess: document.getElementById('table-wrap-success'),
    tbodySuccess: document.getElementById('tbody-success'),
    btnCopySuccess: document.getElementById('btn-copy-success'),

    emptyEform: document.getElementById('empty-eform'),
    tableWrapEform: document.getElementById('table-wrap-eform'),
    tbodyEform: document.getElementById('tbody-eform'),
    btnCopyEform: document.getElementById('btn-copy-eform'),

    emptyFailed: document.getElementById('empty-failed'),
    tableWrapFailed: document.getElementById('table-wrap-failed'),
    tbodyFailed: document.getElementById('tbody-failed'),
    btnCopyFailed: document.getElementById('btn-copy-failed'),

    systemLogs: document.getElementById('system-logs'),

    modalConfirm: document.getElementById('modal-confirm'),
    btnCloseConfirm: document.getElementById('btn-close-confirm'),
    btnCancelConfirm: document.getElementById('btn-cancel-confirm'),
    btnExecuteConfirmed: document.getElementById('btn-execute-confirmed'),
    confirmOrderCount: document.getElementById('confirm-order-count'),
    confirmWhType: document.getElementById('confirm-wh-type'),
    confirmWhDest: document.getElementById('confirm-wh-dest'),
    confirmReason: document.getElementById('confirm-reason'),

    modalGuide: document.getElementById('modal-guide'),
    btnOpenGuide: document.getElementById('btn-open-guide'),
    btnCloseGuide: document.getElementById('btn-close-guide'),
    btnGuideOk: document.getElementById('btn-guide-ok'),

    modalSync: document.getElementById('modal-sync'),
    btnOpenSyncModal: document.getElementById('btn-open-sync-modal'),
    btnCloseSync: document.getElementById('btn-close-sync'),
    btnCancelSync: document.getElementById('btn-cancel-sync'),
    btnSaveSyncUrl: document.getElementById('btn-save-sync-url'),
    btnTestSyncUrl: document.getElementById('btn-test-sync-url'),
    btnPushSyncUrl: document.getElementById('btn-push-sync-url'),
    syncUrlInput: document.getElementById('sync-url-input'),
    syncStatusDetail: document.getElementById('sync-status-detail'),
    btnCopyGasCode: document.getElementById('btn-copy-gas-code'),
    cloudSyncInfoPill: document.getElementById('cloud-sync-info-pill'),
    cloudSyncInfoText: document.getElementById('cloud-sync-info-text'),
    tmBridgeStatusText: document.getElementById('tm-bridge-status-text'),

    toastContainer: document.getElementById('toast-container')
  };

  // --- UTILITY FUNCTIONS ---
  function showToast(message, type = 'info', duration = 3500) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconClass = 'fa-solid fa-circle-info';
    if (type === 'success') iconClass = 'fa-solid fa-circle-check';
    if (type === 'error') iconClass = 'fa-solid fa-triangle-exclamation';
    if (type === 'warning') iconClass = 'fa-solid fa-circle-exclamation';

    toast.innerHTML = `<i class="${iconClass}"></i> <span>${message}</span>`;
    els.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideInRight 0.25s ease reverse';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  function addLog(message, isError = false) {
    const timeStr = new Date().toLocaleTimeString('vi-VN');
    const logItem = `[${timeStr}] ${message}`;
    state.results.logs.push(logItem);

    if (els.systemLogs) {
      const line = document.createElement('div');
      if (isError) line.style.color = '#f87171';
      line.textContent = logItem;
      els.systemLogs.appendChild(line);
      els.systemLogs.scrollTop = els.systemLogs.scrollHeight;
    }
  }

  function removeVietnameseTones(str) {
    if (!str) return '';
    return String(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
  }

  // --- TOKEN HANDLING & AUTOMATIC SYNC ---
  const GAS_CODE_SNIPPET = `function doGet(e) {
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
}`;

  function getConfiguredSyncUrl() {
    return (localStorage.getItem('ghn_sync_url') || DEFAULT_SYNC_URL || '').trim();
  }

  async function initToken() {
    // 1. Check URL query / hash for ?token=...
    let receivedFromUrl = false;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token') || new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token');
      if (urlToken && urlToken.trim().length >= 10) {
        const cleanUrlTok = urlToken.trim().replace(/^["']+|["']+$/g, '');
        if (cleanUrlTok !== FIXED_DEFAULT_TOKEN) {
          localStorage.setItem('ghn_revert_token', cleanUrlTok);
          localStorage.setItem('ghn_bridged_token', cleanUrlTok);
          receivedFromUrl = true;
          addLog('✓ Đã nhận Token mới truyền trực tiếp từ đường dẫn URL.');
        }
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (_) {}

    // 2. Listen for Tampermonkey Auto-Bridge events (CustomEvent & window.postMessage across isolated worlds)
    window.addEventListener('ghn-token-bridged', (e) => {
      const detail = (e && e.detail) || {};
      if (detail.token && detail.token.trim().length >= 10) {
        handleBridgedToken(detail.token.trim(), detail.updatedAt);
      }
    });

    window.addEventListener('message', (ev) => {
      const data = ev && ev.data;
      if (data && data.type === 'GHN_TOKEN_BRIDGED' && data.token) {
        handleBridgedToken(String(data.token).trim(), data.updatedAt);
      }
    });

    // Also listen for BroadcastChannel from companion tab
    try {
      const bc = new BroadcastChannel('ghn_revert_token_channel');
      bc.onmessage = (ev) => {
        if (ev.data && ev.data.token) {
          handleBridgedToken(String(ev.data.token).trim(), ev.data.updatedAt);
        }
      };
    } catch (_) {}

    // 3. Determine initial candidate tokens in priority order
    const domAttrToken = document.documentElement.getAttribute('data-ghn-bridged-token');
    const bridgedToken = domAttrToken || window.__GHN_BRIDGED_TOKEN__ || localStorage.getItem('ghn_bridged_token');
    const ghnPageToken = localStorage.getItem('token') || sessionStorage.getItem('token') || localStorage.getItem('ghn_extracted_token');
    const savedRevertToken = localStorage.getItem('ghn_revert_token');

    // Avoid getting stuck on the expired default token if another token exists
    const candidates = [
      (bridgedToken && bridgedToken !== FIXED_DEFAULT_TOKEN) ? bridgedToken : null,
      (ghnPageToken && ghnPageToken !== FIXED_DEFAULT_TOKEN) ? ghnPageToken : null,
      (savedRevertToken && savedRevertToken !== FIXED_DEFAULT_TOKEN) ? savedRevertToken : null,
      FIXED_DEFAULT_TOKEN
    ].filter(t => t && String(t).trim().length >= 10);

    const initialToken = (candidates[0] || FIXED_DEFAULT_TOKEN).trim().replace(/^["']+|["']+$/g, '');
    state.token = initialToken;
    els.tokenInput.value = initialToken;

    const syncUrl = getConfiguredSyncUrl();
    if (syncUrl) {
      els.syncUrlInput.value = syncUrl;
    }

    // 4. Validate the initial token
    const isValid = await checkTokenValidity(initialToken, receivedFromUrl);

    // 5. If initial token is invalid or Cloud Sync is configured, try Cloud Sync automatically
    if (syncUrl) {
      if (!isValid) {
        addLog('Đang tự động tải Token mới nhất từ Google Script Cloud Sync...');
        await fetchTokenFromCloudSync(syncUrl, false);
      } else {
        // Valid local token! Push it to Cloud so all team members get the latest live token
        syncWithCloudBidirectional(syncUrl, initialToken);
      }
    }
  }

  async function handleBridgedToken(newToken, updatedAt) {
    const cleanTok = String(newToken || '').trim().replace(/^["']+|["']+$/g, '');
    if (!cleanTok || cleanTok.length < 10 || cleanTok === FIXED_DEFAULT_TOKEN) return;
    localStorage.setItem('ghn_bridged_token', cleanTok);

    if (els.tmBridgeStatusText) {
      const timeLabel = updatedAt ? new Date(updatedAt).toLocaleString('vi-VN') : 'Vừa xong';
      els.tmBridgeStatusText.innerHTML = `<strong style="color:#047857;">✓ Đã kết nối cầu nối Tampermonkey!</strong> Token tự động nhận từ tracuunoibo.ghn.vn lúc ${timeLabel}.`;
    }

    if (cleanTok !== state.token || !state.isTokenValid) {
      state.token = cleanTok;
      els.tokenInput.value = cleanTok;
      addLog(`⚡ Đã tự động nhận Token mới từ Tampermonkey (tracuunoibo.ghn.vn): ${cleanTok.slice(0, 8)}...`);
      const ok = await checkTokenValidity(cleanTok, false);
      if (ok) {
        if (els.cloudSyncInfoPill) {
          els.cloudSyncInfoPill.style.display = 'inline-flex';
          els.cloudSyncInfoText.textContent = 'Đã tự động bắt Token từ tracuunoibo.ghn.vn';
        }
      }
    }
  }

  async function syncWithCloudBidirectional(syncUrl, currentValidToken) {
    if (!syncUrl) return;
    const lastPushed = localStorage.getItem('ghn_last_pushed_cloud_token');
    if (currentValidToken && currentValidToken !== FIXED_DEFAULT_TOKEN && currentValidToken !== lastPushed) {
      await pushTokenToCloudSync(syncUrl, currentValidToken, false);
    }
  }

  async function fetchTokenFromCloudSync(syncUrl, isManual = false) {
    const cleanUrl = (syncUrl || DEFAULT_SYNC_URL || '').trim();
    if (!cleanUrl) {
      if (isManual) showToast('Vui lòng nhập URL Google Apps Script trước!', 'error');
      return false;
    }

    if (isManual) showToast('Đang tải Token mới nhất từ Cloud...', 'info');
    if (els.syncStatusDetail) {
      els.syncStatusDetail.textContent = 'Trạng thái: Đang kết nối tới Cloud...';
      els.syncStatusDetail.style.color = '#0284c7';
    }

    try {
      // Cache-buster query param & no custom headers to avoid CORS preflight on Google Apps Script
      const sep = cleanUrl.includes('?') ? '&' : '?';
      const fetchUrl = `${cleanUrl}${sep}_t=${Date.now()}`;

      const res = await fetch(fetchUrl, {
        method: 'GET',
        redirect: 'follow'
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch (_) {
        throw new Error('URL không trả về đúng định dạng JSON. Hãy kiểm tra quyền truy cập "Bất kỳ ai (Anyone)" khi Deploy Google Script.');
      }

      if (data && data.token && String(data.token).trim().length >= 10) {
        const remoteToken = String(data.token).trim().replace(/^["']+|["']+$/g, '');
        const timeStr = data.updated_at ? new Date(data.updated_at).toLocaleString('vi-VN') : 'Vừa xong';

        // If we already have a valid local token and Cloud has the expired default token, push our valid token instead!
        if (remoteToken === FIXED_DEFAULT_TOKEN && state.isTokenValid && state.token && state.token !== FIXED_DEFAULT_TOKEN) {
          addLog('Token trên Cloud đang là bản mặc định cũ, hệ thống tự động đẩy Token sống hiện tại lên Cloud...');
          return await pushTokenToCloudSync(cleanUrl, state.token, isManual);
        }

        state.token = remoteToken;
        els.tokenInput.value = remoteToken;

        addLog(`Đã tải Token từ Cloud (${timeStr}): ${remoteToken.slice(0, 8)}...`);
        const valid = await checkTokenValidity(remoteToken, false);

        if (valid) {
          if (els.cloudSyncInfoPill) {
            els.cloudSyncInfoPill.style.display = 'inline-flex';
            els.cloudSyncInfoText.textContent = `Đã đồng bộ tự động từ Cloud (${timeStr})`;
          }
          if (els.syncStatusDetail) {
            els.syncStatusDetail.textContent = `✓ Đã tải & kết nối Token hợp lệ từ Cloud (${timeStr})`;
            els.syncStatusDetail.style.color = '#059669';
          }
          if (isManual) {
            showToast('Đã đồng bộ và kết nối Token từ Cloud thành công!', 'success');
          }
          return true;
        } else {
          // Token on Cloud is expired! Tell the user clearly why and how to push a fresh one
          const expMsg = `Token đang lưu trên Cloud (${remoteToken.slice(0, 8)}...) đã hết hạn! Hãy mở tracuunoibo.ghn.vn để tự động đẩy Token mới lên Cloud.`;
          if (els.syncStatusDetail) {
            els.syncStatusDetail.textContent = `⚠️ ${expMsg}`;
            els.syncStatusDetail.style.color = '#dc2626';
          }
          if (els.cloudSyncInfoPill) {
            els.cloudSyncInfoPill.style.display = 'inline-flex';
            els.cloudSyncInfoText.textContent = `Token trên Cloud đã hết hạn - Cần mở tracuunoibo.ghn.vn để làm mới`;
          }
          addLog(`⚠️ ${expMsg}`, true);
          if (isManual) {
            showToast(expMsg, 'error', 6000);
          }
          return false;
        }
      } else {
        // Cloud currently has no token stored yet. If we have a valid token locally, push it!
        if (state.isTokenValid && state.token && state.token !== FIXED_DEFAULT_TOKEN) {
          addLog('Cloud chưa có Token, đang tự động đẩy Token hợp lệ hiện tại lên Cloud...');
          return await pushTokenToCloudSync(cleanUrl, state.token, isManual);
        }
        throw new Error('Trên Cloud hiện chưa có Token sống. Hãy mở tracuunoibo.ghn.vn để tự động bắt và đẩy Token mới lên Cloud.');
      }
    } catch (err) {
      if (els.syncStatusDetail) {
        els.syncStatusDetail.textContent = `Chưa tải được: ${err.message}`;
        els.syncStatusDetail.style.color = '#dc2626';
      }
      if (isManual) showToast(`Lỗi đồng bộ Cloud: ${err.message}`, 'error', 5000);
      addLog(`Lưu ý đồng bộ Cloud: ${err.message}`, true);
      return false;
    }
  }

  async function pushTokenToCloudSync(syncUrl, tokenToPush, isManual = false) {
    const cleanUrl = (syncUrl || DEFAULT_SYNC_URL || '').trim();
    const tok = (tokenToPush || els.tokenInput.value || state.token || '').trim().replace(/^["']+|["']+$/g, '');

    if (!cleanUrl) {
      if (isManual) showToast('Vui lòng nhập URL Google Apps Script trước!', 'error');
      return false;
    }
    if (!tok || tok.length < 10) {
      if (isManual) showToast('Ô nhập Token đang trống hoặc không hợp lệ!', 'error');
      return false;
    }

    // CRITICAL GUARD: Never push an expired or invalid token onto Cloud!
    if (tok === FIXED_DEFAULT_TOKEN) {
      const msg = 'Token trong ô đang là Token mặc định đã hết hạn! Vui lòng lấy Token mới từ tracuunoibo.ghn.vn trước khi đẩy lên Cloud.';
      if (els.syncStatusDetail) {
        els.syncStatusDetail.textContent = `⚠️ ${msg}`;
        els.syncStatusDetail.style.color = '#dc2626';
      }
      if (isManual) showToast(msg, 'error', 5500);
      addLog(`Từ chối đẩy Token mặc định hết hạn (${tok.slice(0, 8)}...) lên Cloud.`, true);
      return false;
    }

    // Verify with GHN API first if not yet verified
    if (!(state.isTokenValid && state.token === tok)) {
      if (els.syncStatusDetail) {
        els.syncStatusDetail.textContent = 'Trạng thái: Đang kiểm tra tính hợp lệ của Token trước khi đẩy lên Cloud...';
        els.syncStatusDetail.style.color = '#0284c7';
      }
      const isOk = await checkTokenValidity(tok, false);
      if (!isOk) {
        const msg = 'Token này đã hết hạn hoặc không hợp lệ! Hệ thống chặn không đẩy Token lỗi lên Cloud.';
        if (els.syncStatusDetail) {
          els.syncStatusDetail.textContent = `⚠️ ${msg}`;
          els.syncStatusDetail.style.color = '#dc2626';
        }
        if (isManual) showToast(msg, 'error', 5500);
        return false;
      }
    }

    if (isManual) showToast('Đang đẩy Token hợp lệ lên Cloud...', 'info');
    if (els.syncStatusDetail) {
      els.syncStatusDetail.textContent = 'Trạng thái: Đang đẩy Token lên Cloud...';
      els.syncStatusDetail.style.color = '#0284c7';
    }

    try {
      // Use GET ?token=... first (100% immune to CORS & POST redirect body loss on Google Apps Script)
      const sep = cleanUrl.includes('?') ? '&' : '?';
      const getRes = await fetch(`${cleanUrl}${sep}token=${encodeURIComponent(tok)}&_t=${Date.now()}`, {
        method: 'GET',
        redirect: 'follow'
      });

      let success = false;
      if (getRes.ok) {
        try {
          const data = await getRes.json();
          if (data && (data.code === 200 || data.message === 'Updated' || data.token === tok)) {
            success = true;
          }
        } catch (_) {
          success = true;
        }
      }

      // Fallback via POST text/plain if GET didn't update
      if (!success) {
        const res = await fetch(cleanUrl, {
          method: 'POST',
          redirect: 'follow',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify({ token: tok })
        });
        if (res.ok) success = true;
      }

      if (success) {
        localStorage.setItem('ghn_last_pushed_cloud_token', tok);
        const nowStr = new Date().toLocaleString('vi-VN');
        if (els.syncStatusDetail) {
          els.syncStatusDetail.textContent = `✓ Đã đẩy Token sống lên Cloud thành công (${nowStr})`;
          els.syncStatusDetail.style.color = '#059669';
        }
        if (els.cloudSyncInfoPill) {
          els.cloudSyncInfoPill.style.display = 'inline-flex';
          els.cloudSyncInfoText.textContent = `Đã đồng bộ Cloud (${nowStr})`;
        }
        addLog(`✓ Đã đẩy Token sống (${tok.slice(0, 8)}...) lên Cloud thành công.`);
        if (isManual) showToast('Đã đẩy Token sống lên Cloud thành công! Đội ngũ có thể sử dụng ngay.', 'success');
        return true;
      } else {
        throw new Error('Không nhận được phản hồi thành công từ Google Script.');
      }
    } catch (err) {
      if (els.syncStatusDetail) {
        els.syncStatusDetail.textContent = `Lỗi đẩy Token: ${err.message}`;
        els.syncStatusDetail.style.color = '#dc2626';
      }
      if (isManual) showToast(`Lỗi đẩy Token lên Cloud: ${err.message}`, 'error');
      addLog(`Lỗi đẩy Token lên Cloud: ${err.message}`, true);
      return false;
    }
  }

  async function checkTokenValidity(tokenToTest, showUserToast = true) {
    const cleanTok = (tokenToTest || '').trim();
    if (!cleanTok) {
      state.isTokenValid = false;
      if (showUserToast) showToast('Vui lòng nhập Token trước!', 'error');
      setTokenStatus('error', 'Chưa nhập Token');
      return false;
    }

    state.token = cleanTok;
    setTokenStatus('loading', 'Đang kiểm tra token...');

    try {
      const res = await fetch(API_USER_INFO, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'token': state.token
        }
      });

      const data = await res.json();
      if (data && data.code === 200 && data.data) {
        state.isTokenValid = true;
        state.user = data.data;
        localStorage.setItem('ghn_revert_token', state.token);

        const fullName = data.data.full_name || data.data.name || 'Nhân viên GHN';
        const empId = data.data.employee_id || data.data.user_id || data.data.id || '';

        setTokenStatus('connected', `Đã kết nối: ${fullName}`);
        els.userFullName.textContent = fullName;
        els.userIdCode.textContent = empId ? `Mã NV: ${empId}` : '';
        els.userAvatarText.textContent = fullName.trim().charAt(0).toUpperCase();
        els.userInfoBadge.style.display = 'flex';

        if (showUserToast) showToast(`Chào mừng ${fullName}! Kết nối Token thành công.`, 'success');
        addLog(`✓ Xác thực Token thành công: ${fullName} (Mã: ${empId})`);

        // Auto-push valid token to Cloud Sync if configured
        const syncUrl = getConfiguredSyncUrl();
        if (syncUrl && state.token !== localStorage.getItem('ghn_last_pushed_cloud_token')) {
          pushTokenToCloudSync(syncUrl, state.token, false);
        }

        // If user had already selected a ward before connecting token, refresh ward warehouse lookup!
        if (state.selectedWardAddress && state.selectedType !== 1) {
          fetchWardWarehouses(state.selectedWardAddress, state.selectedType);
        }

        if (state.warehouses.length === 0) {
          fetchWarehousesFromApi();
        }
        return true;
      } else {
        state.isTokenValid = false;
        const shortToken = state.token.slice(0, 8) + '...';
        setTokenStatus('error', `Token hết hạn (${shortToken}) - Cần lấy lại`);
        els.userInfoBadge.style.display = 'none';
        const msg = data.code_message_value || data.message || 'Token không hợp lệ hoặc đã hết hạn';
        if (showUserToast) {
          showToast(`${msg}. Hãy mở tracuunoibo.ghn.vn hoặc bấm "Hướng dẫn lấy Token".`, 'error', 5000);
        }
        addLog(`Token (${shortToken}) đã hết hạn hoặc không hợp lệ: ${msg}. Hãy mở trang tracuunoibo.ghn.vn để cập nhật Token mới.`, true);
        return false;
      }
    } catch (err) {
      state.isTokenValid = false;
      const shortToken = state.token.slice(0, 8) + '...';
      setTokenStatus('error', `Lỗi kiểm tra (${shortToken})`);
      els.userInfoBadge.style.display = 'none';
      if (showUserToast) showToast(`Lỗi kết nối kiểm tra Token: ${err.message}`, 'error');
      addLog(`Lỗi kiểm tra token: ${err.message}`, true);
      return false;
    }
  }

  function setTokenStatus(status, text) {
    els.tokenPill.className = 'token-status-pill';
    if (status === 'connected') els.tokenPill.classList.add('connected');
    else if (status === 'error') els.tokenPill.classList.add('error');
    els.tokenStatusText.textContent = text;
  }

  // ==========================================================================
  // WARD SELECTION & AUTO-SELECT WAREHOUSE (CHỌN PHƯỜNG/XÃ ĐÚNG)
  // ==========================================================================

  function updateWardSelectorAvailability() {
    const isCurrentHub = state.selectedType === 1;
    if (isCurrentHub) {
      els.wardSelectorBox.classList.add('disabled');
      clearWardAddress(false);
      els.wardSelectorText.textContent = 'Không áp dụng khi cập nhật Kho hiện tại';
    } else {
      els.wardSelectorBox.classList.remove('disabled');
      if (!state.selectedWardAddress) {
        els.wardSelectorText.textContent = 'Chọn phường/xã (không bắt buộc)';
      }
    }
  }

  function setWardAutofillFeedback(type, htmlText) {
    if (!els.wardAutofillFeedback) return;
    if (!type || !htmlText) {
      els.wardAutofillFeedback.className = 'ward-autofill-feedback';
      els.wardAutofillFeedback.style.display = 'none';
      els.wardAutofillFeedback.innerHTML = '';
      return;
    }
    els.wardAutofillFeedback.className = `ward-autofill-feedback ${type}`;
    els.wardAutofillFeedback.style.display = 'flex';
    els.wardAutofillFeedback.innerHTML = htmlText;
  }

  function clearWardAddress(stopEvent = false, ev = null) {
    if (stopEvent && ev) ev.stopPropagation();
    state.wardRequestId++;
    state.selectedWardAddress = null;
    state.wardWarehouses = null;
    els.wardSelectorBox.classList.remove('has-value');
    els.wardSelectorText.textContent = state.selectedType === 1
      ? 'Không áp dụng khi cập nhật Kho hiện tại'
      : 'Chọn phường/xã (không bắt buộc)';
    setWardAutofillFeedback(null, '');
  }

  function formatWardAddressDisplay(addr) {
    if (!addr) return '';
    if (addr.is_new_address) {
      return [addr.ward_name, addr.province_name].filter(Boolean).join(', ');
    }
    return [addr.ward_name, addr.district_name, addr.province_name].filter(Boolean).join(', ');
  }

  // Open Select Ward Modal
  async function openSelectWardModal() {
    if (state.selectedType === 1 || state.isProcessing) {
      if (state.selectedType === 1) {
        showToast('Tính năng tự chọn kho theo phường/xã không áp dụng cho "Kho Hiện Tại".', 'info');
      }
      return;
    }

    els.modalSelectWard.classList.add('show');

    // Load master data if not loaded yet
    if (state.wardModal.provincesOld.length === 0) {
      await loadOldProvincesAndDistricts();
    }

    // Restore previous selection if any
    const cur = state.selectedWardAddress;
    if (cur) {
      switchAddressMode(!!cur.is_new_address, false);
      if (cur.is_new_address) {
        if (state.wardModal.provincesNew.length === 0) {
          await loadNewProvincesV3();
        }
        state.wardModal.selectedNewProvince = { value: cur.province_id, label: cur.province_name };
        state.wardModal.selectedNewWard = { value: cur.ward_id, label: cur.ward_name };
        els.inputNewProvince.value = cur.province_name || '';
        els.inputNewWard.value = cur.ward_name || '';
        els.inputNewWard.disabled = false;
        loadNewWardsByProvinceV3(cur.province_id);
      } else {
        state.wardModal.selectedOldProvince = { value: cur.province_id, label: cur.province_name };
        state.wardModal.selectedOldDistrict = { value: cur.district_id, label: cur.district_name };
        state.wardModal.selectedOldWard = { value: cur.ward_code, label: cur.ward_name };
        els.inputOldProvince.value = cur.province_name || '';
        els.inputOldDistrict.value = cur.district_name || '';
        els.inputOldWard.value = cur.ward_name || '';
        els.inputOldDistrict.disabled = false;
        els.inputOldWard.disabled = false;
        loadOldWardsByDistrict(cur.district_id);
      }
    } else {
      switchAddressMode(false, true);
    }

    updateWardModalPreview();
  }

  function closeSelectWardModal() {
    els.modalSelectWard.classList.remove('show');
    closeAllWardDropdowns();
  }

  function switchAddressMode(isNew, resetSelections = true) {
    state.wardModal.isNewAddress = isNew;
    const modeItems = els.addressModeSwitch.querySelectorAll('.address-mode-item');
    modeItems.forEach(item => {
      const m = item.getAttribute('data-mode');
      item.classList.toggle('active', (isNew && m === 'new') || (!isNew && m === 'old'));
    });

    els.wardGridOld.style.display = isNew ? 'none' : 'grid';
    els.wardGridNew.style.display = isNew ? 'grid' : 'none';

    if (resetSelections) {
      state.wardModal.selectedOldProvince = null;
      state.wardModal.selectedOldDistrict = null;
      state.wardModal.selectedOldWard = null;
      state.wardModal.selectedNewProvince = null;
      state.wardModal.selectedNewWard = null;

      els.inputOldProvince.value = '';
      els.inputOldDistrict.value = '';
      els.inputOldDistrict.disabled = true;
      els.inputOldWard.value = '';
      els.inputOldWard.disabled = true;

      els.inputNewProvince.value = '';
      els.inputNewWard.value = '';
      els.inputNewWard.disabled = true;
    }

    if (isNew && state.wardModal.provincesNew.length === 0) {
      loadNewProvincesV3();
    }

    updateWardModalPreview();
  }

  function updateWardModalPreview() {
    const wm = state.wardModal;
    let isComplete = false;
    let previewStr = '';

    if (wm.isNewAddress) {
      isComplete = !!(wm.selectedNewProvince && wm.selectedNewWard);
      previewStr = [
        wm.selectedNewWard ? wm.selectedNewWard.label : '',
        wm.selectedNewProvince ? wm.selectedNewProvince.label : ''
      ].filter(Boolean).join(', ');
    } else {
      isComplete = !!(wm.selectedOldProvince && wm.selectedOldDistrict && wm.selectedOldWard);
      previewStr = [
        wm.selectedOldWard ? wm.selectedOldWard.label : '',
        wm.selectedOldDistrict ? wm.selectedOldDistrict.label : '',
        wm.selectedOldProvince ? wm.selectedOldProvince.label : ''
      ].filter(Boolean).join(', ');
    }

    if (isComplete) {
      els.wardAddressPreview.classList.remove('empty');
      els.wardAddressPreviewText.innerHTML = `<strong>${previewStr}</strong>`;
      els.btnConfirmWardModal.disabled = false;
    } else {
      els.wardAddressPreview.classList.add('empty');
      els.wardAddressPreviewText.textContent = previewStr
        ? `Đang chọn: ${previewStr} (Vui lòng chọn đủ cấp Phường/Xã)`
        : 'Chọn đầy đủ các cấp địa chỉ để xác nhận';
      els.btnConfirmWardModal.disabled = true;
    }
  }

  // --- MASTER DATA API CALLS (PROVINCE / DISTRICT / WARD) ---
  function getMasterHeaders() {
    const h = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
    if (state.token) h['token'] = state.token;
    return h;
  }

  async function loadOldProvincesAndDistricts() {
    // Try session cache first
    try {
      const cachedP = sessionStorage.getItem('ghn_old_provinces');
      const cachedD = sessionStorage.getItem('ghn_old_districts');
      if (cachedP && cachedD) {
        state.wardModal.provincesOld = JSON.parse(cachedP);
        state.wardModal.districtsOld = JSON.parse(cachedD);
        if (state.wardModal.provincesOld.length > 0 && state.wardModal.districtsOld.length > 0) {
          return;
        }
      }
    } catch (_) {}

    els.inputOldProvince.placeholder = 'Đang tải danh sách Tỉnh/TP...';
    try {
      const [resP, resD] = await Promise.all([
        fetch(API_PROVINCES_OLD, { method: 'GET', headers: getMasterHeaders() }),
        fetch(API_DISTRICTS_OLD, { method: 'GET', headers: getMasterHeaders() })
      ]);

      const dataP = await resP.json();
      const dataD = await resD.json();

      if (dataP && dataP.code === 200 && Array.isArray(dataP.data)) {
        state.wardModal.provincesOld = dataP.data.map(p => ({
          value: p.ProvinceID,
          label: p.ProvinceName
        }));
        try { sessionStorage.setItem('ghn_old_provinces', JSON.stringify(state.wardModal.provincesOld)); } catch (_) {}
      }

      if (dataD && dataD.code === 200 && Array.isArray(dataD.data)) {
        state.wardModal.districtsOld = dataD.data.map(d => ({
          value: d.DistrictID,
          label: d.DistrictName,
          provinceId: d.ProvinceID
        }));
        try { sessionStorage.setItem('ghn_old_districts', JSON.stringify(state.wardModal.districtsOld)); } catch (_) {}
      }
    } catch (err) {
      addLog(`Lỗi tải danh mục Tỉnh/Quận: ${err.message}`, true);
      showToast('Không thể tải danh mục Tỉnh/Thành phố. Hãy kiểm tra kết nối hoặc Token!', 'error');
    } finally {
      els.inputOldProvince.placeholder = 'Tìm kiếm Tỉnh - Thành phố';
    }
  }

  async function loadOldWardsByDistrict(districtId) {
    if (!districtId) return;
    els.inputOldWard.placeholder = 'Đang tải Phường - Xã...';
    els.inputOldWard.disabled = true;
    state.wardModal.wardsOld = [];

    try {
      const res = await fetch(`${API_WARDS_OLD}?district_id=${encodeURIComponent(districtId)}`, {
        method: 'GET',
        headers: getMasterHeaders()
      });
      const data = await res.json();
      if (data && data.code === 200 && Array.isArray(data.data)) {
        state.wardModal.wardsOld = data.data.map(w => ({
          value: w.WardCode,
          label: w.WardName
        }));
      }
    } catch (err) {
      addLog(`Lỗi tải danh mục Phường/Xã: ${err.message}`, true);
    } finally {
      els.inputOldWard.placeholder = 'Tìm kiếm Phường - Xã';
      els.inputOldWard.disabled = false;
    }
  }

  async function loadNewProvincesV3() {
    els.inputNewProvince.placeholder = 'Đang tải Tỉnh/TP mới...';
    try {
      const res = await fetch(API_PROVINCES_NEW, {
        method: 'POST',
        headers: getMasterHeaders(),
        body: JSON.stringify({ offset: 0, limit: 200 })
      });
      const data = await res.json();
      if (data && data.code === 200 && Array.isArray(data.data)) {
        state.wardModal.provincesNew = data.data.map(p => ({
          value: p._id,
          label: p.name
        }));
      }
    } catch (err) {
      addLog(`Lỗi tải Tỉnh/TP (Địa chỉ mới): ${err.message}`, true);
    } finally {
      els.inputNewProvince.placeholder = 'Tìm kiếm Tỉnh - Thành phố';
    }
  }

  async function loadNewWardsByProvinceV3(provinceId) {
    if (!provinceId) return;
    els.inputNewWard.placeholder = 'Đang tải Phường - Xã mới...';
    els.inputNewWard.disabled = true;
    state.wardModal.wardsNew = [];

    try {
      let all = [];
      let offset = 0;
      const limit = 200;

      while (true) {
        const res = await fetch(API_WARDS_NEW, {
          method: 'POST',
          headers: getMasterHeaders(),
          body: JSON.stringify({ province_id: provinceId, offset, limit })
        });
        const data = await res.json();
        const chunk = (data && data.code === 200 && Array.isArray(data.data)) ? data.data : [];
        all = all.concat(chunk);
        if (chunk.length < limit) break;
        offset += limit;
      }

      state.wardModal.wardsNew = all.map(w => ({
        value: w._id,
        label: w.name
      }));
    } catch (err) {
      addLog(`Lỗi tải Phường/Xã (Địa chỉ mới): ${err.message}`, true);
    } finally {
      els.inputNewWard.placeholder = 'Tìm kiếm Phường - Xã';
      els.inputNewWard.disabled = false;
    }
  }

  // --- SEARCHABLE SELECT DROPDOWN HELPER FOR WARD MODAL ---
  function closeAllWardDropdowns() {
    [
      els.dropdownOldProvince,
      els.dropdownOldDistrict,
      els.dropdownOldWard,
      els.dropdownNewProvince,
      els.dropdownNewWard
    ].forEach(d => {
      if (d) d.classList.remove('show');
    });
  }

  function renderWardSelectDropdown(dropdownEl, options, query, selectedValue, onSelect) {
    if (!dropdownEl) return;
    dropdownEl.innerHTML = '';

    const cleanQ = removeVietnameseTones((query || '').trim());
    const filtered = cleanQ
      ? options.filter(opt => removeVietnameseTones(opt.label).includes(cleanQ))
      : options;

    if (!filtered || filtered.length === 0) {
      dropdownEl.innerHTML = '<div class="ward-select-empty">Không có dữ liệu phù hợp</div>';
      dropdownEl.classList.add('show');
      return;
    }

    const frag = document.createDocumentFragment();
    filtered.forEach(opt => {
      const div = document.createElement('div');
      div.className = 'ward-select-option' + (opt.value === selectedValue ? ' selected' : '');
      div.textContent = opt.label;
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownEl.classList.remove('show');
        onSelect(opt);
      });
      frag.appendChild(div);
    });

    dropdownEl.appendChild(frag);
    dropdownEl.classList.add('show');
  }

  function handleConfirmWardModal() {
    const wm = state.wardModal;
    let payload = null;

    if (wm.isNewAddress) {
      if (!wm.selectedNewProvince || !wm.selectedNewWard) return;
      payload = {
        is_new_address: true,
        province_id: wm.selectedNewProvince.value,
        province_name: wm.selectedNewProvince.label,
        ward_id: wm.selectedNewWard.value,
        ward_name: wm.selectedNewWard.label
      };
    } else {
      if (!wm.selectedOldProvince || !wm.selectedOldDistrict || !wm.selectedOldWard) return;
      payload = {
        is_new_address: false,
        province_id: wm.selectedOldProvince.value,
        province_name: wm.selectedOldProvince.label,
        district_id: wm.selectedOldDistrict.value,
        district_name: wm.selectedOldDistrict.label,
        ward_code: wm.selectedOldWard.value,
        ward_name: wm.selectedOldWard.label
      };
    }

    state.selectedWardAddress = payload;
    state.wardWarehouses = null;
    els.wardSelectorBox.classList.add('has-value');
    els.wardSelectorText.textContent = formatWardAddressDisplay(payload);

    closeSelectWardModal();
    addLog(`Đã chọn Phường/Xã: ${formatWardAddressDisplay(payload)}`);

    // Trigger auto warehouse lookup by ward
    fetchWardWarehouses(payload, state.selectedType);
  }

  // --- FETCH WAREHOUSES BY WARD & AUTOFILL WAREHOUSE ---
  async function fetchWardWarehouses(wardAddr, warehouseType) {
    if (!wardAddr || warehouseType === 1) return;

    const hasWardKey = wardAddr.is_new_address ? !!wardAddr.ward_id : !!wardAddr.ward_code;
    if (!hasWardKey) return;

    const reqId = ++state.wardRequestId;
    setWardAutofillFeedback(
      'loading',
      `<i class="fa-solid fa-spinner fa-spin"></i> <span>Đang tự động tra cứu <strong>${WAREHOUSE_TYPE_NAMES[warehouseType]}</strong> phụ trách khu vực <strong>${wardAddr.ward_name}</strong>...</span>`
    );

    const queryStr = wardAddr.is_new_address
      ? `new_ward_id=${encodeURIComponent(wardAddr.ward_id)}`
      : `ward_code=${encodeURIComponent(wardAddr.ward_code)}`;

    try {
      const res = await fetch(`${API_WAREHOUSES_BY_WARD}?${queryStr}`, {
        method: 'GET',
        headers: getMasterHeaders()
      });

      const data = await res.json();
      if (reqId !== state.wardRequestId) return;

      if (data && data.code === 200 && data.data) {
        const list = Array.isArray(data.data.warehouses) ? data.data.warehouses : [];
        state.wardWarehouses = list;
        autofillWarehouse(list, warehouseType);
      } else {
        throw new Error(data.code_message_value || data.message || 'Không tra được kho từ API');
      }
    } catch (err) {
      if (reqId !== state.wardRequestId) return;

      // Fallback: Try matching locally from bundled 1,658 warehouses by District / Province / Ward name
      const localMatches = fallbackMatchWarehouseByAddress(wardAddr);
      if (localMatches.length > 0) {
        const chosen = localMatches[0];
        selectWarehouse(chosen, true);
        setWardAutofillFeedback(
          'warning',
          `<i class="fa-solid fa-circle-info"></i> <span>Đã tự động gợi ý kho theo địa bàn: <strong>${chosen.name} (ID: ${chosen.id})</strong>. ${!state.isTokenValid ? '<em>(Hãy kết nối Token hợp lệ để tra cứu chính xác 100% từ hệ thống GHN)</em>' : ''}</span>`
        );
        return;
      }

      setWardAutofillFeedback(
        'error',
        `<i class="fa-solid fa-triangle-exclamation"></i> <span>Không tra được kho theo phường/xã đã chọn (${err.message}), vui lòng kiểm tra Token hoặc chọn kho thủ công.</span>`
      );
      addLog(`Lỗi tra cứu kho theo phường/xã: ${err.message}`, true);
    }
  }

  function autofillWarehouse(wardWarehousesList, warehouseType) {
    const typeKey = WARD_WAREHOUSE_TYPE_MAP[warehouseType];
    if (!typeKey) return;

    const matching = (wardWarehousesList || []).filter(w => w.type === typeKey);
    const typeLabel = WAREHOUSE_TYPE_NAMES[warehouseType] || 'Kho';

    if (matching.length === 0) {
      clearSelectedWarehouse();
      setWardAutofillFeedback(
        'error',
        `<i class="fa-solid fa-circle-xmark"></i> <span>Không tìm thấy <strong>${typeLabel}</strong> phù hợp cho phường/xã này, vui lòng chọn kho thủ công.</span>`
      );
      return;
    }

    // Exact logic from official GHN bundle: prefer group === 'standard', else first item
    const chosenRaw = matching.find(w => w.group === 'standard') || matching[0];

    // Enrich with address from state.warehouses if available
    const fullWh = state.warehouses.find(w => Number(w.id) === Number(chosenRaw.warehouse_id)) || {
      id: chosenRaw.warehouse_id,
      name: chosenRaw.warehouse_name,
      address: formatWardAddressDisplay(state.selectedWardAddress)
    };

    selectWarehouse({
      id: chosenRaw.warehouse_id,
      name: chosenRaw.warehouse_name || fullWh.name,
      address: fullWh.address || formatWardAddressDisplay(state.selectedWardAddress)
    }, true);

    if (matching.length > 1) {
      const msg = `Phường/xã này có ${matching.length} kho phụ trách, hệ thống đã chọn ${chosenRaw.warehouse_name}. Vui lòng kiểm tra lại nếu chưa đúng.`;
      showToast(msg, 'info', 4500);
      setWardAutofillFeedback(
        'warning',
        `<i class="fa-solid fa-circle-check"></i> <span>Phường/xã này có <strong>${matching.length} kho phụ trách</strong>, hệ thống đã tự chọn: <strong>${chosenRaw.warehouse_name} (ID: ${chosenRaw.warehouse_id})</strong>. Bấm vào ô Chọn kho bên dưới nếu muốn đổi sang kho phụ trách khác.</span>`
      );
    } else {
      setWardAutofillFeedback(
        'success',
        `<i class="fa-solid fa-circle-check"></i> <span>Hệ thống đã tự động chọn đúng ${typeLabel}: <strong>${chosenRaw.warehouse_name} (ID: ${chosenRaw.warehouse_id})</strong></span>`
      );
    }
  }

  function fallbackMatchWarehouseByAddress(wardAddr) {
    if (!wardAddr || !state.warehouses.length) return [];
    const stripPrefix = (s) => removeVietnameseTones(s || '')
      .replace(/^(tinh|thanh pho|tp|quan|huyen|thi xa|tx|phuong|xa|thi tran|tt)\s+/i, '')
      .trim();

    const pNorm = stripPrefix(wardAddr.province_name);
    const dNorm = stripPrefix(wardAddr.district_name);
    const wNorm = stripPrefix(wardAddr.ward_name);

    const scored = [];
    for (const wh of state.warehouses) {
      const text = removeVietnameseTones(`${wh.name || ''} ${wh.address || ''}`);
      if (pNorm && !text.includes(pNorm)) continue;

      let score = 0;
      if (pNorm && text.includes(pNorm)) score += 2;
      if (dNorm && text.includes(dNorm)) score += 5;
      if (wNorm && text.includes(wNorm)) score += 8;

      if (score >= 7) {
        scored.push({ wh, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.wh);
  }

  // ==========================================================================
  // WAREHOUSE DATA & COMBOBOX
  // ==========================================================================
  async function initWarehouses() {
    // 1. First check pre-bundled warehouses.data.js
    if (window.GHN_DEFAULT_WAREHOUSES && Array.isArray(window.GHN_DEFAULT_WAREHOUSES) && window.GHN_DEFAULT_WAREHOUSES.length > 0) {
      state.warehouses = window.GHN_DEFAULT_WAREHOUSES;
      updateWarehouseCountDisplay();
      addLog(`Đã tải sẵn ${state.warehouses.length} bưu cục/kho từ bộ nhớ.`);
      return;
    }

    // 2. Check localStorage cache
    try {
      const cached = localStorage.getItem('ghn_cached_warehouses');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 500) {
          state.warehouses = parsed;
          updateWarehouseCountDisplay();
          addLog(`Đã tải ${state.warehouses.length} bưu cục từ bộ nhớ đệm.`);
          return;
        }
      }
    } catch (_) {}

    // 3. Fallback: try fetching from warehouses.json
    try {
      const res = await fetch('./warehouses.json');
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && json.length > 0) {
          state.warehouses = json;
          updateWarehouseCountDisplay();
          addLog(`Đã tải ${state.warehouses.length} bưu cục từ warehouses.json.`);
          return;
        }
      }
    } catch (_) {}

    // 4. Fallback to API directly
    fetchWarehousesFromApi();
  }

  async function fetchWarehousesFromApi() {
    els.whTotalCount.textContent = 'Đang tải danh mục kho từ GHN...';
    try {
      const res = await fetch(`${API_WAREHOUSES}?offset=0&limit=1000`, {
        headers: { 'Accept': 'application/json' }
      });
      const data = await res.json();
      if (data && data.code === 200 && data.data && data.data.warehouses) {
        let list = data.data.warehouses.map(w => ({
          id: w.locationId,
          name: w.locationName,
          address: w.address
        }));

        if (data.data.total > 1000) {
          const res2 = await fetch(`${API_WAREHOUSES}?offset=1000&limit=1000`, {
            headers: { 'Accept': 'application/json' }
          });
          const data2 = await res2.json();
          if (data2 && data2.code === 200 && data2.data && data2.data.warehouses) {
            list = list.concat(data2.data.warehouses.map(w => ({
              id: w.locationId,
              name: w.locationName,
              address: w.address
            })));
          }
        }

        state.warehouses = list;
        updateWarehouseCountDisplay();
        addLog(`Đã đồng bộ ${list.length} bưu cục từ GHN API.`);
        try {
          localStorage.setItem('ghn_cached_warehouses', JSON.stringify(list));
        } catch (_) {}
      }
    } catch (err) {
      els.whTotalCount.textContent = 'Chưa tải được danh mục kho';
      addLog(`Không thể tải bưu cục từ API: ${err.message}`, true);
    }
  }

  function updateWarehouseCountDisplay() {
    els.whTotalCount.textContent = `Hệ thống có sẵn ${state.warehouses.length} kho/bưu cục`;
  }

  function getWardSpecificWarehousesForCurrentType() {
    const typeKey = WARD_WAREHOUSE_TYPE_MAP[state.selectedType];
    if (!state.selectedWardAddress || !state.wardWarehouses || !typeKey) return [];
    return state.wardWarehouses
      .filter(w => w.type === typeKey)
      .map(w => {
        const full = state.warehouses.find(item => Number(item.id) === Number(w.warehouse_id));
        return {
          id: w.warehouse_id,
          name: w.warehouse_name || (full ? full.name : 'Bưu cục GHN'),
          address: full ? full.address : formatWardAddressDisplay(state.selectedWardAddress),
          isWardMatch: true,
          group: w.group
        };
      });
  }

  function filterWarehouses(keyword) {
    const wardMatches = getWardSpecificWarehousesForCurrentType();

    // If user hasn't typed a custom search keyword (or input still matches currently selected warehouse), prioritize ward warehouses just like official GHN page
    const currentSelectedDisplay = state.selectedWarehouse
      ? `${state.selectedWarehouse.name} (ID: ${state.selectedWarehouse.id})`
      : '';
    const effectiveKw = (keyword && keyword.trim() !== currentSelectedDisplay) ? keyword.trim() : '';

    if (!effectiveKw) {
      if (wardMatches.length > 0) {
        const wardIds = new Set(wardMatches.map(w => Number(w.id)));
        const others = state.warehouses.filter(w => !wardIds.has(Number(w.id))).slice(0, 25);
        return [...wardMatches, ...others];
      }
      return state.warehouses.slice(0, 30);
    }

    const cleanKw = removeVietnameseTones(effectiveKw);
    const isNumber = /^\d+$/.test(effectiveKw);
    const wardIdSet = new Set(wardMatches.map(w => Number(w.id)));

    const matches = [];
    for (let i = 0; i < state.warehouses.length; i++) {
      const wh = state.warehouses[i];
      if (!wh) continue;

      const idStr = String(wh.id || '');
      const nameNorm = removeVietnameseTones(wh.name || '');
      const addrNorm = removeVietnameseTones(wh.address || '');

      let matched = false;
      if (isNumber && idStr.includes(effectiveKw)) {
        matched = true;
      } else if (nameNorm.includes(cleanKw) || addrNorm.includes(cleanKw) || idStr.includes(cleanKw)) {
        matched = true;
      }

      if (matched) {
        matches.push({
          ...wh,
          isWardMatch: wardIdSet.has(Number(wh.id))
        });
        if (matches.length >= 50) break;
      }
    }

    return matches;
  }

  function renderWarehouseDropdown(list) {
    els.whDropdown.innerHTML = '';

    if (!list || list.length === 0) {
      els.whDropdown.innerHTML = '<div class="combobox-empty">Không tìm thấy kho nào phù hợp</div>';
      els.whDropdown.classList.add('show');
      return;
    }

    const frag = document.createDocumentFragment();
    list.forEach(wh => {
      const item = document.createElement('div');
      item.className = 'combobox-item';
      const wardBadge = wh.isWardMatch
        ? `<span class="combobox-item-badge-ward">Kho phụ trách Phường/Xã đã chọn</span>`
        : '';
      item.innerHTML = `
        <div class="combobox-item-top">
          <span class="combobox-item-name">${wh.name || 'Bưu cục GHN'}${wardBadge}</span>
          <span class="combobox-item-code">ID: ${wh.id}</span>
        </div>
        <div class="combobox-item-addr">${wh.address || 'Chưa cập nhật địa chỉ'}</div>
      `;

      item.addEventListener('click', () => {
        selectWarehouse(wh, false);
      });

      frag.appendChild(item);
    });

    els.whDropdown.appendChild(frag);
    els.whDropdown.classList.add('show');
  }

  function selectWarehouse(wh, isAutoFromWard = false) {
    state.selectedWarehouse = wh;
    els.whSearchInput.value = `${wh.name} (ID: ${wh.id})`;
    els.whClearBtn.style.display = 'block';
    els.whDropdown.classList.remove('show');

    // Update preview card
    els.previewWhName.textContent = wh.name;
    els.previewWhMeta.textContent = wh.address || 'Chưa cập nhật địa chỉ';
    els.previewWhBadge.textContent = `ID: ${wh.id}`;
    els.previewWhBadge.style.display = 'inline-block';
    els.selectedWhPreview.classList.add('active');

    addLog(`${isAutoFromWard ? '🎯 Hệ thống tự chọn kho theo Phường/Xã' : 'Đã chọn kho đích'}: ${wh.name} (ID: ${wh.id})`);
  }

  function clearSelectedWarehouse() {
    state.selectedWarehouse = null;
    els.whSearchInput.value = '';
    els.whClearBtn.style.display = 'none';
    els.whDropdown.classList.remove('show');

    els.previewWhName.textContent = 'Chưa chọn kho chuyển sang';
    els.previewWhMeta.textContent = 'Vui lòng chọn Phường/Xã ở trên hoặc tìm bưu cục từ danh sách';
    els.previewWhBadge.style.display = 'none';
    els.selectedWhPreview.classList.remove('active');
  }

  // --- ORDERS PARSING & CLEANING ---
  function parseOrderCodes(text) {
    if (!text) return [];

    const rawTokens = text.split(/[\r\n,;\t]+/);
    const set = new Set();
    const cleanList = [];

    for (let raw of rawTokens) {
      let code = raw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      if (code && code.length >= 4) {
        if (!set.has(code)) {
          set.add(code);
          cleanList.push(code);
        }
      }
    }

    return cleanList;
  }

  function updateOrderCounter() {
    const list = parseOrderCodes(els.ordersTextarea.value);
    state.orders = list;
    els.orderCounterBadge.textContent = `${list.length} đơn`;
    return list;
  }

  function cleanOrderInput() {
    const list = updateOrderCounter();
    if (list.length === 0) {
      showToast('Danh sách đơn đang trống!', 'info');
      return;
    }
    els.ordersTextarea.value = list.join('\n');
    showToast(`Đã chuẩn hóa và lọc trùng: còn ${list.length} đơn hợp lệ`, 'success');
  }

  // --- EXCEL FILE IMPORT ---
  function handleExcelImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];

        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const importedCodes = [];

        for (let row of rows) {
          if (Array.isArray(row)) {
            for (let cell of row) {
              if (cell !== undefined && cell !== null) {
                const str = String(cell).trim().toUpperCase();
                if (/^[A-Z0-9_-]{5,25}$/.test(str)) {
                  importedCodes.push(str);
                }
              }
            }
          }
        }

        if (importedCodes.length === 0) {
          showToast('Không tìm thấy mã đơn hàng nào trong file!', 'error');
          return;
        }

        const existing = parseOrderCodes(els.ordersTextarea.value);
        const combined = Array.from(new Set([...existing, ...importedCodes]));
        els.ordersTextarea.value = combined.join('\n');
        updateOrderCounter();

        showToast(`Đã nhập thành công ${importedCodes.length} mã đơn từ file Excel!`, 'success');
        addLog(`Đã tải file Excel "${file.name}": nhận ${importedCodes.length} mã đơn.`);
      } catch (err) {
        showToast(`Lỗi đọc file Excel: ${err.message}`, 'error');
      } finally {
        els.excelFileInput.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // --- VALIDATION BEFORE EXECUTION ---
  function validateForm() {
    if (!state.token) {
      showToast('Vui lòng nhập và kết nối Token GHN trước khi thao tác!', 'error');
      els.tokenInput.focus();
      return false;
    }

    const orders = updateOrderCounter();
    if (orders.length === 0) {
      showToast('Vui lòng nhập ít nhất 1 mã đơn hàng hợp lệ!', 'error');
      els.ordersTextarea.focus();
      return false;
    }

    if (!state.selectedWarehouse || !state.selectedWarehouse.id) {
      showToast('Vui lòng chọn Phường/Xã hoặc chọn Kho chuyển sang!', 'error');
      els.whSearchInput.focus();
      return false;
    }

    const reasonKey = els.reasonSelect.value;
    if (reasonKey === 'other_reason') {
      const customReason = els.customReasonTextarea.value.trim();
      if (!customReason) {
        showToast('Vui lòng nhập diễn giải lý do đổi kho!', 'error');
        els.customReasonTextarea.focus();
        return false;
      }
    }

    return true;
  }

  // --- CONFIRMATION MODAL & EXECUTION ---
  function openConfirmModal() {
    if (!validateForm()) return;

    const orders = updateOrderCounter();
    const typeName = WAREHOUSE_TYPE_NAMES[state.selectedType] || 'Kho giao';
    const whName = `${state.selectedWarehouse.name} (ID: ${state.selectedWarehouse.id})`;

    let reasonText = REASON_LABELS[els.reasonSelect.value] || els.reasonSelect.value;
    if (els.reasonSelect.value === 'other_reason') {
      reasonText = els.customReasonTextarea.value.trim();
    }

    els.confirmOrderCount.textContent = orders.length;
    els.confirmWhType.textContent = typeName;
    els.confirmWhDest.textContent = whName;
    els.confirmReason.textContent = reasonText;

    els.modalConfirm.classList.add('show');
  }

  function closeConfirmModal() {
    els.modalConfirm.classList.remove('show');
  }

  async function executeBatchUpdate() {
    closeConfirmModal();

    const orders = updateOrderCounter();
    const whId = state.selectedWarehouse.id;
    const whType = state.selectedType;
    const batchSize = parseInt(els.batchSizeSelect.value, 10) || 50;

    let reasonText = REASON_LABELS[els.reasonSelect.value] || els.reasonSelect.value;
    if (els.reasonSelect.value === 'other_reason') {
      reasonText = els.customReasonTextarea.value.trim();
    }

    state.isProcessing = true;
    state.shouldStop = false;

    state.results.success = [];
    state.results.eform = [];
    state.results.failed = [];
    renderResultsTables();

    els.progressCard.style.display = 'block';
    els.btnUpdateWarehouse.disabled = true;
    els.btnStopExecution.style.display = 'inline-flex';
    els.btnExportExcel.style.display = 'none';
    els.btnClearResults.style.display = 'inline-flex';

    addLog(`=== BẮT ĐẦU CẬP NHẬT: ${orders.length} ĐƠN SANG ${state.selectedWarehouse.name} (ID: ${whId}) ===`);

    const totalOrders = orders.length;
    let processedCount = 0;

    const chunks = [];
    for (let i = 0; i < orders.length; i += batchSize) {
      chunks.push(orders.slice(i, i + batchSize));
    }

    for (let bIndex = 0; bIndex < chunks.length; bIndex++) {
      if (state.shouldStop) {
        addLog(`⚠️ Người dùng đã yêu cầu dừng tiến trình thao tác.`, true);
        showToast('Đã dừng thao tác cập nhật theo yêu cầu!', 'warning');
        break;
      }

      const chunk = chunks[bIndex];
      els.progressStatusText.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý nhóm ${bIndex + 1}/${chunks.length} (${chunk.length} đơn)...`;

      try {
        const payload = {
          order_codes: chunk,
          warehouse_id: whId,
          type: whType,
          reason: reasonText
        };

        const res = await fetch(API_UPDATE_ORDERS, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'token': state.token
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        const nowStr = new Date().toLocaleTimeString('vi-VN');

        if (data && data.code === 200 && data.data) {
          const resData = data.data;

          if (Array.isArray(resData.success_order_codes)) {
            resData.success_order_codes.forEach(code => {
              state.results.success.push({
                code: code,
                type: WAREHOUSE_TYPE_NAMES[whType],
                whName: state.selectedWarehouse.name,
                whId: whId,
                reason: reasonText,
                time: nowStr
              });
            });
          }

          if (Array.isArray(resData.wait_for_approve_order_codes)) {
            resData.wait_for_approve_order_codes.forEach(code => {
              state.results.eform.push({
                code: code,
                type: WAREHOUSE_TYPE_NAMES[whType],
                whName: state.selectedWarehouse.name,
                whId: whId,
                status: 'Chờ duyệt Eform',
                reason: reasonText,
                time: nowStr
              });
            });
          }

          if (Array.isArray(resData.fail_order_codes)) {
            resData.fail_order_codes.forEach(item => {
              state.results.failed.push({
                code: item.order_code,
                error: item.err_msg || 'Cập nhật kho thất bại',
                time: nowStr
              });
            });
          }

          addLog(`Nhóm ${bIndex + 1}: Thành công ${resData.success_order_codes?.length || 0}, Chờ Eform ${resData.wait_for_approve_order_codes?.length || 0}, Lỗi ${resData.fail_order_codes?.length || 0}`);
        } else {
          const errMsg = data.code_message_value || data.message || 'Lỗi gọi API GHN';
          chunk.forEach(code => {
            state.results.failed.push({
              code: code,
              error: errMsg,
              time: nowStr
            });
          });
          addLog(`Nhóm ${bIndex + 1} lỗi: ${errMsg}`, true);
        }
      } catch (err) {
        const nowStr = new Date().toLocaleTimeString('vi-VN');
        chunk.forEach(code => {
          state.results.failed.push({
            code: code,
            error: err.message || 'Lỗi kết nối mạng',
            time: nowStr
          });
        });
        addLog(`Lỗi mạng tại nhóm ${bIndex + 1}: ${err.message}`, true);
      }

      processedCount += chunk.length;
      const pct = Math.min(100, Math.round((processedCount / totalOrders) * 100));
      els.progressBarFill.style.width = `${pct}%`;
      els.progressPercent.textContent = `${pct}%`;

      renderResultsTables();

      if (bIndex < chunks.length - 1 && !state.shouldStop) {
        await new Promise(r => setTimeout(r, 400));
      }
    }

    state.isProcessing = false;
    els.btnUpdateWarehouse.disabled = false;
    els.btnStopExecution.style.display = 'none';
    els.btnStopExecution.innerHTML = '<i class="fa-solid fa-stop"></i> Dừng';
    els.btnExportExcel.style.display = 'inline-flex';
    els.progressStatusText.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--success);"></i> Đã hoàn thành quá trình cập nhật!`;

    const summaryMsg = `Hoàn tất! Thành công: ${state.results.success.length}, Chờ Eform: ${state.results.eform.length}, Thất bại: ${state.results.failed.length}`;
    showToast(summaryMsg, state.results.failed.length === 0 ? 'success' : 'info', 5000);
    addLog(`=== ${summaryMsg} ===`);
  }

  // --- RENDER RESULTS TABLES ---
  function renderResultsTables() {
    els.tabCountSuccess.textContent = state.results.success.length;
    els.tabCountEform.textContent = state.results.eform.length;
    els.tabCountFailed.textContent = state.results.failed.length;

    if (state.results.success.length > 0) {
      els.emptySuccess.style.display = 'none';
      els.tableWrapSuccess.style.display = 'block';
      els.tbodySuccess.innerHTML = state.results.success.map((it, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><strong style="color: #0f172a; font-family: monospace;">${it.code}</strong></td>
          <td><span class="tab-badge badge-success">${it.type}</span></td>
          <td>${it.whName}</td>
          <td style="color: var(--text-muted);">${it.time}</td>
        </tr>
      `).join('');
    } else {
      els.emptySuccess.style.display = 'block';
      els.tableWrapSuccess.style.display = 'none';
    }

    if (state.results.eform.length > 0) {
      els.emptyEform.style.display = 'none';
      els.tableWrapEform.style.display = 'block';
      els.tbodyEform.innerHTML = state.results.eform.map((it, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><strong style="color: #0f172a; font-family: monospace;">${it.code}</strong></td>
          <td><span class="tab-badge badge-warning">${it.status}</span></td>
          <td>${it.whName}</td>
          <td style="color: var(--text-muted);">${it.time}</td>
        </tr>
      `).join('');
    } else {
      els.emptyEform.style.display = 'block';
      els.tableWrapEform.style.display = 'none';
    }

    if (state.results.failed.length > 0) {
      els.emptyFailed.style.display = 'none';
      els.tableWrapFailed.style.display = 'block';
      els.tbodyFailed.innerHTML = state.results.failed.map((it, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><strong style="color: #b91c1c; font-family: monospace;">${it.code}</strong></td>
          <td style="color: #dc2626;">${it.error}</td>
          <td style="color: var(--text-muted);">${it.time}</td>
        </tr>
      `).join('');
    } else {
      els.emptyFailed.style.display = 'block';
      els.tableWrapFailed.style.display = 'none';
    }
  }

  // --- EXCEL EXPORT ---
  function exportResultsToExcel() {
    const total = state.results.success.length + state.results.eform.length + state.results.failed.length;
    if (total === 0) {
      showToast('Chưa có dữ liệu kết quả để xuất!', 'info');
      return;
    }

    const rows = [];
    rows.push([
      'STT',
      'Mã Đơn Hàng',
      'Trạng Thái',
      'Loại Kho Cập Nhật',
      'Mã Kho Đích',
      'Tên Kho Đích',
      'Phường/Xã Đã Chọn',
      'Lý Do',
      'Thông Báo / Chi Tiết Lỗi',
      'Thời Gian Thao Tác'
    ]);

    let stt = 1;
    const wardStr = formatWardAddressDisplay(state.selectedWardAddress);

    state.results.success.forEach(item => {
      rows.push([
        stt++,
        item.code,
        'Thành công',
        item.type,
        item.whId,
        item.whName,
        wardStr,
        item.reason,
        'Cập nhật kho hoàn tất',
        item.time
      ]);
    });

    state.results.eform.forEach(item => {
      rows.push([
        stt++,
        item.code,
        'Chờ duyệt Eform',
        item.type,
        item.whId,
        item.whName,
        wardStr,
        item.reason,
        'Đã gửi yêu cầu Eform duyệt chuyển kho',
        item.time
      ]);
    });

    state.results.failed.forEach(item => {
      rows.push([
        stt++,
        item.code,
        'Thất bại',
        WAREHOUSE_TYPE_NAMES[state.selectedType],
        state.selectedWarehouse ? state.selectedWarehouse.id : '',
        state.selectedWarehouse ? state.selectedWarehouse.name : '',
        wardStr,
        '',
        item.error,
        item.time
      ]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ket_Qua_Chuyen_Kho');

    const now = new Date();
    const timeCode = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const fileName = `GHN_Revert_Kho_${timeCode}.xlsx`;

    XLSX.writeFile(workbook, fileName);
    showToast(`Đã xuất file Excel: ${fileName}`, 'success');
    addLog(`Đã xuất báo cáo Excel "${fileName}" với ${total} đơn.`);
  }

  // --- COPY HELPERS ---
  function copyToClipboard(text, successMessage) {
    if (!text) {
      showToast('Không có dữ liệu để copy!', 'info');
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMessage, 'success');
    }).catch(() => {
      showToast('Lỗi khi copy vào clipboard', 'error');
    });
  }

  // --- EVENT LISTENERS INITIALIZATION ---
  function initEvents() {
    // 1. Token Input & Visibility Toggle
    els.btnToggleToken.addEventListener('click', () => {
      const isPassword = els.tokenInput.type === 'password';
      els.tokenInput.type = isPassword ? 'text' : 'password';
      els.btnToggleToken.innerHTML = isPassword ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
    });

    els.btnSaveToken.addEventListener('click', () => {
      const val = els.tokenInput.value.trim();
      if (!val) {
        showToast('Vui lòng nhập Token!', 'error');
        return;
      }
      checkTokenValidity(val, true);
    });

    els.btnCheckToken.addEventListener('click', () => {
      const val = els.tokenInput.value.trim();
      checkTokenValidity(val, true);
    });

    // 2. Orders Textarea & Actions
    els.ordersTextarea.addEventListener('input', () => {
      updateOrderCounter();
    });

    els.btnPasteClipboard.addEventListener('click', async () => {
      try {
        const clipText = await navigator.clipboard.readText();
        if (!clipText || !clipText.trim()) {
          showToast('Bộ nhớ tạm đang trống!', 'info');
          return;
        }
        const existing = els.ordersTextarea.value.trim();
        els.ordersTextarea.value = existing ? `${existing}\n${clipText}` : clipText;
        updateOrderCounter();
        showToast('Đã dán dữ liệu từ Clipboard!', 'success');
      } catch (_) {
        showToast('Không thể truy cập Clipboard trình duyệt.', 'error');
      }
    });

    els.excelFileInput.addEventListener('change', handleExcelImport);
    els.btnCleanOrders.addEventListener('click', cleanOrderInput);
    els.btnClearOrders.addEventListener('click', () => {
      if (!els.ordersTextarea.value.trim()) return;
      if (confirm('Bạn có chắc chắn muốn xóa toàn bộ danh sách đơn?')) {
        els.ordersTextarea.value = '';
        updateOrderCounter();
        showToast('Đã xóa toàn bộ đơn.', 'info');
      }
    });

    // 3. Warehouse Type Radio Cards
    els.typeCards.forEach(card => {
      card.addEventListener('click', () => {
        els.typeCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;

        const newType = parseInt(card.getAttribute('data-type'), 10);
        state.selectedType = newType;
        addLog(`Đã chọn loại cập nhật: ${WAREHOUSE_TYPE_NAMES[state.selectedType]}`);

        updateWardSelectorAvailability();

        // If a ward is already selected and switching between Pick / Deliver / Return, re-autofill warehouse immediately!
        if (newType !== 1 && state.selectedWardAddress) {
          if (state.wardWarehouses) {
            autofillWarehouse(state.wardWarehouses, newType);
          } else {
            fetchWardWarehouses(state.selectedWardAddress, newType);
          }
        }
      });
    });

    // 3.5. Ward Selector Box & Modal Listeners
    if (els.wardSelectorBox) {
      els.wardSelectorBox.addEventListener('click', () => {
        openSelectWardModal();
      });
    }
    if (els.btnClearWard) {
      els.btnClearWard.addEventListener('click', (e) => {
        clearWardAddress(true, e);
        showToast('Đã bỏ chọn phường/xã.', 'info');
      });
    }
    if (els.btnCloseWardModal) {
      els.btnCloseWardModal.addEventListener('click', closeSelectWardModal);
    }
    if (els.btnCancelWardModal) {
      els.btnCancelWardModal.addEventListener('click', closeSelectWardModal);
    }
    if (els.btnConfirmWardModal) {
      els.btnConfirmWardModal.addEventListener('click', handleConfirmWardModal);
    }
    if (els.addressModeSwitch) {
      els.addressModeSwitch.querySelectorAll('.address-mode-item').forEach(item => {
        item.addEventListener('click', () => {
          const isNew = item.getAttribute('data-mode') === 'new';
          if (isNew !== state.wardModal.isNewAddress) {
            switchAddressMode(isNew, true);
          }
        });
      });
    }

    // Old Province Select
    const openOldProvinceDropdown = (filterText = '') => {
      closeAllWardDropdowns();
      renderWardSelectDropdown(
        els.dropdownOldProvince,
        state.wardModal.provincesOld,
        filterText,
        state.wardModal.selectedOldProvince ? state.wardModal.selectedOldProvince.value : null,
        (selected) => {
          state.wardModal.selectedOldProvince = selected;
          state.wardModal.selectedOldDistrict = null;
          state.wardModal.selectedOldWard = null;
          els.inputOldProvince.value = selected.label;
          els.inputOldDistrict.value = '';
          els.inputOldDistrict.disabled = false;
          els.inputOldWard.value = '';
          els.inputOldWard.disabled = true;
          updateWardModalPreview();
        }
      );
    };
    els.inputOldProvince.addEventListener('focus', () => openOldProvinceDropdown(''));
    els.inputOldProvince.addEventListener('click', (e) => { e.stopPropagation(); openOldProvinceDropdown(''); });
    els.inputOldProvince.addEventListener('input', (e) => openOldProvinceDropdown(e.target.value));

    // Old District Select
    const openOldDistrictDropdown = (filterText = '') => {
      if (!state.wardModal.selectedOldProvince) return;
      closeAllWardDropdowns();
      const provId = state.wardModal.selectedOldProvince.value;
      const distOptions = state.wardModal.districtsOld.filter(d => d.provinceId === provId);
      renderWardSelectDropdown(
        els.dropdownOldDistrict,
        distOptions,
        filterText,
        state.wardModal.selectedOldDistrict ? state.wardModal.selectedOldDistrict.value : null,
        (selected) => {
          state.wardModal.selectedOldDistrict = selected;
          state.wardModal.selectedOldWard = null;
          els.inputOldDistrict.value = selected.label;
          els.inputOldWard.value = '';
          updateWardModalPreview();
          loadOldWardsByDistrict(selected.value);
        }
      );
    };
    els.inputOldDistrict.addEventListener('focus', () => openOldDistrictDropdown(''));
    els.inputOldDistrict.addEventListener('click', (e) => { e.stopPropagation(); openOldDistrictDropdown(''); });
    els.inputOldDistrict.addEventListener('input', (e) => openOldDistrictDropdown(e.target.value));

    // Old Ward Select
    const openOldWardDropdown = (filterText = '') => {
      if (!state.wardModal.selectedOldDistrict) return;
      closeAllWardDropdowns();
      renderWardSelectDropdown(
        els.dropdownOldWard,
        state.wardModal.wardsOld,
        filterText,
        state.wardModal.selectedOldWard ? state.wardModal.selectedOldWard.value : null,
        (selected) => {
          state.wardModal.selectedOldWard = selected;
          els.inputOldWard.value = selected.label;
          updateWardModalPreview();
        }
      );
    };
    els.inputOldWard.addEventListener('focus', () => openOldWardDropdown(''));
    els.inputOldWard.addEventListener('click', (e) => { e.stopPropagation(); openOldWardDropdown(''); });
    els.inputOldWard.addEventListener('input', (e) => openOldWardDropdown(e.target.value));

    // New Province Select (V3)
    const openNewProvinceDropdown = (filterText = '') => {
      closeAllWardDropdowns();
      renderWardSelectDropdown(
        els.dropdownNewProvince,
        state.wardModal.provincesNew,
        filterText,
        state.wardModal.selectedNewProvince ? state.wardModal.selectedNewProvince.value : null,
        (selected) => {
          state.wardModal.selectedNewProvince = selected;
          state.wardModal.selectedNewWard = null;
          els.inputNewProvince.value = selected.label;
          els.inputNewWard.value = '';
          updateWardModalPreview();
          loadNewWardsByProvinceV3(selected.value);
        }
      );
    };
    els.inputNewProvince.addEventListener('focus', () => openNewProvinceDropdown(''));
    els.inputNewProvince.addEventListener('click', (e) => { e.stopPropagation(); openNewProvinceDropdown(''); });
    els.inputNewProvince.addEventListener('input', (e) => openNewProvinceDropdown(e.target.value));

    // New Ward Select (V3)
    const openNewWardDropdown = (filterText = '') => {
      if (!state.wardModal.selectedNewProvince) return;
      closeAllWardDropdowns();
      renderWardSelectDropdown(
        els.dropdownNewWard,
        state.wardModal.wardsNew,
        filterText,
        state.wardModal.selectedNewWard ? state.wardModal.selectedNewWard.value : null,
        (selected) => {
          state.wardModal.selectedNewWard = selected;
          els.inputNewWard.value = selected.label;
          updateWardModalPreview();
        }
      );
    };
    els.inputNewWard.addEventListener('focus', () => openNewWardDropdown(''));
    els.inputNewWard.addEventListener('click', (e) => { e.stopPropagation(); openNewWardDropdown(''); });
    els.inputNewWard.addEventListener('input', (e) => openNewWardDropdown(e.target.value));

    // 4. Warehouse Combobox Search
    els.whSearchInput.addEventListener('focus', () => {
      const matches = filterWarehouses(els.whSearchInput.value);
      renderWarehouseDropdown(matches);
    });

    els.whSearchInput.addEventListener('input', (e) => {
      const query = e.target.value;
      els.whClearBtn.style.display = query ? 'block' : 'none';
      const matches = filterWarehouses(query);
      renderWarehouseDropdown(matches);
    });

    els.whClearBtn.addEventListener('click', () => {
      clearSelectedWarehouse();
    });

    document.addEventListener('click', (e) => {
      if (!els.whSearchInput.contains(e.target) && !els.whDropdown.contains(e.target)) {
        els.whDropdown.classList.remove('show');
      }
      if (els.modalSelectWard && els.modalSelectWard.classList.contains('show')) {
        const insideSelect = e.target.closest('.ward-custom-select');
        if (!insideSelect) {
          closeAllWardDropdowns();
        }
      }
    });

    // 5. Reason Select
    els.reasonSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      state.selectedReasonKey = val;
      if (val === 'other_reason') {
        els.customReasonTextarea.style.display = 'block';
        els.customReasonTextarea.focus();
      } else {
        els.customReasonTextarea.style.display = 'none';
      }
    });

    // 6. Execution Buttons
    els.btnUpdateWarehouse.addEventListener('click', () => {
      openConfirmModal();
    });

    els.btnStopExecution.addEventListener('click', () => {
      state.shouldStop = true;
      els.btnStopExecution.disabled = true;
      els.btnStopExecution.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang dừng...';
    });

    // 7. Results Tabs
    els.resultTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        els.resultTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const tab = btn.getAttribute('data-tab');
        els.tabPaneSuccess.style.display = tab === 'success' ? 'block' : 'none';
        els.tabPaneEform.style.display = tab === 'eform' ? 'block' : 'none';
        els.tabPaneFailed.style.display = tab === 'failed' ? 'block' : 'none';
        els.tabPaneLogs.style.display = tab === 'logs' ? 'block' : 'none';
      });
    });

    // 8. Copy Buttons
    els.btnCopySuccess.addEventListener('click', () => {
      const codes = state.results.success.map(it => it.code).join('\n');
      copyToClipboard(codes, `Đã copy ${state.results.success.length} mã đơn thành công!`);
    });

    els.btnCopyEform.addEventListener('click', () => {
      const codes = state.results.eform.map(it => it.code).join('\n');
      copyToClipboard(codes, `Đã copy ${state.results.eform.length} mã đơn chờ Eform!`);
    });

    els.btnCopyFailed.addEventListener('click', () => {
      const codes = state.results.failed.map(it => it.code).join('\n');
      copyToClipboard(codes, `Đã copy ${state.results.failed.length} mã đơn lỗi!`);
    });

    // 9. Clear Results & Export
    els.btnClearResults.addEventListener('click', () => {
      state.results.success = [];
      state.results.eform = [];
      state.results.failed = [];
      renderResultsTables();
      els.progressCard.style.display = 'none';
      els.progressBarFill.style.width = '0%';
      els.progressPercent.textContent = '0%';
      showToast('Đã làm mới bảng kết quả', 'info');
    });

    els.btnExportExcel.addEventListener('click', exportResultsToExcel);

    // 10. Modals
    els.btnCloseConfirm.addEventListener('click', closeConfirmModal);
    els.btnCancelConfirm.addEventListener('click', closeConfirmModal);
    els.btnExecuteConfirmed.addEventListener('click', executeBatchUpdate);

    els.btnOpenGuide.addEventListener('click', () => {
      els.modalGuide.classList.add('show');
    });
    els.btnCloseGuide.addEventListener('click', () => {
      els.modalGuide.classList.remove('show');
    });
    els.btnGuideOk.addEventListener('click', () => {
      els.modalGuide.classList.remove('show');
    });

    // Cloud Sync Modal Listeners
    if (els.btnOpenSyncModal) {
      els.btnOpenSyncModal.addEventListener('click', () => {
        const savedUrl = getConfiguredSyncUrl();
        els.syncUrlInput.value = savedUrl;
        els.modalSync.classList.add('show');
      });
    }
    if (els.btnCloseSync) {
      els.btnCloseSync.addEventListener('click', () => els.modalSync.classList.remove('show'));
    }
    if (els.btnCancelSync) {
      els.btnCancelSync.addEventListener('click', () => els.modalSync.classList.remove('show'));
    }
    if (els.btnSaveSyncUrl) {
      els.btnSaveSyncUrl.addEventListener('click', async () => {
        const url = els.syncUrlInput.value.trim();
        if (url) {
          localStorage.setItem('ghn_sync_url', url);
          showToast('Đã lưu URL đồng bộ Cloud!', 'success');
          await fetchTokenFromCloudSync(url, true);
        } else {
          localStorage.removeItem('ghn_sync_url');
          showToast('Đã xóa URL đồng bộ Cloud.', 'info');
          if (els.cloudSyncInfoPill) els.cloudSyncInfoPill.style.display = 'none';
        }
        els.modalSync.classList.remove('show');
      });
    }
    if (els.btnTestSyncUrl) {
      els.btnTestSyncUrl.addEventListener('click', () => {
        const url = els.syncUrlInput.value.trim();
        if (url) localStorage.setItem('ghn_sync_url', url);
        fetchTokenFromCloudSync(url, true);
      });
    }
    if (els.btnPushSyncUrl) {
      els.btnPushSyncUrl.addEventListener('click', () => {
        const url = els.syncUrlInput.value.trim();
        if (url) localStorage.setItem('ghn_sync_url', url);
        pushTokenToCloudSync(url, els.tokenInput.value.trim(), true);
      });
    }
    if (els.btnCopyGasCode) {
      els.btnCopyGasCode.addEventListener('click', () => {
        copyToClipboard(GAS_CODE_SNIPPET, 'Đã copy toàn bộ mã nguồn Google Apps Script v2!');
      });
    }

    // Close modals on background click
    els.modalConfirm.addEventListener('click', (e) => {
      if (e.target === els.modalConfirm) closeConfirmModal();
    });
    els.modalGuide.addEventListener('click', (e) => {
      if (e.target === els.modalGuide) els.modalGuide.classList.remove('show');
    });
    if (els.modalSync) {
      els.modalSync.addEventListener('click', (e) => {
        if (e.target === els.modalSync) els.modalSync.classList.remove('show');
      });
    }
    if (els.modalSelectWard) {
      els.modalSelectWard.addEventListener('click', (e) => {
        if (e.target === els.modalSelectWard) closeSelectWardModal();
      });
    }
  }

  // --- BOOTSTRAP APP ---
  function init() {
    initEvents();
    updateWardSelectorAvailability();
    initWarehouses();
    initToken();
    updateOrderCounter();
    console.log('⚡ GHN Revert Hub v2.0 Initialized Successfully.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
