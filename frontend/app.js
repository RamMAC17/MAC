/* ═══════════════════════════════════════════════════════════
   MAC — MBM AI Cloud  ·  PWA Frontend  v3
   Premium Dashboard Edition
   ═══════════════════════════════════════════════════════════ */

// ── API helper ────────────────────────────────────────────
const API = '/api/v1';
const state = { token: localStorage.getItem('mac_token'), user: null, page: 'login' };
let deferredInstallPrompt = null;

// ── PWA install prompt capture ────────────────────────────
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = '';
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = 'none';
});

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
  return res;
}
async function apiJson(path, opts) { const r = await api(path, opts); return r.json(); }

// ── Session storage ───────────────────────────────────────
function getSessions() { try { return JSON.parse(localStorage.getItem('mac_sessions') || '[]'); } catch { return []; } }
function saveSessions(s) { localStorage.setItem('mac_sessions', JSON.stringify(s)); }
function getSession(id) { return getSessions().find(s => s.id === id); }

// ── Eye toggle SVGs ───────────────────────────────────────
const EYE_OPEN = '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_CLOSED = '<svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

// ── MAC Thinking Animation ────────────────────────────────
function macThinkingHTML() {
  return `<div class="mac-thinking">
    <div class="mac-think-orb">
      <div class="mac-think-ring"></div>
      <div class="mac-think-ring r2"></div>
      <div class="mac-think-ring r3"></div>
      <div class="mac-think-letters">
        <span class="mac-tl" style="--i:0">M</span>
        <span class="mac-tl" style="--i:1">A</span>
        <span class="mac-tl" style="--i:2">C</span>
      </div>
    </div>
    <span class="mac-think-label">Thinking</span>
  </div>`;
}
function startMacThinking(el) {
  const letters = el.querySelectorAll('.mac-tl');
  let active = 0;
  const iv = setInterval(() => {
    letters.forEach((l, i) => l.classList.toggle('lit', i === active));
    active = (active + 1) % letters.length;
  }, 400);
  el._macThinkIv = iv;
}
function stopMacThinking(el) {
  if (el._macThinkIv) { clearInterval(el._macThinkIv); el._macThinkIv = null; }
}

function pwField(id, label, placeholder) {
  return `<div class="field">
    <label>${label}</label>
    <div class="pw-wrap">
      <input type="password" id="${id}" placeholder="${esc(placeholder || '••••••••')}" autocomplete="new-password">
      <button type="button" class="pw-toggle" data-target="${id}" title="Toggle visibility">${EYE_CLOSED}</button>
    </div>
  </div>`;
}

function bindEyeToggles(root) {
  (root || document).querySelectorAll('.pw-toggle').forEach(btn => {
    btn.onclick = () => {
      const inp = document.getElementById(btn.dataset.target);
      if (!inp) return;
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      btn.innerHTML = show ? EYE_OPEN : EYE_CLOSED;
    };
  });
}

// ── Router ────────────────────────────────────────────────
function navigate(page) {
  if (state.user && state.user.must_change_password && page !== 'set-password' && page !== 'login') {
    page = 'set-password';
  }
  state.page = page;
  window.history.pushState({}, '', page === 'login' ? '/' : `#${page}`);
  render();
}

window.addEventListener('popstate', () => {
  if (state.user && state.user.must_change_password) {
    window.history.pushState({}, '', '#set-password');
    state.page = 'set-password';
    render();
    return;
  }
  const hash = location.hash.slice(1);
  state.page = hash || (state.token ? 'dashboard' : 'login');
  render();
});

// ── Bootstrap ─────────────────────────────────────────────
async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/static/sw.js', {scope: '/'});
  if (state.token) {
    try {
      const u = await apiJson('/auth/me');
      state.user = u;
      if (u.must_change_password) {
        state.token = null; state.user = null;
        localStorage.removeItem('mac_token');
        state.page = 'login';
      } else {
        state.page = location.hash.slice(1) || 'dashboard';
        // Subscribe to push notifications
        subscribeToPush();
      }
    } catch { state.token = null; localStorage.removeItem('mac_token'); state.page = 'login'; }
  }
  render();
}

let _dashRefreshIv = null;
function render() {
  // Clear dashboard auto-refresh when navigating away
  if (_dashRefreshIv) { clearInterval(_dashRefreshIv); _dashRefreshIv = null; }
  const app = document.getElementById('app');
  if (!state.token || state.page === 'login') { app.innerHTML = authPage(); bindAuth(); return; }
  if (state.user && state.user.must_change_password) {
    state.page = 'set-password';
    window.history.replaceState({}, '', '#set-password');
    app.innerHTML = setPasswordPage(); bindSetPassword(); bindEyeToggles();
    return;
  }
  if (state.page === 'set-password') { app.innerHTML = setPasswordPage(); bindSetPassword(); bindEyeToggles(); return; }
  app.innerHTML = shell();
  bindShell();
  if (state.page === 'dashboard') {
    renderDashboard();
    _dashRefreshIv = setInterval(() => { if (state.page === 'dashboard') renderDashboard(); }, 30000);
  }
  else if (state.page === 'chat') renderChat();
  else if (state.page === 'admin') renderAdmin();
  else if (state.page === 'settings') renderSettings();
  else if (state.page === 'doubts') renderDoubts();
  else if (state.page === 'attendance') renderAttendance();
  else if (state.page === 'copycheck') renderCopyCheck();
  else { state.page = 'dashboard'; renderDashboard(); _dashRefreshIv = setInterval(() => { if (state.page === 'dashboard') renderDashboard(); }, 30000); }
}

function logout() {
  state.token = null; state.user = null;
  localStorage.removeItem('mac_token');
  navigate('login');
}

async function installPWA() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const result = await deferredInstallPrompt.userChoice;
  if (result.outcome === 'accepted') deferredInstallPrompt = null;
}

/* ═══════════════════════════════════════════════════════════
   AUTH PAGE — Login (username+password) / First-time (roll+DOB)
   ═══════════════════════════════════════════════════════════ */
let authMode = 'login';

function authPage() {
  if (authMode === 'verify') {
    return `
    <div class="auth-page">
      <div class="auth-card">
        <div class="logo"><span class="glitch" data-text="MAC">MAC</span></div>
        <div class="subtitle">MBM AI Cloud · First-Time Verification</div>
        <p style="font-size:.85rem;color:var(--muted);margin-bottom:24px">
          First time here? Verify your college registration number and date of birth.
        </p>
        <div class="error" id="auth-error"></div>
        <form id="auth-form">
          <div class="field">
            <label>Registration Number</label>
            <input type="text" id="auth-roll" placeholder="e.g. 21CS045" required autocomplete="username">
          </div>
          <div class="field">
            <label>Date of Birth (DDMMYYYY)</label>
            <input type="text" id="auth-dob" placeholder="e.g. 15082003" required maxlength="8" inputmode="numeric" autocomplete="bday">
          </div>
          <button type="submit" class="btn btn-primary">Verify & Continue</button>
        </form>
        <p style="text-align:center;margin-top:20px">
          <a href="#" id="switch-to-login" class="auth-toggle">Already have a password? <span class="link-word">Sign In</span></a>
        </p>
      </div>
    </div>`;
  }
  return `
  <div class="auth-page">
    <div class="auth-card">
      <div class="logo"><span class="glitch" data-text="MAC">MAC</span></div>
      <div class="subtitle">MBM AI Cloud · Self-Hosted Inference</div>
      <p style="font-size:.85rem;color:var(--muted);margin-bottom:24px">
        Sign in with your username and password.
      </p>
      <div class="error" id="auth-error"></div>
      <form id="auth-form">
        <div class="field">
          <label>Username</label>
          <input type="text" id="auth-roll" placeholder="e.g. 21CS045" required autocomplete="username">
        </div>
        ${pwField('auth-pw', 'Password', 'Enter your password')}
        <button type="submit" class="btn btn-primary">Sign In</button>
      </form>
      <p style="text-align:center;margin-top:20px">
        <a href="#" id="switch-to-verify" class="auth-toggle">First time? <span class="link-word">Verify with DOB</span></a>
      </p>
    </div>
  </div>`;
}

function bindAuth() {
  const form = document.getElementById('auth-form');
  if (!form) return;
  bindEyeToggles();
  const switchToVerify = document.getElementById('switch-to-verify');
  const switchToLogin = document.getElementById('switch-to-login');
  if (switchToVerify) switchToVerify.onclick = (e) => { e.preventDefault(); authMode = 'verify'; render(); };
  if (switchToLogin) switchToLogin.onclick = (e) => { e.preventDefault(); authMode = 'login'; render(); };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = document.getElementById('auth-error');
    err.textContent = '';
    const roll = document.getElementById('auth-roll').value.trim();

    if (authMode === 'verify') {
      const dob = document.getElementById('auth-dob').value.trim();
      if (!roll || !dob) { err.textContent = 'Both fields are required'; return; }
      if (!/^\d{8}$/.test(dob)) { err.textContent = 'DOB must be 8 digits (DDMMYYYY)'; return; }
      try {
        const r = await fetch(`${API}/auth/verify`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roll_number: roll, dob }),
        });
        if (!r.ok) { const d = await r.json(); err.textContent = d.detail?.message || 'Verification failed'; return; }
        const data = await r.json();
        state.token = data.access_token; state.user = data.user;
        localStorage.setItem('mac_token', data.access_token);
        if (data.must_change_password) navigate('set-password'); else navigate('dashboard');
      } catch (ex) { err.textContent = 'Connection error'; }
    } else {
      const pw = document.getElementById('auth-pw').value;
      if (!roll || !pw) { err.textContent = 'Both fields are required'; return; }
      try {
        const r = await fetch(`${API}/auth/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roll_number: roll, password: pw }),
        });
        if (!r.ok) { const d = await r.json(); err.textContent = d.detail?.message || 'Invalid username or password'; return; }
        const data = await r.json();
        state.token = data.access_token; state.user = data.user;
        localStorage.setItem('mac_token', data.access_token);
        if (data.must_change_password) navigate('set-password'); else navigate('dashboard');
      } catch (ex) { err.textContent = 'Connection error'; }
    }
  };
}

/* ═══════════════════════════════════════════════════════════
   SET PASSWORD (first-time / forced)
   ═══════════════════════════════════════════════════════════ */
function setPasswordPage() {
  const u = state.user || {};
  return `
  <div class="auth-page">
    <div class="auth-card">
      <div class="logo"><span class="glitch" data-text="MAC">MAC</span></div>
      <div class="subtitle">Set Your Password</div>
      <p style="font-size:.85rem;color:var(--muted);margin-bottom:20px">
        Welcome, <strong>${esc(u.name || u.roll_number || '')}</strong>!<br>
        You must set a secure password before continuing.
      </p>
      <div class="error" id="sp-error"></div>
      <form id="sp-form">
        ${pwField('sp-new', 'New Password', 'Minimum 8 characters')}
        ${pwField('sp-confirm', 'Confirm Password', 'Repeat your password')}
        <button type="submit" class="btn btn-primary">Set Password & Continue</button>
      </form>
    </div>
  </div>`;
}

function bindSetPassword() {
  document.getElementById('sp-form').onsubmit = async (e) => {
    e.preventDefault();
    const err = document.getElementById('sp-error');
    err.textContent = '';
    const pw = document.getElementById('sp-new').value;
    const conf = document.getElementById('sp-confirm').value;
    if (pw.length < 8) { err.textContent = 'Password must be at least 8 characters'; return; }
    if (pw !== conf) { err.textContent = 'Passwords do not match'; return; }
    try {
      const r = await api('/auth/set-password', {
        method: 'POST',
        body: JSON.stringify({ new_password: pw, confirm_password: conf }),
      });
      if (!r.ok) { const d = await r.json(); err.textContent = d.detail?.message || 'Failed'; return; }
      state.user = await apiJson('/auth/me');
      navigate('dashboard');
    } catch (ex) { err.textContent = ex.message; }
  };
}

/* ═══════════════════════════════════════════════════════════
   APP SHELL
   ═══════════════════════════════════════════════════════════ */
function shell() {
  const u = state.user || {};
  const isAdmin = u.role === 'admin';
  const isFacultyOrAdmin = u.role === 'faculty' || u.role === 'admin';
  const pages = { dashboard: 'Dashboard', chat: 'Chat', doubts: 'Doubts', attendance: 'Attendance', copycheck: 'Copy Check', settings: 'Settings', admin: 'Admin' };
  const dockSide = localStorage.getItem('mac_dock_side') || 'left';
  return `
  <div class="shell dock-${dockSide}" id="shell">
    <div class="sidebar-overlay" id="sidebar-overlay"></div>
    <nav class="sidebar" id="sidebar">
      <div class="sidebar-resize" id="sidebar-resize"></div>
      <div class="sidebar-grip" id="sidebar-grip" title="Drag to dock sidebar to any edge">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="6" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/></svg>
      </div>
      <div class="sidebar-inner">
        <div class="sidebar-header">
          <div class="brand"><span class="glitch" data-text="MAC">MAC</span></div>
        </div>
        <div class="sidebar-nav">
          <a href="#dashboard" data-page="dashboard" class="${state.page==='dashboard'?'active':''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            <span>Dashboard</span>
          </a>
          <a href="#chat" data-page="chat" class="${state.page==='chat'?'active':''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>Chat</span>
          </a>
          <a href="#doubts" data-page="doubts" class="${state.page==='doubts'?'active':''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>Doubts</span>
          </a>
          ${isFacultyOrAdmin ? `<a href="#attendance" data-page="attendance" class="${state.page==='attendance'?'active':''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14l2 2 4-4"/></svg>
            <span>Attendance</span>
          </a>` : ''}
          ${isFacultyOrAdmin ? `<a href="#copycheck" data-page="copycheck" class="${state.page==='copycheck'?'active':''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>
            <span>Copy Check</span>
          </a>` : ''}
          <a href="#settings" data-page="settings" class="${state.page==='settings'?'active':''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span>Settings</span>
          </a>
          ${isAdmin ? `<a href="#admin" data-page="admin" class="${state.page==='admin'?'active':''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span>Admin Panel</span>
          </a>` : ''}
        </div>
        <div class="sidebar-user">
          <div class="user-avatar">${(u.name || '?')[0].toUpperCase()}</div>
          <div>
            <div class="name">${esc(u.name || '')}</div>
            <div style="font-size:.75rem">${esc(u.roll_number || '')} · <span class="badge badge-${u.role}">${esc(u.role || '')}</span></div>
          </div>
        </div>
        <button class="btn btn-sm btn-outline sidebar-logout" onclick="logout()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign Out
        </button>
      </div>
    </nav>
    <div class="main-content">
      <div class="topbar">
        <button class="btn btn-sm menu-btn" id="menu-toggle">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <h1>${pages[state.page] || 'Dashboard'}</h1>
        <div class="topbar-right">
          <button class="btn btn-sm pwa-install-btn" id="pwa-install-btn" style="display:${deferredInstallPrompt?'':'none'}" onclick="installPWA()" title="Install MAC App">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Install</span>
          </button>
          <div class="notif-bell" id="notif-bell" title="Notifications">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <span class="notif-badge" id="notif-count"></span>
          </div>
          <span class="status-dot"></span>
          <span style="font-size:.75rem;color:var(--muted)">Online</span>
        </div>
      </div>
      <div class="page" id="page-content"></div>
    </div>
  </div>
  <div class="notif-panel" id="notif-panel">
    <div class="notif-panel-header">
      <h3>Notifications</h3>
      <button class="btn btn-sm btn-outline" id="notif-mark-all" style="padding:4px 10px;font-size:.72rem">Mark all read</button>
    </div>
    <div class="notif-list" id="notif-list">
      <div class="notif-empty">No notifications</div>
    </div>
  </div>`;
}

function bindShell() {
  document.querySelectorAll('.sidebar-nav a').forEach(a => {
    a.onclick = (e) => { e.preventDefault(); closeSidebar(); navigate(a.dataset.page); };
  });
  const toggle = document.getElementById('menu-toggle');
  const overlay = document.getElementById('sidebar-overlay');
  if (toggle) toggle.onclick = () => {
    document.getElementById('shell').classList.toggle('sidebar-open');
  };
  if (overlay) overlay.onclick = closeSidebar;

  // ── Resizable sidebar (drag edge) ──────────────────────
  const shellEl = document.getElementById('shell');
  const sidebar = document.getElementById('sidebar');
  const resizeHandle = document.getElementById('sidebar-resize');

  if (resizeHandle && sidebar) {
    let startPos, startSize;
    resizeHandle.onmousedown = (e) => {
      e.preventDefault();
      const side = getCurrentDockSide();
      const rect = sidebar.getBoundingClientRect();
      startPos = (side === 'left' || side === 'right') ? e.clientX : e.clientY;
      startSize = (side === 'left' || side === 'right') ? rect.width : rect.height;
      document.body.style.cursor = (side === 'left' || side === 'right') ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
      function onMove(ev) {
        const curSide = getCurrentDockSide();
        let delta;
        if (curSide === 'left') delta = ev.clientX - startPos;
        else if (curSide === 'right') delta = startPos - ev.clientX;
        else if (curSide === 'top') delta = ev.clientY - startPos;
        else delta = startPos - ev.clientY;
        let size = startSize + delta;
        const isHoriz = curSide === 'left' || curSide === 'right';
        const minSize = isHoriz ? 52 : 42;
        const maxSize = isHoriz ? 400 : 300;
        size = Math.max(minSize, Math.min(maxSize, size));
        if (isHoriz) {
          sidebar.style.width = size + 'px';
          sidebar.style.height = '';
          sidebar.classList.toggle('compact', size <= 70);
        } else {
          sidebar.style.height = size + 'px';
          sidebar.style.width = '';
        }
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
    // Double-click to toggle compact/expanded
    resizeHandle.ondblclick = () => {
      const side = getCurrentDockSide();
      if (side === 'left' || side === 'right') {
        const w = sidebar.getBoundingClientRect().width;
        if (w > 70) {
          sidebar.style.width = '52px';
          sidebar.classList.add('compact');
        } else {
          sidebar.style.width = '230px';
          sidebar.classList.remove('compact');
        }
      } else {
        const h = sidebar.getBoundingClientRect().height;
        sidebar.style.height = (h > 60 ? '42px' : '120px');
      }
    };
  }

  // ── Drag sidebar grip to dock to any edge ──────────────
  const grip = document.getElementById('sidebar-grip');
  if (grip && sidebar) {
    let dragOverlay;
    grip.onmousedown = (e) => {
      e.preventDefault();
      // Create full-screen overlay with edge zones
      dragOverlay = document.createElement('div');
      dragOverlay.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:grabbing;';
      const indicator = document.createElement('div');
      indicator.style.cssText = 'position:fixed;background:rgba(0,0,0,.06);border:2px dashed rgba(0,0,0,.2);transition:all .15s;border-radius:4px;pointer-events:none;z-index:10000;';
      dragOverlay.appendChild(indicator);
      document.body.appendChild(dragOverlay);

      function getZone(cx, cy) {
        const w = window.innerWidth, h = window.innerHeight;
        const edgeSize = 80;
        if (cx < edgeSize) return 'left';
        if (cx > w - edgeSize) return 'right';
        if (cy < edgeSize) return 'top';
        if (cy > h - edgeSize) return 'bottom';
        return null;
      }
      function showIndicator(zone) {
        if (!zone) { indicator.style.display = 'none'; return; }
        indicator.style.display = 'block';
        if (zone === 'left') { indicator.style.cssText += 'top:0;left:0;width:230px;height:100%;'; }
        else if (zone === 'right') { indicator.style.cssText += 'top:0;right:0;left:auto;width:230px;height:100%;'; }
        else if (zone === 'top') { indicator.style.cssText += 'top:0;left:0;width:100%;height:60px;'; }
        else if (zone === 'bottom') { indicator.style.cssText += 'bottom:0;left:0;top:auto;width:100%;height:60px;'; }
      }
      function onMove(ev) {
        const zone = getZone(ev.clientX, ev.clientY);
        showIndicator(zone);
      }
      function onUp(ev) {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        dragOverlay.remove();
        const zone = getZone(ev.clientX, ev.clientY);
        if (zone) setDockSide(zone);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
  }

  function getCurrentDockSide() {
    if (shellEl.classList.contains('dock-right')) return 'right';
    if (shellEl.classList.contains('dock-top')) return 'top';
    if (shellEl.classList.contains('dock-bottom')) return 'bottom';
    return 'left';
  }

  function setDockSide(side) {
    shellEl.classList.remove('dock-left', 'dock-right', 'dock-top', 'dock-bottom');
    shellEl.classList.add('dock-' + side);
    sidebar.style.width = '';
    sidebar.style.height = '';
    sidebar.classList.remove('compact');
    localStorage.setItem('mac_dock_side', side);
    // Reset sizes based on side
    if (side === 'left' || side === 'right') {
      sidebar.style.width = '230px';
    } else {
      sidebar.style.height = '52px';
    }
  }

  // Notification bell
  const bell = document.getElementById('notif-bell');
  const panel = document.getElementById('notif-panel');
  if (bell && panel) {
    bell.onclick = (e) => { e.stopPropagation(); panel.classList.toggle('open'); if (panel.classList.contains('open')) loadNotifications(); };
    document.addEventListener('click', (e) => { if (!panel.contains(e.target) && e.target !== bell) panel.classList.remove('open'); }, { once: false });
  }
  const markAllBtn = document.getElementById('notif-mark-all');
  if (markAllBtn) markAllBtn.onclick = async () => {
    try { await api('/notifications/read-all', { method: 'POST' }); loadNotifications(); loadNotifCount(); } catch {}
  };
  // Load notification count
  loadNotifCount();
}

function closeSidebar() {
  const shell = document.getElementById('shell');
  if (shell) shell.classList.remove('sidebar-open');
}

/* ═══════════════════════════════════════════════════════════
   USER DASHBOARD — Premium Analytics
   ═══════════════════════════════════════════════════════════ */
async function renderDashboard() {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>Loading dashboard...</span></div>';
  try {
    const [me, quota, history, keyStats] = await Promise.all([
      apiJson('/auth/me'),
      apiJson('/usage/me/quota'),
      apiJson('/usage/me/history?per_page=50'),
      apiJson('/keys/my-key/stats').catch(() => null),
    ]);
    state.user = me;
    const q = quota;
    const tokensUsed = q.current?.tokens_used_today || 0;
    const tokensLimit = q.limits?.daily_tokens || 50000;
    const reqsUsed = q.current?.requests_this_hour || 0;
    const reqsLimit = q.limits?.requests_per_hour || 100;
    const tokenPct = Math.min(100, Math.round((tokensUsed / tokensLimit) * 100));
    const reqPct = Math.min(100, Math.round((reqsUsed / reqsLimit) * 100));
    const reqs = history.requests || [];

    // Build activity heatmap data from history
    const heatmapData = buildHeatmapData(reqs);
    // Build model distribution
    const modelDist = {};
    reqs.forEach(r => { modelDist[r.model] = (modelDist[r.model] || 0) + 1; });
    // Build hourly distribution
    const hourlyDist = new Array(24).fill(0);
    reqs.forEach(r => { const h = new Date(r.created_at).getHours(); hourlyDist[h]++; });

    el.innerHTML = `
      <div class="dash-greeting">
        <div>
          <h2>Welcome back, ${esc(me.name.split(' ')[0])}</h2>
          <p>${esc(me.department)} · ${esc(me.role)} · Joined ${new Date(me.created_at).toLocaleDateString('en-IN', {month:'short',year:'numeric'})}</p>
        </div>
        <div class="dash-greeting-api">
          <span class="label">API Key</span>
          <code class="api-key-mini">${esc(me.api_key ? me.api_key.slice(0,8) + '...' + me.api_key.slice(-4) : 'N/A')}</code>
        </div>
      </div>

      <div class="stats-grid stats-4">
        <div class="stat-card">
          <div class="stat-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
          <div class="stat-body">
            <div class="label">Tokens Today</div>
            <div class="value">${fmtNum(tokensUsed)}</div>
            <div class="stat-bar"><div class="stat-bar-fill ${tokenPct > 80 ? 'warn' : ''}" style="width:${tokenPct}%"></div></div>
            <div class="sub">${tokenPct}% of ${fmtNum(tokensLimit)}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>
          <div class="stat-body">
            <div class="label">Requests / Hour</div>
            <div class="value">${reqsUsed}</div>
            <div class="stat-bar"><div class="stat-bar-fill ${reqPct > 80 ? 'warn' : ''}" style="width:${reqPct}%"></div></div>
            <div class="sub">${reqPct}% of ${reqsLimit}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div>
          <div class="stat-body">
            <div class="label">This Week</div>
            <div class="value">${fmtNum(keyStats?.tokens_this_week || 0)}</div>
            <div class="sub">tokens consumed</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
          <div class="stat-body">
            <div class="label">Chat Sessions</div>
            <div class="value">${getSessions().length}</div>
            <div class="sub">saved locally</div>
          </div>
        </div>
      </div>

      <div class="charts-row">
        <div class="chart-card flex-2">
          <div class="chart-header">
            <h3>Activity Heatmap</h3>
            <span class="chart-sub">Your usage pattern over recent days</span>
          </div>
          <div class="heatmap-container" id="heatmap-container"></div>
        </div>
        <div class="chart-card flex-1">
          <div class="chart-header">
            <h3>Model Usage</h3>
            <span class="chart-sub">Distribution by model</span>
          </div>
          <div class="chart-wrap-sm" style="position:relative">
            <canvas id="chart-models"></canvas>
            ${Object.keys(modelDist).length === 0 ? '<div class="chart-empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 10 10"/><line x1="12" y1="12" x2="12" y2="8"/><line x1="12" y1="12" x2="16" y2="12"/></svg><p>No model usage yet</p><span>Start a chat to see distribution</span></div>' : ''}
          </div>
          <div id="model-legend" class="chart-legend"></div>
        </div>
      </div>

      <div class="charts-row">
        <div class="chart-card flex-1">
          <div class="chart-header">
            <h3>Hourly Activity</h3>
            <span class="chart-sub">When you use MAC most</span>
          </div>
          <div style="height:200px;position:relative">
            <canvas id="chart-hourly"></canvas>
            ${hourlyDist.every(v => v === 0) ? '<div class="chart-empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg><p>No activity recorded yet</p><span>Use the chat — your hourly pattern will appear here</span></div>' : ''}
          </div>
        </div>
        <div class="chart-card flex-1">
          <div class="chart-header">
            <h3>Quota Overview</h3>
          </div>
          <div class="quota-rings">
            <div class="ring-wrap">
              <canvas id="chart-tokens" width="120" height="120"></canvas>
              <div class="ring-label"><span class="pct">${tokenPct}%</span><span class="lbl">Tokens</span></div>
            </div>
            <div class="ring-wrap">
              <canvas id="chart-reqs" width="120" height="120"></canvas>
              <div class="ring-label"><span class="pct">${reqPct}%</span><span class="lbl">Requests</span></div>
            </div>
          </div>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-header">
          <h3>Recent Activity</h3>
          <span class="chart-sub">${reqs.length} recent requests</span>
        </div>
        ${reqs.length > 0 ? `
          <div class="table-responsive">
          <table class="data-table">
            <thead><tr><th>Model</th><th>Endpoint</th><th>Tokens</th><th>Latency</th><th>Status</th><th>Time</th></tr></thead>
            <tbody>
              ${reqs.slice(0,15).map(r => `
                <tr>
                  <td><span class="model-tag">${esc(shortModel(r.model))}</span></td>
                  <td class="mono">${esc(r.endpoint)}</td>
                  <td>${fmtNum(r.tokens_in + r.tokens_out)}</td>
                  <td>${r.latency_ms}ms</td>
                  <td>${r.status_code < 400 ? '<span class="dot-success"></span> OK' : '<span class="dot-error"></span> ' + r.status_code}</td>
                  <td class="muted">${timeAgo(r.created_at)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          </div>
        ` : '<div class="empty-state"><p>No activity yet. Start a chat or make an API call!</p></div>'}
      </div>

      <div class="chart-card">
        <div class="chart-header">
          <h3>Available Models</h3>
        </div>
        <div id="models-grid" class="models-grid"><div class="muted">Loading...</div></div>
      </div>
    `;

    // Render heatmap
    renderHeatmap('heatmap-container', heatmapData);

    // Donut charts
    makeDonut('chart-tokens', tokensUsed, tokensLimit, '#000');
    makeDonut('chart-reqs', reqsUsed, reqsLimit, '#000');

    // Model distribution chart
    const modelLabels = Object.keys(modelDist);
    const modelValues = Object.values(modelDist);
    const modelColors = ['#111', '#555', '#999', '#bbb', '#ddd'];
    if (modelLabels.length > 0) {
      new Chart(document.getElementById('chart-models'), {
        type: 'doughnut',
        data: { labels: modelLabels.map(shortModel), datasets: [{ data: modelValues, backgroundColor: modelColors.slice(0, modelLabels.length), borderWidth: 2, borderColor: '#fff', cutout: '68%', hoverOffset: 8 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#000', titleColor: '#fff', bodyColor: '#fff', cornerRadius: 8, padding: 10 } } },
      });
      document.getElementById('model-legend').innerHTML = modelLabels.map((m, i) =>
        `<div class="legend-item"><span class="legend-dot" style="background:${modelColors[i % modelColors.length]}"></span>${esc(shortModel(m))}<span class="muted" style="margin-left:auto">${modelValues[i]}</span></div>`
      ).join('');
    }

    // Hourly area chart with gradient
    const hourlyCtx = document.getElementById('chart-hourly').getContext('2d');
    const hourlyGrad = hourlyCtx.createLinearGradient(0, 0, 0, 180);
    hourlyGrad.addColorStop(0, 'rgba(0,0,0,0.18)');
    hourlyGrad.addColorStop(1, 'rgba(0,0,0,0.01)');
    new Chart(hourlyCtx.canvas, {
      type: 'line',
      data: {
        labels: Array.from({length:24}, (_, i) => i + 'h'),
        datasets: [{
          data: hourlyDist,
          fill: true,
          backgroundColor: hourlyGrad,
          borderColor: '#000',
          borderWidth: 2,
          pointBackgroundColor: '#000',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: hourlyDist.map(v => v > 0 ? 4 : 0),
          pointHoverRadius: 6,
          tension: 0.4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#000', titleColor: '#fff', bodyColor: '#fff',
            cornerRadius: 8, padding: 10,
            callbacks: { label: (ctx) => ctx.raw + ' request' + (ctx.raw !== 1 ? 's' : '') }
          }
        },
        scales: {
          y: { display: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 10 }, stepSize: 1, precision: 0 } },
          x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 0 } }
        },
        interaction: { intersect: false, mode: 'index' },
      },
    });

    // Models grid
    try {
      const m = await apiJson('/models');
      const list = m.models || [];
      document.getElementById('models-grid').innerHTML = list.map(md => `
        <div class="model-card">
          <div class="model-name">${esc(md.id || md.name)}</div>
          <div class="model-status ${md.status === 'loaded' ? 'online' : 'offline'}">${md.status === 'loaded' ? '<span class="status-dot on"></span> Online' : '<span class="status-dot off"></span> Offline'}</div>
        </div>
      `).join('') || '<p class="muted">No models configured</p>';
    } catch { document.getElementById('models-grid').innerHTML = '<p class="muted">Could not load models</p>'; }

  } catch (ex) { el.innerHTML = `<div class="error-state"><p>Error: ${esc(ex.message)}</p><button class="btn btn-sm btn-outline" onclick="renderDashboard()">Retry</button></div>`; }
}

/* ═══════════════════════════════════════════════════════════
   HEATMAP — GitHub-style contribution graph
   ═══════════════════════════════════════════════════════════ */
function buildHeatmapData(requests) {
  const map = {};
  requests.forEach(r => {
    const d = new Date(r.created_at).toISOString().slice(0, 10);
    map[d] = (map[d] || 0) + 1;
  });
  return map;
}

function renderHeatmap(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const hasData = Object.values(data).some(v => v > 0);
  const today = new Date();
  const weeks = 26;
  const totalCols = weeks + 1;
  const days = weeks * 7;
  const maxVal = Math.max(1, ...Object.values(data));

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - days + 1);
  startDate.setDate(startDate.getDate() - startDate.getDay()); // align to Sunday

  // --- Month labels: collect which columns each month spans, show year at boundary ---
  const monthSpans = [];
  let curMonth = -1, curYear = -1, spanStart = 0;
  for (let w = 0; w < totalCols; w++) {
    const d = new Date(startDate); d.setDate(d.getDate() + w * 7);
    const m = d.getMonth(), y = d.getFullYear();
    if (m !== curMonth) {
      if (curMonth !== -1) {
        const sd = new Date(startDate.getTime() + spanStart * 7 * 86400000);
        const label = sd.toLocaleString('en', { month: 'short' }) + (sd.getFullYear() !== curYear || spanStart === 0 ? " '" + String(sd.getFullYear()).slice(2) : '');
        monthSpans.push({ name: label, start: spanStart, span: w - spanStart });
        curYear = sd.getFullYear();
      }
      curMonth = m; spanStart = w;
    }
  }
  const lastD = new Date(startDate.getTime() + spanStart * 7 * 86400000);
  const lastLabel = lastD.toLocaleString('en', { month: 'short' }) + (lastD.getFullYear() !== curYear || monthSpans.length === 0 ? " '" + String(lastD.getFullYear()).slice(2) : '');
  monthSpans.push({ name: lastLabel, start: spanStart, span: totalCols - spanStart });
  const monthRow = monthSpans.map(m => `<span class="hm-month" style="grid-column:span ${m.span}">${m.name}</span>`).join('');

  // --- Day labels (all 7) ---
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // --- Grid cells ---
  let cells = '';
  for (let w = 0; w < totalCols; w++) {
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(startDate);
      cellDate.setDate(cellDate.getDate() + w * 7 + d);
      const dateStr = cellDate.toISOString().slice(0, 10);
      const count = data[dateStr] || 0;
      const level = count === 0 ? 0 : Math.min(4, Math.ceil((count / maxVal) * 4));
      const isFuture = cellDate > today;
      const tip = cellDate.toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }) + ': ' + (isFuture ? 'No data yet' : count + ' request' + (count !== 1 ? 's' : ''));
      cells += `<div class="hm-cell hm-${isFuture ? 'empty' : level}" title="${tip}"></div>`;
    }
  }

  container.innerHTML = `
    <div class="heatmap-months" style="grid-template-columns:repeat(${totalCols},1fr)">${monthRow}</div>
    <div class="heatmap-body">
      <div class="heatmap-labels">${dayNames.map(n => `<span>${n}</span>`).join('')}</div>
      <div class="heatmap-grid" style="grid-template-columns:repeat(${totalCols},1fr)">${cells}</div>
    </div>
    ${!hasData ? '<div class="heatmap-empty"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="4" x2="8" y2="10"/><line x1="16" y1="4" x2="16" y2="10"/></svg><p>No activity yet</p><span>Your usage will light up here as you chat</span></div>' : ''}
    <div class="heatmap-legend">
      <span style="font-size:.7rem;color:#888">Less</span>
      <div class="hm-cell hm-0"></div><div class="hm-cell hm-1"></div><div class="hm-cell hm-2"></div><div class="hm-cell hm-3"></div><div class="hm-cell hm-4"></div>
      <span style="font-size:.7rem;color:#888">More</span>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   SETTINGS
   ═══════════════════════════════════════════════════════════ */
async function renderSettings() {
  const el = document.getElementById('page-content');
  const u = state.user || {};
  el.innerHTML = `
    <div class="settings-cards">
      <div class="settings-card">
        <h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Profile Information</h3>
        <div class="field"><label>Roll Number</label><input value="${esc(u.roll_number)}" disabled></div>
        <div class="field"><label>Name</label><input id="pf-name" value="${esc(u.name)}"></div>
        <div class="field"><label>Email</label><input id="pf-email" type="email" value="${esc(u.email || '')}" placeholder="Optional"></div>
        <div class="field"><label>Department</label><input id="pf-dept" value="${esc(u.department)}" ${u.role === 'admin' ? '' : 'disabled'}></div>
        <div class="field"><label>Role</label><input value="${esc(u.role)}" disabled></div>
        <div id="pf-msg" style="font-size:.85rem;min-height:20px;margin-bottom:8px"></div>
        <button class="btn btn-primary" id="save-profile-btn" style="width:auto;padding:8px 24px">Save Profile</button>
      </div>
      <div class="settings-card">
        <h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Change Password</h3>
        ${pwField('cp-old', 'Current Password', 'Current password')}
        ${pwField('cp-new', 'New Password', 'Min 8 characters')}
        ${pwField('cp-confirm', 'Confirm New Password', 'Repeat password')}
        <div id="cp-msg" style="font-size:.85rem;min-height:20px;margin-bottom:8px"></div>
        <button class="btn btn-primary" id="change-pw-btn" style="width:auto;padding:8px 24px">Update Password</button>
      </div>
      <div class="settings-card">
        <h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>API Key</h3>
        <p style="font-size:.85rem;color:var(--muted);margin-bottom:12px">Use this key in your projects to call MAC APIs from anywhere.</p>
        <div class="api-key-box">
          <code id="api-key-display">${esc(u.api_key || 'N/A')}</code>
          <button class="btn btn-sm btn-outline copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('api-key-display').textContent).then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)})">Copy</button>
        </div>
        <div style="margin-top:12px">
          <button class="btn btn-sm btn-danger-outline" id="regen-my-key">Regenerate Key</button>
        </div>
      </div>
    </div>`;

  bindEyeToggles(el);

  document.getElementById('save-profile-btn').onclick = async () => {
    const msg = document.getElementById('pf-msg');
    try {
      const r = await api('/auth/me/profile', {
        method: 'PUT',
        body: JSON.stringify({ name: document.getElementById('pf-name').value, email: document.getElementById('pf-email').value, department: document.getElementById('pf-dept')?.value }),
      });
      if (!r.ok) { const d = await r.json(); msg.innerHTML = `<span style="color:var(--danger)">${esc(d.detail?.message || 'Failed')}</span>`; return; }
      state.user = await apiJson('/auth/me');
      msg.innerHTML = '<span style="color:var(--success)">Profile updated <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><polyline points="20 6 9 17 4 12"/></svg></span>';
    } catch (ex) { msg.innerHTML = `<span style="color:var(--danger)">${esc(ex.message)}</span>`; }
  };

  document.getElementById('change-pw-btn').onclick = async () => {
    const msg = document.getElementById('cp-msg');
    msg.textContent = '';
    const oldPw = document.getElementById('cp-old').value;
    const newPw = document.getElementById('cp-new').value;
    const confPw = document.getElementById('cp-confirm').value;
    if (!oldPw || !newPw) { msg.innerHTML = '<span style="color:var(--danger)">All fields required</span>'; return; }
    if (newPw.length < 8) { msg.innerHTML = '<span style="color:var(--danger)">Min 8 characters</span>'; return; }
    if (newPw !== confPw) { msg.innerHTML = '<span style="color:var(--danger)">Passwords do not match</span>'; return; }
    try {
      const r = await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ old_password: oldPw, new_password: newPw }),
      });
      if (!r.ok) { const d = await r.json(); msg.innerHTML = `<span style="color:var(--danger)">${esc(d.detail?.message || 'Failed')}</span>`; return; }
      msg.innerHTML = '<span style="color:var(--success)">Password changed! <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><polyline points="20 6 9 17 4 12"/></svg></span>';
      document.getElementById('cp-old').value = '';
      document.getElementById('cp-new').value = '';
      document.getElementById('cp-confirm').value = '';
    } catch (ex) { msg.innerHTML = `<span style="color:var(--danger)">${esc(ex.message)}</span>`; }
  };

  const regenBtn = document.getElementById('regen-my-key');
  if (regenBtn) regenBtn.onclick = async () => {
    if (!confirm('Regenerate your API key? The old key will stop working immediately.')) return;
    try {
      const r = await apiJson('/keys/generate', { method: 'POST' });
      document.getElementById('api-key-display').textContent = r.api_key || r.key || 'Generated';
      state.user = await apiJson('/auth/me');
    } catch (ex) { alert('Failed: ' + ex.message); }
  };
}

/* ═══════════════════════════════════════════════════════════
   CHAT
   ═══════════════════════════════════════════════════════════ */
let currentSession = null;
let isStreaming = false;
let chatMode = 'ask'; // 'ask' or 'agent'

function canUseAgentMode() {
  const role = String(state.user?.role || '').toLowerCase();
  return role === 'faculty' || role === 'admin' || role === 'teacher';
}

function chatEmptyHtml() {
  return `<div class="chat-empty">
    <div class="chat-empty-hero">
      <div class="mac-glitch-logo"><span class="glitch" data-text="MAC">MAC</span></div>
      <div class="ctl-typewriter" id="ctl-typewriter"></div>
    </div>
  </div>`;
}
function startTypewriter() {
  const el = document.getElementById('ctl-typewriter');
  if (!el) return;
  el.innerHTML = '';
  const text = 'Cross the Limits';
  let i = 0;
  el.classList.add('typing');
  function type() {
    if (i < text.length) {
      el.textContent += text[i];
      i++;
      setTimeout(type, 60 + Math.random() * 40);
    } else {
      el.classList.remove('typing');
    }
  }
  setTimeout(type, 400);
}
function bindChatChips() {
  startTypewriter();
}

function renderChat() {
  const el = document.getElementById('page-content');
  el.className = 'page page-chat';
  const allowAgentMode = canUseAgentMode();
  if (!allowAgentMode) {
    chatMode = 'ask';
  }

  const sessions = getSessions();
  el.innerHTML = `
    <div class="chat-layout">
      <div class="chat-sessions" id="chat-sidebar">
        <div class="chat-sessions-header">
          <h3>Sessions</h3>
          <button class="btn btn-sm btn-outline" id="new-chat-btn">+ New</button>
        </div>
        <div class="session-list" id="session-list">
          ${sessions.map(s => sessionItem(s)).join('')}
        </div>
      </div>
      <div class="chat-resize-handle" id="chat-resize-handle"></div>
      <div class="chat-main">
        <div class="chat-messages" id="chat-messages">
          ${chatEmptyHtml()}
        </div>
        <div class="chat-input-wrap">
          <div class="chat-input-box">
            <textarea id="chat-input" placeholder="Ask MAC anything..." rows="1"></textarea>
            <div class="chat-input-actions">
              <div class="chat-input-left">
                <select id="model-select" class="model-pill"><option value="auto" selected>Auto</option></select>
                ${allowAgentMode
                  ? `<div class="agent-toggle" id="agent-toggle">
                  <span class="agent-mode-label active" data-mode="ask">Ask</span>
                  <span class="agent-mode-label" data-mode="agent">Agent</span>
                </div>`
                  : `<div class="agent-toggle" id="agent-toggle" title="Agent mode is available for faculty/admin only">
                  <span class="agent-mode-label active" data-mode="ask">Ask</span>
                </div>`}
              </div>
              <div class="chat-input-right">
                <span id="chat-status" class="chat-status-text"></span>
                <span id="active-model-badge" class="active-model-badge"></span>
                <button class="send-btn" id="send-btn" title="Send">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  bindChat();
  bindChatChips();
  if (sessions.length > 0 && !currentSession) loadSession(sessions[0].id);
}

function sessionItem(s) {
  const active = currentSession && currentSession.id === s.id;
  return `<div class="session-item ${active ? 'active' : ''}" data-id="${s.id}">
    <span>${esc(s.title || 'New Chat')}</span>
    <span class="del" data-del="${s.id}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>
  </div>`;
}

function bindChat() {
  document.getElementById('new-chat-btn').onclick = newChat;
  document.getElementById('send-btn').onclick = sendMessage;
  const input = document.getElementById('chat-input');
  input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  input.oninput = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; };
  document.getElementById('session-list').onclick = (e) => {
    const del = e.target.closest('[data-del]');
    if (del) { deleteSession(del.dataset.del); return; }
    const item = e.target.closest('.session-item');
    if (item) loadSession(item.dataset.id);
  };
  // Resizable session sidebar (VS Code style drag handle)
  const handle = document.getElementById('chat-resize-handle');
  const sidebar = document.getElementById('chat-sidebar');
  if (handle && sidebar) {
    let startX, startW;
    handle.onmousedown = (e) => {
      e.preventDefault();
      startX = e.clientX;
      startW = sidebar.getBoundingClientRect().width;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      function onMove(ev) {
        let w = startW + (ev.clientX - startX);
        if (w < 60) w = 0; // snap to collapsed
        else if (w < 140) w = 140; // minimum usable
        else if (w > 500) w = 500; // max
        sidebar.style.width = w + 'px';
        sidebar.classList.toggle('collapsed', w === 0);
        handle.classList.toggle('collapsed', w === 0);
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
    // Double-click to toggle collapse/expand
    handle.ondblclick = () => {
      const w = sidebar.getBoundingClientRect().width;
      if (w < 10) {
        sidebar.style.width = '240px';
        sidebar.classList.remove('collapsed');
        handle.classList.remove('collapsed');
      } else {
        sidebar.style.width = '0px';
        sidebar.classList.add('collapsed');
        handle.classList.add('collapsed');
      }
    };
  }
  // Agent mode toggle
  const agentToggle = document.getElementById('agent-toggle');
  if (agentToggle) {
    agentToggle.querySelectorAll('.agent-mode-label').forEach(lbl => {
      lbl.onclick = () => {
        if (lbl.dataset.mode === 'agent' && !canUseAgentMode()) {
          chatMode = 'ask';
          document.getElementById('chat-input').placeholder = 'Type a message...';
          return;
        }
        agentToggle.querySelectorAll('.agent-mode-label').forEach(l => l.classList.remove('active'));
        lbl.classList.add('active');
        chatMode = lbl.dataset.mode;
        document.getElementById('chat-input').placeholder = chatMode === 'agent' ? 'Describe a task for the agent...' : 'Type a message...';
      };
    });
  }
  loadModelOptions();
  loadActiveModelBadge();
}

async function loadModelOptions() {
  const sel = document.getElementById('model-select');
  try {
    const resp = await fetch(API + '/explore/models?model_type=chat&per_page=50');
    if (!resp.ok) return;
    const data = await resp.json();
    (data.models || []).forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name + (m.parameters ? ' (' + m.parameters + ')' : '');
      sel.appendChild(opt);
    });
  } catch (e) { /* API offline — auto option is enough */ }
  if (currentSession && currentSession.model) sel.value = currentSession.model;
}

async function loadActiveModelBadge() {
  const badge = document.getElementById('active-model-badge');
  if (!badge) return;
  try {
    const res = await fetch('/api/v1/explore/health');
    if (!res.ok) { badge.innerHTML = '<span class="model-dot model-dot-off"></span> Offline'; return; }
    const data = await res.json();
    const models = (data.nodes || []).flatMap(n => n.models_loaded || []);
    if (models.length > 0) {
      badge.innerHTML = '<span class="model-dot model-dot-on"></span> ' + esc(shortModel(models[0]));
      badge.title = 'Running: ' + models.join(', ');
    } else {
      badge.innerHTML = '<span class="model-dot model-dot-off"></span> No model';
    }
  } catch { badge.innerHTML = '<span class="model-dot model-dot-off"></span> Offline'; }
}

function newChat() {
  const id = 'chat-' + Date.now();
  const session = { id, title: 'New Chat', messages: [], model: 'auto', created: new Date().toISOString() };
  const sessions = getSessions();
  sessions.unshift(session);
  saveSessions(sessions);
  currentSession = session;
  renderChat();
  loadSession(id);
}

function loadSession(id) {
  const s = getSession(id);
  if (!s) return;
  currentSession = s;
  document.querySelectorAll('.session-item').forEach(el => el.classList.toggle('active', el.dataset.id === id));
  const msgs = document.getElementById('chat-messages');
  if (s.messages.length === 0) {
    msgs.innerHTML = chatEmptyHtml();
    startTypewriter();
  } else {
    msgs.innerHTML = s.messages.map(m =>
      `<div class="msg msg-${m.role}">${m.role === 'assistant' ? formatMd(m.content) : esc(m.content)}</div>`
    ).join('');
    msgs.scrollTop = msgs.scrollHeight;
  }
  if (s.model) document.getElementById('model-select').value = s.model;
}

function deleteSession(id) {
  saveSessions(getSessions().filter(s => s.id !== id));
  if (currentSession && currentSession.id === id) currentSession = null;
  renderChat();
}

async function sendMessage() {
  if (isStreaming) return;
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  if (!currentSession) newChat();
  const model = document.getElementById('model-select').value;
  currentSession.model = model;

  if (chatMode === 'agent' && !canUseAgentMode()) {
    chatMode = 'ask';
  }

  // Agent mode — delegate to agent runner
  if (chatMode === 'agent') {
    await sendAgentMessage(text);
    return;
  }

  currentSession.messages.push({ role: 'user', content: text });
  if (currentSession.title === 'New Chat') currentSession.title = text.slice(0, 40);
  persistSession();

  const msgs = document.getElementById('chat-messages');
  const emptyEl = msgs.querySelector('.chat-empty');
  if (emptyEl) emptyEl.remove();
  msgs.innerHTML += `<div class="msg msg-user">${esc(text)}</div>`;
  input.value = ''; input.style.height = 'auto';

  const assistantDiv = document.createElement('div');
  assistantDiv.className = 'msg msg-assistant';
  assistantDiv.innerHTML = macThinkingHTML();
  msgs.appendChild(assistantDiv);
  msgs.scrollTop = msgs.scrollHeight;
  startMacThinking(assistantDiv);

  const status = document.getElementById('chat-status');
  status.textContent = 'Generating...';
  isStreaming = true;

  try {
    const apiMessages = currentSession.messages.map(m => ({ role: m.role, content: m.content }));
    const res = await api('/query/chat', { method: 'POST', body: JSON.stringify({ messages: apiMessages, model, stream: true }) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.detail?.message || 'Request failed'); }

    let fullContent = '';
    stopMacThinking(assistantDiv);
    assistantDiv.textContent = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let streamError = null;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const chunk = JSON.parse(data);
            if (chunk.error) throw new Error(chunk.error.message);
            const delta = chunk.choices?.[0]?.delta?.content || '';
            if (delta) { fullContent += delta; assistantDiv.innerHTML = formatMd(fullContent); msgs.scrollTop = msgs.scrollHeight; }
          } catch (parseErr) { if (parseErr.message.includes('Backend') || parseErr.message.includes('model')) throw parseErr; }
        }
      }
    } catch (streamErr) {
      streamError = streamErr;
    }
    if (fullContent) {
      currentSession.messages.push({ role: 'assistant', content: fullContent });
      persistSession();
      const usedModel = model === 'auto' ? 'Qwen2.5-7B-AWQ' : shortModel(model);
      assistantDiv.innerHTML = formatMd(fullContent) + `<div class="msg-model-tag">answered by ${esc(usedModel)}</div>`;
    } else if (streamError) {
      throw streamError;
    } else {
      fullContent = '(No response)';
      currentSession.messages.push({ role: 'assistant', content: fullContent });
      persistSession();
      assistantDiv.innerHTML = formatMd(fullContent);
    }
  } catch (err) {
    stopMacThinking(assistantDiv);
    assistantDiv.innerHTML = `<span style="color:var(--danger)">Error: ${esc(err.message)}</span>`;
    currentSession.messages.push({ role: 'assistant', content: `Error: ${err.message}` });
    persistSession();
  }
  isStreaming = false;
  status.textContent = '';
  msgs.scrollTop = msgs.scrollHeight;
  const titleEl = document.querySelector(`.session-item[data-id="${currentSession.id}"] span:first-child`);
  if (titleEl) titleEl.textContent = currentSession.title;
}

function persistSession() {
  let sessions = getSessions();
  const idx = sessions.findIndex(s => s.id === currentSession.id);
  if (idx >= 0) sessions[idx] = currentSession; else sessions.unshift(currentSession);
  saveSessions(sessions);
}

/* ═══════════════════════════════════════════════════════════
   AGENT MODE — Plan-and-Execute with Streaming Steps
   ═══════════════════════════════════════════════════════════ */
async function sendAgentMessage(query) {
  const input = document.getElementById('chat-input');
  if (!currentSession) newChat();
  currentSession.messages.push({ role: 'user', content: query });
  if (currentSession.title === 'New Chat') currentSession.title = '[Agent] ' + query.slice(0, 35);
  persistSession();

  const msgs = document.getElementById('chat-messages');
  const emptyEl = msgs.querySelector('.chat-empty');
  if (emptyEl) emptyEl.remove();
  msgs.innerHTML += `<div class="msg msg-user">${esc(query)}</div>`;
  input.value = ''; input.style.height = 'auto';

  const assistantDiv = document.createElement('div');
  assistantDiv.className = 'msg msg-assistant';
  assistantDiv.innerHTML = macThinkingHTML();
  msgs.appendChild(assistantDiv);
  msgs.scrollTop = msgs.scrollHeight;
  startMacThinking(assistantDiv);

  const status = document.getElementById('chat-status');
  status.textContent = 'Agent working...';
  isStreaming = true;

  try {
    const res = await api('/agent/run', { method: 'POST', body: JSON.stringify({ query }) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.detail?.message || 'Agent failed'); }

    let stepsHtml = '';
    let finalAnswer = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        try {
          const evt = JSON.parse(raw);
          const evtType = evt.event || evt.type;
          if (evtType === 'plan') {
            stopMacThinking(assistantDiv);
            const steps = evt.plan || evt.steps || [];
            stepsHtml = '<div style="margin-bottom:12px;font-weight:700;font-size:.82rem">Plan:</div>';
            steps.forEach((s, i) => {
              const title = typeof s === 'string' ? s : (s.title || s.description || `Step ${i+1}`);
              stepsHtml += `<div class="agent-step" id="agent-step-${i}"><div class="agent-step-title">Step ${i + 1}: ${esc(title)}</div></div>`;
            });
            assistantDiv.innerHTML = stepsHtml;
          } else if (evtType === 'step_start') {
            const si = (evt.step_index !== undefined ? evt.step_index : (evt.step ? evt.step - 1 : 0));
            const stepEl = document.getElementById('agent-step-' + si);
            if (stepEl) stepEl.classList.add('running');
            status.textContent = 'Step ' + (si + 1) + '...';
          } else if (evtType === 'step_complete' || evtType === 'step_result' || evtType === 'tool_result') {
            const si = (evt.step_index !== undefined ? evt.step_index : (evt.step ? evt.step - 1 : 0));
            const stepEl = document.getElementById('agent-step-' + si);
            if (stepEl) {
              stepEl.classList.remove('running');
              stepEl.classList.add('done');
              const output = evt.output || (evt.result && JSON.stringify(evt.result).slice(0, 500));
              if (output) stepEl.innerHTML += `<div class="agent-step-output">${esc(String(output).slice(0, 500))}</div>`;
            }
          } else if (evtType === 'complete') {
            finalAnswer = evt.response || evt.content || '';
          } else if (evtType === 'answer') {
            finalAnswer = evt.content || evt.response || '';
          } else if (evtType === 'error') {
            stopMacThinking(assistantDiv);
            assistantDiv.innerHTML += `<div style="color:var(--danger);margin-top:8px;font-size:.85rem">Error: ${esc(evt.message || 'Unknown error')}</div>`;
          }
        } catch {}
      }
      msgs.scrollTop = msgs.scrollHeight;
    }

    if (finalAnswer) {
      assistantDiv.innerHTML += `<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">${formatMd(finalAnswer)}</div>`;
      currentSession.messages.push({ role: 'assistant', content: finalAnswer });
      persistSession();
    }
  } catch (ex) {
    stopMacThinking(assistantDiv);
    assistantDiv.innerHTML = `<div style="color:var(--danger)">Agent error: ${esc(ex.message)}</div>`;
  }

  status.textContent = '';
  isStreaming = false;
  msgs.scrollTop = msgs.scrollHeight;
}

/* ═══════════════════════════════════════════════════════════
   ADMIN PANEL — Full Control Dashboard
   ═══════════════════════════════════════════════════════════ */
let adminTab = 'overview';

async function renderAdmin() {
  const el = document.getElementById('page-content');
  if (!state.user || state.user.role !== 'admin') {
    el.innerHTML = '<div class="error-state"><p>Admin access required.</p></div>';
    return;
  }
  el.innerHTML = `
    <div class="admin-tabs" id="admin-tabs">
      <div class="admin-tab ${adminTab==='overview'?'active':''}" data-tab="overview">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
        <span>Overview</span>
      </div>
      <div class="admin-tab ${adminTab==='users'?'active':''}" data-tab="users">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <span>Users</span>
      </div>
      <div class="admin-tab ${adminTab==='keys'?'active':''}" data-tab="keys">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
        <span>API Keys</span>
      </div>
      <div class="admin-tab ${adminTab==='models'?'active':''}" data-tab="models">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        <span>Models</span>
      </div>
      <div class="admin-tab ${adminTab==='registry'?'active':''}" data-tab="registry">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        <span>Registry</span>
      </div>
      <div class="admin-tab ${adminTab==='cluster'?'active':''}" data-tab="cluster">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
        <span>Cluster</span>
      </div>
      <div class="admin-tab ${adminTab==='scoped_keys'?'active':''}" data-tab="scoped_keys">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
        <span>Scoped Keys</span>
      </div>
      <div class="admin-tab ${adminTab==='audit'?'active':''}" data-tab="audit">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
        <span>Audit Log</span>
      </div>
    </div>
    <div id="admin-content"><div class="loading-state"><div class="spinner"></div><span>Loading...</span></div></div>
  `;
  document.querySelectorAll('#admin-tabs .admin-tab').forEach(t => {
    t.onclick = () => { adminTab = t.dataset.tab; renderAdmin(); };
  });
  if (adminTab === 'overview') await renderAdminOverview();
  else if (adminTab === 'users') await renderAdminUsers();
  else if (adminTab === 'keys') await renderAdminKeys();
  else if (adminTab === 'models') await renderAdminModels();
  else if (adminTab === 'registry') await renderAdminRegistry();
  else if (adminTab === 'cluster') await renderAdminCluster();
  else if (adminTab === 'scoped_keys') await renderAdminScopedKeys();
  else if (adminTab === 'audit') await renderAdminAuditLog();
}

async function renderAdminOverview() {
  const el = document.getElementById('admin-content');
  try {
    const [stats, modelStats, exceeded, allUsage] = await Promise.all([
      apiJson('/auth/admin/stats'),
      apiJson('/usage/admin/models').catch(() => ({ models: [] })),
      apiJson('/quota/admin/exceeded').catch(() => ({ users: [] })),
      apiJson('/usage/admin/all?per_page=100').catch(() => ({ users: [] })),
    ]);

    const allUsers = allUsage.users || [];
    // Department breakdown
    const deptMap = {};
    allUsers.forEach(u => { deptMap[u.department] = (deptMap[u.department] || 0) + 1; });
    // Top users by tokens
    const topUsers = [...allUsers].sort((a, b) => (b.tokens_today || 0) - (a.tokens_today || 0)).slice(0, 5);
    const models = modelStats.models || [];
    const exceededUsers = exceeded.users || [];

    el.innerHTML = `
      <div class="stats-grid stats-3">
        <div class="stat-card accent">
          <div class="stat-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
          <div class="stat-body">
            <div class="label">Total Users</div>
            <div class="value">${stats.total_users}</div>
            <div class="sub">${stats.active_users} active · ${stats.admin_count} admins</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
          <div class="stat-body">
            <div class="label">Requests Today</div>
            <div class="value">${fmtNum(stats.requests_today)}</div>
            <div class="sub">across all users</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg></div>
          <div class="stat-body">
            <div class="label">Tokens Today</div>
            <div class="value">${fmtNum(stats.tokens_today)}</div>
            <div class="sub">total consumed</div>
          </div>
        </div>
      </div>

      <div class="charts-row">
        <div class="chart-card flex-1">
          <div class="chart-header">
            <h3>Model Performance</h3>
            <span class="chart-sub">Today's stats per model</span>
          </div>
          ${models.length > 0 ? `
          <div class="table-responsive">
          <table class="data-table">
            <thead><tr><th>Model</th><th>Requests</th><th>Tokens</th><th>Avg Latency</th><th>Users</th></tr></thead>
            <tbody>
              ${models.map(m => `
                <tr>
                  <td><span class="model-tag">${esc(shortModel(m.model))}</span></td>
                  <td>${fmtNum(m.requests_today)}</td>
                  <td>${fmtNum(m.tokens_today)}</td>
                  <td>${m.avg_latency_ms || 0}ms</td>
                  <td>${m.unique_users_today || 0}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          </div>
          ` : '<div class="empty-state"><p>No model usage data yet</p></div>'}
        </div>
        <div class="chart-card flex-1">
          <div class="chart-header">
            <h3>Department Distribution</h3>
          </div>
          <div style="height:220px"><canvas id="admin-dept-chart"></canvas></div>
        </div>
      </div>

      <div class="charts-row">
        <div class="chart-card flex-1">
          <div class="chart-header">
            <h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg> Top Users Today</h3>
            <span class="chart-sub">By token consumption</span>
          </div>
          ${topUsers.length > 0 ? `
          <div class="top-users-list">
            ${topUsers.map((u, i) => `
              <div class="top-user-row">
                <span class="rank">#${i + 1}</span>
                <div class="top-user-info">
                  <span class="name">${esc(u.name)}</span>
                  <span class="muted">${esc(u.roll_number)} · ${esc(u.department)}</span>
                </div>
                <div class="top-user-bar-wrap">
                  <div class="top-user-bar" style="width:${Math.max(5, ((u.tokens_today || 0) / (topUsers[0].tokens_today || 1)) * 100)}%"></div>
                </div>
                <span class="top-user-val">${fmtNum(u.tokens_today || 0)}</span>
              </div>
            `).join('')}
          </div>
          ` : '<div class="empty-state"><p>No usage yet today</p></div>'}
        </div>
        <div class="chart-card flex-1">
          <div class="chart-header">
            <h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Quota Exceeded</h3>
            <span class="chart-sub">Users who hit their daily limit</span>
          </div>
          ${exceededUsers.length > 0 ? `
          <div class="table-responsive">
          <table class="data-table">
            <thead><tr><th>User</th><th>Dept</th><th>Used</th><th>Limit</th><th>Over by</th></tr></thead>
            <tbody>
              ${exceededUsers.map(u => `
                <tr>
                  <td><strong>${esc(u.name || u.roll_number)}</strong></td>
                  <td>${esc(u.department)}</td>
                  <td>${fmtNum(u.tokens_used)}</td>
                  <td>${fmtNum(u.daily_limit)}</td>
                  <td class="danger">${fmtNum(u.exceeded_by || 0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          </div>
          ` : '<div class="empty-state" style="padding:24px"><p><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><polyline points="20 6 9 17 4 12"/></svg> No one has exceeded their quota</p></div>'}
        </div>
      </div>
    `;

    // Department chart
    const deptLabels = Object.keys(deptMap);
    const deptValues = Object.values(deptMap);
    if (deptLabels.length > 0) {
      const deptColors = ['#000', '#333', '#666', '#999', '#bbb', '#ddd'];
      new Chart(document.getElementById('admin-dept-chart'), {
        type: 'bar',
        data: {
          labels: deptLabels,
          datasets: [{ data: deptValues, backgroundColor: deptColors.slice(0, deptLabels.length), borderRadius: 6, barPercentage: 0.6 }],
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { display: false } } } },
      });
    }

  } catch (ex) { el.innerHTML = `<div class="error-state"><p>Error: ${esc(ex.message)}</p></div>`; }
}

async function renderAdminUsers() {
  const el = document.getElementById('admin-content');
  try {
    const data = await apiJson('/auth/admin/users');
    const users = data.users || [];
    el.innerHTML = `
      <div class="admin-header">
        <h2>User Management <span class="badge" style="background:#eee;color:#000;font-size:.75rem;vertical-align:middle">${users.length}</span></h2>
        <button class="btn btn-sm btn-primary" id="add-user-btn" style="width:auto;padding:8px 16px">+ Add User</button>
      </div>
      <div class="table-responsive">
      <table class="data-table">
        <thead><tr><th>Roll No</th><th>Name</th><th>Dept</th><th>Role</th><th>Status</th><th>Pwd</th><th>Joined</th><th>Actions</th></tr></thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td class="mono bold">${esc(u.roll_number)}</td>
              <td>${esc(u.name)}</td>
              <td>${esc(u.department)}</td>
              <td><span class="badge badge-${u.role}">${u.role}</span></td>
              <td>${u.is_active ? '<span class="dot-success"></span> Active' : '<span class="dot-error"></span> Inactive'}</td>
              <td>${u.must_change_password ? '<span style="color:var(--danger)">Pending</span>' : '<span class="muted">Set</span>'}</td>
              <td class="muted">${new Date(u.created_at).toLocaleDateString()}</td>
              <td>
                <div class="action-btns">
                  <button class="icon-btn edit-user" data-uid="${u.id}" data-name="${esc(u.name)}" data-email="${esc(u.email||'')}" data-dept="${esc(u.department)}" data-role="${u.role}" title="Edit user"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                  <select class="role-select" data-uid="${u.id}" title="Change role">
                    <option value="student" ${u.role==='student'?'selected':''}>Student</option>
                    <option value="faculty" ${u.role==='faculty'?'selected':''}>Faculty</option>
                    <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
                  </select>
                  <button class="icon-btn toggle-status" data-uid="${u.id}" data-active="${u.is_active}" title="${u.is_active ? 'Deactivate' : 'Activate'}">
                    ${u.is_active ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>'}
                  </button>
                  <button class="icon-btn reset-pw" data-uid="${u.id}" title="Reset password"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg></button>
                  <button class="icon-btn regen-key" data-uid="${u.id}" title="Regenerate API key"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      </div>`;

    el.querySelectorAll('.role-select').forEach(sel => {
      sel.onchange = async () => { try { await api(`/auth/admin/users/${sel.dataset.uid}/role`, { method: 'PUT', body: JSON.stringify({ role: sel.value }) }); renderAdmin(); } catch { alert('Failed'); } };
    });
    el.querySelectorAll('.edit-user').forEach(btn => {
      btn.onclick = () => showEditUserModal(btn.dataset.uid, btn.dataset.name, btn.dataset.email, btn.dataset.dept, btn.dataset.role);
    });
    el.querySelectorAll('.toggle-status').forEach(btn => {
      btn.onclick = async () => { try { await api(`/auth/admin/users/${btn.dataset.uid}/status`, { method: 'PUT', body: JSON.stringify({ is_active: btn.dataset.active !== 'true' }) }); renderAdmin(); } catch { alert('Failed'); } };
    });
    el.querySelectorAll('.reset-pw').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Reset this user\'s password?')) return;
        try { const r = await apiJson(`/auth/admin/users/${btn.dataset.uid}/reset-password`, { method: 'POST' }); alert(`Temp password: ${r.temp_password}\nUser must change on next login.`); renderAdmin(); } catch { alert('Failed'); }
      };
    });
    el.querySelectorAll('.regen-key').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Regenerate API key? Old key will stop working.')) return;
        try { const r = await apiJson(`/auth/admin/users/${btn.dataset.uid}/regenerate-key`, { method: 'POST' }); alert(`New key: ${r.api_key}`); renderAdmin(); } catch { alert('Failed'); }
      };
    });
    document.getElementById('add-user-btn').onclick = showAddUserModal;
  } catch (ex) { el.innerHTML = `<div class="error-state"><p>Error: ${esc(ex.message)}</p></div>`; }
}

async function renderAdminKeys() {
  const el = document.getElementById('admin-content');
  try {
    const data = await apiJson('/keys/admin/all');
    const keys = data.keys || [];
    el.innerHTML = `
      <div class="admin-header">
        <h2>API Key Management <span class="badge" style="background:#eee;color:#000;font-size:.75rem;vertical-align:middle">${keys.length}</span></h2>
      </div>
      <div class="table-responsive">
      <table class="data-table">
        <thead><tr><th>Roll No</th><th>Name</th><th>Key Prefix</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${keys.map(k => `
            <tr>
              <td class="mono bold">${esc(k.roll_number)}</td>
              <td>${esc(k.name)}</td>
              <td class="mono">${esc(k.prefix || k.api_key_prefix || '---')}</td>
              <td>${k.active !== false ? '<span class="dot-success"></span> Active' : '<span class="dot-error"></span> Revoked'}</td>
              <td>
                <button class="btn btn-sm btn-danger-outline revoke-key" data-roll="${esc(k.roll_number)}">Revoke</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      </div>`;

    el.querySelectorAll('.revoke-key').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm(`Revoke API key for ${btn.dataset.roll}?`)) return;
        try { await api('/keys/admin/revoke', { method: 'POST', body: JSON.stringify({ roll_number: btn.dataset.roll }) }); renderAdmin(); } catch { alert('Failed'); }
      };
    });
  } catch (ex) { el.innerHTML = `<div class="error-state"><p>Error: ${esc(ex.message)}</p></div>`; }
}

async function renderAdminModels() {
  const el = document.getElementById('admin-content');
  try {
    const [modelsData, modelStats] = await Promise.all([
      apiJson('/models'),
      apiJson('/usage/admin/models').catch(() => ({ models: [] })),
    ]);
    const models = modelsData.models || [];
    const stats = modelStats.models || [];

    el.innerHTML = `
      <div class="admin-header"><h2>Model Status & Analytics</h2></div>
      <div class="models-grid-admin">
        ${models.map(m => {
          const s = stats.find(st => st.model === m.id) || {};
          return `
          <div class="model-card-admin">
            <div class="model-card-header">
              <span class="model-name">${esc(m.id || m.name)}</span>
              <span class="model-status ${m.status === 'loaded' ? 'online' : 'offline'}">${m.status === 'loaded' ? '<span class="status-dot on"></span> Online' : '<span class="status-dot off"></span> Offline'}</span>
            </div>
            <div class="model-stats-row">
              <div><span class="label">Requests</span><span class="val">${fmtNum(s.requests_today || 0)}</span></div>
              <div><span class="label">Tokens</span><span class="val">${fmtNum(s.tokens_today || 0)}</span></div>
              <div><span class="label">Latency</span><span class="val">${s.avg_latency_ms || 0}ms</span></div>
              <div><span class="label">Users</span><span class="val">${s.unique_users_today || 0}</span></div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
  } catch (ex) { el.innerHTML = `<div class="error-state"><p>Error: ${esc(ex.message)}</p></div>`; }
}

function showEditUserModal(uid, name, email, dept, role) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>Edit User</h3>
      <div class="field"><label>Name</label><input type="text" id="eu-name" value="${esc(name)}"></div>
      <div class="field"><label>Email</label><input type="email" id="eu-email" value="${esc(email)}"></div>
      <div class="field"><label>Department</label>
        <select id="eu-dept"><option${dept==='CSE'?' selected':''}>CSE</option><option${dept==='ECE'?' selected':''}>ECE</option><option${dept==='ME'?' selected':''}>ME</option><option${dept==='CE'?' selected':''}>CE</option><option${dept==='EE'?' selected':''}>EE</option><option${dept==='IT'?' selected':''}>IT</option><option${dept==='Other'?' selected':''}>Other</option></select>
      </div>
      <div class="field"><label>Role</label>
        <select id="eu-role"><option value="student"${role==='student'?' selected':''}>Student</option><option value="faculty"${role==='faculty'?' selected':''}>Faculty</option><option value="admin"${role==='admin'?' selected':''}>Admin</option></select>
      </div>
      <div id="eu-error" style="color:var(--danger);font-size:.85rem;min-height:20px"></div>
      <div class="modal-actions">
        <button class="btn btn-sm btn-outline" id="eu-cancel">Cancel</button>
        <button class="btn btn-sm btn-primary" id="eu-submit" style="width:auto;padding:8px 20px">Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#eu-cancel').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.querySelector('#eu-submit').onclick = async () => {
    const err = overlay.querySelector('#eu-error');
    err.textContent = '';
    const body = {
      name: overlay.querySelector('#eu-name').value.trim(),
      email: overlay.querySelector('#eu-email').value.trim() || null,
      department: overlay.querySelector('#eu-dept').value,
      role: overlay.querySelector('#eu-role').value,
    };
    if (!body.name) { err.textContent = 'Name is required'; return; }
    try {
      const r = await api(`/auth/admin/users/${uid}`, { method: 'PUT', body: JSON.stringify(body) });
      if (!r.ok) { const d = await r.json(); err.textContent = d.detail?.message || 'Failed'; return; }
      overlay.remove(); renderAdmin();
    } catch (ex) { err.textContent = ex.message; }
  };
}

function showAddUserModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>Add New User</h3>
      <div class="field"><label>Roll Number / Username</label><input type="text" id="nu-roll" placeholder="e.g. 22ME010"></div>
      <div class="field"><label>Name</label><input type="text" id="nu-name" placeholder="Full name"></div>
      <div class="field"><label>Email</label><input type="email" id="nu-email" placeholder="Optional"></div>
      ${pwField('nu-pass', 'Initial Password', 'Min 8 characters')}
      <div class="field"><label>Department</label>
        <select id="nu-dept"><option>CSE</option><option>ECE</option><option>ME</option><option>CE</option><option>EE</option><option>Other</option></select>
      </div>
      <div class="field"><label>Role</label>
        <select id="nu-role"><option value="student" selected>Student</option><option value="faculty">Faculty</option><option value="admin">Admin</option></select>
      </div>
      <div class="field">
        <label><input type="checkbox" id="nu-forcecp" checked style="width:auto;margin-right:6px">Force password change on first login</label>
      </div>
      <div id="nu-error" style="color:var(--danger);font-size:.85rem;min-height:20px"></div>
      <div class="modal-actions">
        <button class="btn btn-sm btn-outline" id="nu-cancel">Cancel</button>
        <button class="btn btn-sm btn-primary" id="nu-submit" style="width:auto;padding:8px 20px">Create User</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  bindEyeToggles(overlay);
  overlay.querySelector('#nu-cancel').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.querySelector('#nu-submit').onclick = async () => {
    const err = overlay.querySelector('#nu-error');
    err.textContent = '';
    const body = {
      roll_number: overlay.querySelector('#nu-roll').value.trim(),
      name: overlay.querySelector('#nu-name').value.trim(),
      password: overlay.querySelector('#nu-pass').value,
      email: overlay.querySelector('#nu-email').value.trim() || null,
      department: overlay.querySelector('#nu-dept').value,
      role: overlay.querySelector('#nu-role').value,
      must_change_password: overlay.querySelector('#nu-forcecp').checked,
    };
    if (!body.roll_number || !body.name || !body.password) { err.textContent = 'Roll number, name, password required'; return; }
    if (body.password.length < 8) { err.textContent = 'Password min 8 characters'; return; }
    try {
      const r = await api('/auth/admin/users', { method: 'POST', body: JSON.stringify(body) });
      if (!r.ok) { const d = await r.json(); err.textContent = d.detail?.message || 'Failed'; return; }
      overlay.remove(); renderAdmin();
    } catch (ex) { err.textContent = ex.message; }
  };
}

async function renderAdminRegistry() {
  const el = document.getElementById('admin-content');
  try {
    const data = await apiJson('/auth/admin/registry');
    const entries = data.entries || [];
    el.innerHTML = `
      <div class="admin-header">
        <h2>Student Registry <span class="badge" style="background:#eee;color:#000;font-size:.75rem;vertical-align:middle">${entries.length}</span></h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm btn-outline" id="add-reg-btn">+ Add Student</button>
          <button class="btn btn-sm btn-primary" id="bulk-reg-btn">Bulk Import</button>
        </div>
      </div>
      <p style="font-size:.85rem;color:var(--muted);margin-bottom:16px">College database. Students verify against this to create accounts.</p>
      <div class="table-responsive">
      <table class="data-table">
        <thead><tr><th>Roll No</th><th>Name</th><th>Dept</th><th>DOB</th><th>Batch</th></tr></thead>
        <tbody>
          ${entries.map(e => `
            <tr>
              <td class="mono bold">${esc(e.roll_number)}</td>
              <td>${esc(e.name)}</td>
              <td>${esc(e.department)}</td>
              <td>${esc(e.dob)}</td>
              <td>${e.batch_year || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      </div>`;

    document.getElementById('add-reg-btn').onclick = () => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal">
          <h3>Add Student to Registry</h3>
          <div class="field"><label>Roll Number</label><input id="rg-roll" placeholder="e.g. 23CS050"></div>
          <div class="field"><label>Name</label><input id="rg-name" placeholder="Full name"></div>
          <div class="field"><label>Department</label>
            <select id="rg-dept"><option>CSE</option><option>ECE</option><option>ME</option><option>CE</option><option>EE</option><option>Other</option></select>
          </div>
          <div class="field"><label>Date of Birth (DD-MM-YYYY)</label><input id="rg-dob" placeholder="15-08-2004" maxlength="10"></div>
          <div class="field"><label>Batch Year</label><input id="rg-batch" type="number" placeholder="2023"></div>
          <div id="rg-error" style="color:var(--danger);font-size:.85rem;min-height:20px"></div>
          <div class="modal-actions">
            <button class="btn btn-sm btn-outline" id="rg-cancel">Cancel</button>
            <button class="btn btn-sm btn-primary" id="rg-submit" style="width:auto;padding:8px 20px">Add</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#rg-cancel').onclick = () => overlay.remove();
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
      overlay.querySelector('#rg-submit').onclick = async () => {
        const err = overlay.querySelector('#rg-error');
        err.textContent = '';
        const body = {
          roll_number: overlay.querySelector('#rg-roll').value.trim(),
          name: overlay.querySelector('#rg-name').value.trim(),
          department: overlay.querySelector('#rg-dept').value,
          dob: overlay.querySelector('#rg-dob').value.trim(),
          batch_year: parseInt(overlay.querySelector('#rg-batch').value) || null,
        };
        if (!body.roll_number || !body.name || !body.dob) { err.textContent = 'All fields except batch required'; return; }
        try {
          const r = await api('/auth/admin/registry', { method: 'POST', body: JSON.stringify(body) });
          if (!r.ok) { const d = await r.json(); err.textContent = d.detail?.message || 'Failed'; return; }
          overlay.remove(); renderAdmin();
        } catch (ex) { err.textContent = ex.message; }
      };
    };

    document.getElementById('bulk-reg-btn').onclick = () => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal">
          <h3>Bulk Import Students</h3>
          <p style="font-size:.85rem;color:var(--muted);margin-bottom:12px">Paste JSON array. Each: <code>{ roll_number, name, department, dob, batch_year }</code></p>
          <textarea id="bulk-json" rows="8" style="width:100%;font-family:monospace;font-size:.8rem" placeholder='[{"roll_number":"23CS001","name":"Name","department":"CSE","dob":"10-05-2005","batch_year":2023}]'></textarea>
          <div id="bulk-error" style="color:var(--danger);font-size:.85rem;min-height:20px;margin-top:8px"></div>
          <div id="bulk-result" style="font-size:.85rem;min-height:20px;margin-top:4px"></div>
          <div class="modal-actions">
            <button class="btn btn-sm btn-outline" id="bulk-cancel">Cancel</button>
            <button class="btn btn-sm btn-primary" id="bulk-submit" style="width:auto;padding:8px 20px">Import</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#bulk-cancel').onclick = () => overlay.remove();
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
      overlay.querySelector('#bulk-submit').onclick = async () => {
        const err = overlay.querySelector('#bulk-error');
        const res = overlay.querySelector('#bulk-result');
        err.textContent = ''; res.textContent = '';
        let students;
        try { students = JSON.parse(overlay.querySelector('#bulk-json').value); } catch { err.textContent = 'Invalid JSON'; return; }
        if (!Array.isArray(students)) { err.textContent = 'Must be array'; return; }
        try {
          const r = await apiJson('/auth/admin/registry/bulk', { method: 'POST', body: JSON.stringify({ students }) });
          res.innerHTML = `<span style="color:var(--success)">${esc(r.message)}</span>` +
            (r.errors?.length ? `<br><span style="color:var(--danger)">Errors: ${r.errors.join(', ')}</span>` : '');
        } catch (ex) { err.textContent = ex.message; }
      };
    };
  } catch (ex) { el.innerHTML = `<div class="error-state"><p>Error: ${esc(ex.message)}</p></div>`; }
}

/* ═══════════════════════════════════════════════════════════
   ADMIN — Cluster / Nodes Management
   ═══════════════════════════════════════════════════════════ */
async function renderAdminCluster() {
  const el = document.getElementById('admin-content');
  try {
    const data = await apiJson('/nodes');
    const nodes = data.nodes || [];
    el.innerHTML = `
      <div class="admin-header">
        <h2>GPU Cluster <span class="badge" style="background:#eee;color:#000;font-size:.75rem;vertical-align:middle">${nodes.length} nodes</span></h2>
        <button class="btn btn-sm btn-primary" id="gen-enroll-token" style="width:auto;padding:8px 16px">+ Enrollment Token</button>
      </div>
      <div class="nodes-grid">
        ${nodes.length === 0 ? '<div class="empty-state"><p>No worker nodes enrolled yet. Generate an enrollment token to add GPU workers.</p></div>' : nodes.map(n => `
          <div class="node-card">
            <div class="node-card-header">
              <span class="node-name">${esc(n.name)}</span>
              <span class="node-status ${n.status === 'online' ? 'online' : n.status === 'draining' ? 'draining' : 'offline'}">${esc(n.status)}</span>
            </div>
            <div style="font-size:.75rem;color:var(--muted);margin-bottom:8px">${esc(n.ip_address || '')}:${n.port || ''} · ${esc(n.gpu_name || 'Unknown GPU')} · ${n.gpu_vram_mb ? Math.round(n.gpu_vram_mb/1024) + 'GB VRAM' : ''}</div>
            <div class="node-metrics">
              <div class="node-metric"><span class="metric-val">${n.gpu_util_pct != null ? n.gpu_util_pct + '%' : '--'}</span><span class="metric-lbl">GPU</span></div>
              <div class="node-metric"><span class="metric-val">${n.cpu_util_pct != null ? n.cpu_util_pct + '%' : '--'}</span><span class="metric-lbl">CPU</span></div>
              <div class="node-metric"><span class="metric-val">${n.ram_used_mb && n.ram_total_mb ? Math.round(n.ram_used_mb/n.ram_total_mb*100) + '%' : '--'}</span><span class="metric-lbl">RAM</span></div>
              <div class="node-metric"><span class="metric-val">${n.gpu_vram_used_mb && n.gpu_vram_mb ? Math.round(n.gpu_vram_used_mb/n.gpu_vram_mb*100) + '%' : '--'}</span><span class="metric-lbl">VRAM</span></div>
            </div>
            <div style="margin-top:12px;display:flex;gap:6px">
              ${n.status === 'online' ? `<button class="btn btn-sm btn-outline drain-node" data-id="${n.id}">Drain</button>` : ''}
              ${n.status === 'draining' || n.status === 'offline' ? `<button class="btn btn-sm btn-outline activate-node" data-id="${n.id}">Activate</button>` : ''}
              <button class="btn btn-sm btn-danger-outline remove-node" data-id="${n.id}">Remove</button>
            </div>
          </div>
        `).join('')}
      </div>`;

    document.getElementById('gen-enroll-token').onclick = async () => {
      const label = prompt('Label for this token (e.g. "PC3-GPU"):');
      if (!label) return;
      try {
        const r = await apiJson('/nodes/enrollment-token', { method: 'POST', body: JSON.stringify({ label, expires_in_hours: 24 }) });
        alert('Enrollment Token (use within 24h):\\n\\n' + r.token + '\\n\\nLabel: ' + r.label);
      } catch (ex) { alert('Failed: ' + ex.message); }
    };
    el.querySelectorAll('.drain-node').forEach(btn => {
      btn.onclick = async () => { try { await api('/nodes/' + btn.dataset.id + '/drain', { method: 'POST' }); renderAdmin(); } catch { alert('Failed'); } };
    });
    el.querySelectorAll('.activate-node').forEach(btn => {
      btn.onclick = async () => { try { await api('/nodes/' + btn.dataset.id + '/activate', { method: 'POST' }); renderAdmin(); } catch { alert('Failed'); } };
    });
    el.querySelectorAll('.remove-node').forEach(btn => {
      btn.onclick = async () => { if (!confirm('Remove this node?')) return; try { await api('/nodes/' + btn.dataset.id, { method: 'DELETE' }); renderAdmin(); } catch { alert('Failed'); } };
    });
  } catch (ex) { el.innerHTML = `<div class="error-state"><p>Error: ${esc(ex.message)}</p></div>`; }
}

/* ═══════════════════════════════════════════════════════════
   ADMIN — Scoped API Keys
   ═══════════════════════════════════════════════════════════ */
async function renderAdminScopedKeys() {
  const el = document.getElementById('admin-content');
  try {
    const data = await apiJson('/scoped-keys/admin/all');
    const keys = data.keys || [];
    el.innerHTML = `
      <div class="admin-header">
        <h2>Scoped API Keys <span class="badge" style="background:#eee;color:#000;font-size:.75rem;vertical-align:middle">${keys.length}</span></h2>
      </div>
      ${keys.length === 0 ? '<div class="empty-state"><p>No scoped API keys created yet</p></div>' : `
      <div class="table-responsive">
      <table class="data-table">
        <thead><tr><th>Owner</th><th>Name</th><th>Models</th><th>Req/hr</th><th>Tok/day</th><th>Usage</th><th>Expires</th><th>Actions</th></tr></thead>
        <tbody>
          ${keys.map(k => `
            <tr>
              <td class="mono bold">${esc(k.user_roll || k.user_id)}</td>
              <td>${esc(k.name)}</td>
              <td>${(k.allowed_models || []).map(m => '<span class="model-tag">' + esc(m) + '</span>').join(' ') || '<span class="muted">All</span>'}</td>
              <td>${k.requests_per_hour || '∞'}</td>
              <td>${fmtNum(k.tokens_per_day || 0)}</td>
              <td>${fmtNum(k.total_requests || 0)} req / ${fmtNum(k.total_tokens || 0)} tok</td>
              <td class="muted">${k.expires_at ? new Date(k.expires_at).toLocaleDateString() : 'Never'}</td>
              <td><button class="btn btn-sm btn-danger-outline revoke-scoped" data-id="${k.id}">Revoke</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      </div>`}`;

    el.querySelectorAll('.revoke-scoped').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Revoke this scoped key?')) return;
        try { await api('/scoped-keys/admin/' + btn.dataset.id, { method: 'DELETE' }); renderAdmin(); } catch { alert('Failed'); }
      };
    });
  } catch (ex) { el.innerHTML = `<div class="error-state"><p>Error: ${esc(ex.message)}</p></div>`; }
}

/* ═══════════════════════════════════════════════════════════
   ADMIN — Audit Log
   ═══════════════════════════════════════════════════════════ */
async function renderAdminAuditLog() {
  const el = document.getElementById('admin-content');
  try {
    const data = await apiJson('/notifications/audit-logs?per_page=100');
    const logs = data.logs || [];
    el.innerHTML = `
      <div class="admin-header">
        <h2>Audit Log <span class="badge" style="background:#eee;color:#000;font-size:.75rem;vertical-align:middle">${logs.length}</span></h2>
      </div>
      ${logs.length === 0 ? '<div class="empty-state"><p>No audit events recorded yet</p></div>' : `
      <div class="table-responsive">
      <table class="data-table">
        <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th><th>Details</th><th>IP</th></tr></thead>
        <tbody>
          ${logs.map(l => `
            <tr>
              <td class="muted" style="white-space:nowrap">${timeAgo(l.created_at)}</td>
              <td class="mono">${esc(l.actor_roll || l.actor_id || 'system')}</td>
              <td><span class="audit-action">${esc(l.action)}</span></td>
              <td><span class="muted">${esc(l.resource_type || '')}${l.resource_id ? '#' + l.resource_id : ''}</span></td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(l.details || '')}">${esc((l.details || '').slice(0, 80))}</td>
              <td class="mono muted">${esc(l.ip_address || '-')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      </div>`}`;
  } catch (ex) { el.innerHTML = `<div class="error-state"><p>Error: ${esc(ex.message)}</p></div>`; }
}

/* ═══════════════════════════════════════════════════════════
   DOUBTS PAGE — Student Questions to Faculty
   ═══════════════════════════════════════════════════════════ */
let doubtView = 'list';
let doubtDetailId = null;
let doubtFilter = 'all';

async function renderDoubts() {
  const el = document.getElementById('page-content');
  if (doubtView === 'detail' && doubtDetailId) {
    await renderDoubtDetail(el, doubtDetailId);
    return;
  }
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>Loading doubts...</span></div>';
  try {
    const u = state.user || {};
    const isFacultyOrAdmin = u.role === 'faculty' || u.role === 'admin';
    let endpoint = isFacultyOrAdmin ? '/doubts/all' : '/doubts/my';
    if (doubtFilter !== 'all') endpoint += '?status=' + doubtFilter;
    const data = await apiJson(endpoint);
    const doubts = data.doubts || [];

    el.innerHTML = `
      <div class="admin-header">
        <h2>Doubts & Questions</h2>
        <button class="btn btn-sm btn-primary" id="new-doubt-btn" style="width:auto;padding:8px 16px">+ Ask Question</button>
      </div>
      <div class="doubt-filters">
        <select id="doubt-filter-status">
          <option value="all" ${doubtFilter==='all'?'selected':''}>All Status</option>
          <option value="open" ${doubtFilter==='open'?'selected':''}>Open</option>
          <option value="answered" ${doubtFilter==='answered'?'selected':''}>Answered</option>
          <option value="closed" ${doubtFilter==='closed'?'selected':''}>Closed</option>
        </select>
      </div>
      ${doubts.length === 0 ? '<div class="empty-state"><p>No doubts found. Ask a question to get started!</p></div>' :
        doubts.map(d => `
          <div class="doubt-card" data-doubt-id="${d.id}">
            <div class="doubt-card-header">
              <span class="doubt-title">${esc(d.title)}</span>
              <span class="doubt-status ${d.status}">${esc(d.status)}</span>
            </div>
            <div class="doubt-meta">
              <span>${esc(d.department || '')}${d.subject ? ' · ' + esc(d.subject) : ''}</span>
              <span>${d.is_anonymous ? 'Anonymous' : esc(d.student_name || '')}</span>
              <span>${timeAgo(d.created_at)}</span>
              ${d.reply_count ? '<span>' + d.reply_count + ' replies</span>' : ''}
            </div>
            <div class="doubt-body-preview">${esc((d.body || '').slice(0, 200))}</div>
          </div>
        `).join('')}`;

    document.getElementById('doubt-filter-status').onchange = (e) => { doubtFilter = e.target.value; renderDoubts(); };
    el.querySelectorAll('.doubt-card').forEach(card => {
      card.onclick = () => { doubtDetailId = card.dataset.doubtId; doubtView = 'detail'; renderDoubts(); };
    });
    document.getElementById('new-doubt-btn').onclick = showNewDoubtModal;
  } catch (ex) { el.innerHTML = `<div class="error-state"><p>Error: ${esc(ex.message)}</p></div>`; }
}

async function renderDoubtDetail(el, id) {
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>Loading...</span></div>';
  try {
    const data = await apiJson('/doubts/' + id);
    const d = data.doubt || data;
    const replies = data.replies || [];
    const u = state.user || {};
    const canReply = u.role === 'faculty' || u.role === 'admin' || u.id === d.student_id;
    el.innerHTML = `
      <div class="doubt-detail-panel">
        <button class="btn btn-sm btn-outline" id="doubt-back" style="margin-bottom:16px">← Back to list</button>
        <div class="doubt-card-header">
          <span class="doubt-title" style="font-size:1.1rem">${esc(d.title)}</span>
          <span class="doubt-status ${d.status}">${esc(d.status)}</span>
        </div>
        <div class="doubt-meta" style="margin:8px 0 16px">
          <span>${esc(d.department || '')}${d.subject ? ' · ' + esc(d.subject) : ''}</span>
          <span>${d.is_anonymous ? 'Anonymous' : esc(d.student_name || '')}</span>
          <span>${timeAgo(d.created_at)}</span>
        </div>
        <div style="font-size:.9rem;line-height:1.7;padding:16px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius)">${formatMd(d.body || '')}</div>
        <div class="doubt-replies">
          <h3 style="font-size:.9rem;font-weight:700;margin-bottom:12px">Replies (${replies.length})</h3>
          ${replies.length === 0 ? '<div class="empty-state"><p>No replies yet</p></div>' :
            replies.map(r => `
              <div class="doubt-reply">
                <div class="reply-author">${esc(r.author_name || 'Unknown')} <span class="badge badge-${r.author_role || 'student'}">${esc(r.author_role || '')}</span></div>
                <div class="reply-body">${formatMd(r.body || '')}</div>
                <div class="reply-time">${timeAgo(r.created_at)}</div>
              </div>
            `).join('')}
          ${canReply ? `
          <div class="doubt-compose">
            <textarea id="doubt-reply-text" placeholder="Write your reply..." rows="3"></textarea>
            <button class="btn btn-sm btn-primary" id="doubt-reply-btn" style="width:auto;padding:8px 20px;margin-top:8px">Send Reply</button>
          </div>` : ''}
        </div>
      </div>`;

    document.getElementById('doubt-back').onclick = () => { doubtView = 'list'; doubtDetailId = null; renderDoubts(); };
    const replyBtn = document.getElementById('doubt-reply-btn');
    if (replyBtn) {
      replyBtn.onclick = async () => {
        const text = document.getElementById('doubt-reply-text').value.trim();
        if (!text) return;
        try {
          await api('/doubts/' + id + '/reply', { method: 'POST', body: JSON.stringify({ body: text }) });
          renderDoubtDetail(el, id);
        } catch (ex) { alert('Failed: ' + ex.message); }
      };
    }
  } catch (ex) { el.innerHTML = `<div class="error-state"><p>Error: ${esc(ex.message)}</p></div>`; }
}

function showNewDoubtModal() {
  const u = state.user || {};
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>Ask a Question</h3>
      <div class="field"><label>Title</label><input type="text" id="dbt-title" placeholder="Brief title for your question"></div>
      <div class="field"><label>Department</label>
        <select id="dbt-dept"><option>CSE</option><option>ECE</option><option>ME</option><option>CE</option><option>EE</option><option>Other</option></select>
      </div>
      <div class="field"><label>Subject (optional)</label><input type="text" id="dbt-subject" placeholder="e.g. Data Structures"></div>
      <div class="field"><label>Your Question</label><textarea id="dbt-body" rows="5" placeholder="Describe your doubt in detail..."></textarea></div>
      <div class="field"><label><input type="checkbox" id="dbt-anon" style="width:auto;margin-right:6px">Post anonymously</label></div>
      <div id="dbt-error" style="color:var(--danger);font-size:.85rem;min-height:20px"></div>
      <div class="modal-actions">
        <button class="btn btn-sm btn-outline" id="dbt-cancel">Cancel</button>
        <button class="btn btn-sm btn-primary" id="dbt-submit" style="width:auto;padding:8px 20px">Submit</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#dbt-cancel').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.querySelector('#dbt-submit').onclick = async () => {
    const err = overlay.querySelector('#dbt-error');
    err.textContent = '';
    const body = {
      title: overlay.querySelector('#dbt-title').value.trim(),
      body: overlay.querySelector('#dbt-body').value.trim(),
      department: overlay.querySelector('#dbt-dept').value,
      subject: overlay.querySelector('#dbt-subject').value.trim() || null,
      is_anonymous: overlay.querySelector('#dbt-anon').checked,
    };
    if (!body.title || !body.body) { err.textContent = 'Title and question are required'; return; }
    try {
      const r = await api('/doubts', { method: 'POST', body: JSON.stringify(body) });
      if (!r.ok) { const d = await r.json(); err.textContent = d.detail?.message || 'Failed'; return; }
      overlay.remove();
      renderDoubts();
    } catch (ex) { err.textContent = ex.message; }
  };
}

/* ═══════════════════════════════════════════════════════════
   ATTENDANCE PAGE — Faculty/Admin Session Management
   ═══════════════════════════════════════════════════════════ */
async function renderAttendance() {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>Loading attendance...</span></div>';
  try {
    const data = await apiJson('/attendance/sessions');
    const sessions = data.sessions || [];
    el.innerHTML = `
      <div class="admin-header">
        <h2>Attendance Sessions</h2>
        <button class="btn btn-sm btn-primary" id="new-attd-btn" style="width:auto;padding:8px 16px">+ New Session</button>
      </div>
      ${sessions.length === 0 ? '<div class="empty-state"><p>No attendance sessions yet. Create one to start tracking.</p></div>' :
        sessions.map(s => `
          <div class="attendance-session-card">
            <div class="attd-info">
              <div class="attd-title">${esc(s.title)}</div>
              <div class="attd-sub">${esc(s.department || '')}${s.subject ? ' · ' + esc(s.subject) : ''} · ${new Date(s.session_date).toLocaleDateString()}</div>
            </div>
            <span class="attd-badge ${s.is_open ? 'live' : 'closed'}">${s.is_open ? 'LIVE' : 'CLOSED'}</span>
            <div style="display:flex;gap:6px">
              ${s.is_open ? `<button class="btn btn-sm btn-outline close-session" data-id="${s.id}">Close</button>` : ''}
              <button class="btn btn-sm btn-outline view-report" data-id="${s.id}">Report</button>
            </div>
          </div>
        `).join('')}`;

    document.getElementById('new-attd-btn').onclick = () => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal">
          <h3>New Attendance Session</h3>
          <div class="field"><label>Title</label><input id="attd-title" placeholder="e.g. DSA Lab - Section A"></div>
          <div class="field"><label>Department</label>
            <select id="attd-dept"><option>CSE</option><option>ECE</option><option>ME</option><option>CE</option><option>EE</option><option>IT</option></select>
          </div>
          <div class="field"><label>Subject</label>
            <select id="attd-subject"><option value="AI">AI</option><option value="CSE">CSE</option><option value="IT">IT</option><option value="">Other</option></select>
          </div>
          <div id="attd-error" style="color:var(--danger);font-size:.85rem;min-height:20px"></div>
          <div class="modal-actions">
            <button class="btn btn-sm btn-outline" id="attd-cancel">Cancel</button>
            <button class="btn btn-sm btn-primary" id="attd-submit" style="width:auto;padding:8px 20px">Create</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#attd-cancel').onclick = () => overlay.remove();
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
      overlay.querySelector('#attd-submit').onclick = async () => {
        const err = overlay.querySelector('#attd-error');
        err.textContent = '';
        // Check time — attendance only allowed 12:00 AM to 12:00 PM
        const now = new Date();
        const hour = now.getHours();
        if (hour >= 12) {
          err.textContent = 'Attendance sessions can only be created before 12:00 PM (noon)';
          return;
        }
        const body = {
          title: overlay.querySelector('#attd-title').value.trim(),
          department: overlay.querySelector('#attd-dept').value,
          subject: overlay.querySelector('#attd-subject').value || null,
          session_date: new Date().toISOString().slice(0, 10),
        };
        if (!body.title) { err.textContent = 'Title is required'; return; }
        try {
          const r = await api('/attendance/sessions', { method: 'POST', body: JSON.stringify(body) });
          if (!r.ok) { const d = await r.json(); err.textContent = (typeof d.detail === 'string' ? d.detail : d.detail?.message) || 'Failed'; return; }
          overlay.remove();
          renderAttendance();
        } catch (ex) { err.textContent = ex.message; }
      };
    };

    el.querySelectorAll('.close-session').forEach(btn => {
      btn.onclick = async () => {
        try { await api('/attendance/sessions/' + btn.dataset.id + '/close', { method: 'POST' }); renderAttendance(); } catch { alert('Failed'); }
      };
    });
    el.querySelectorAll('.view-report').forEach(btn => {
      btn.onclick = async () => {
        try {
          const data = await apiJson('/attendance/sessions/' + btn.dataset.id + '/report');
          const records = data.records || [];
          const overlay = document.createElement('div');
          overlay.className = 'modal-overlay';
          overlay.innerHTML = `
            <div class="modal" style="max-width:600px">
              <h3>Attendance Report</h3>
              ${records.length === 0 ? '<p class="muted">No attendance records.</p>' : `
              <div class="table-responsive">
              <table class="data-table">
                <thead><tr><th>Roll No</th><th>Name</th><th>Verified</th><th>Confidence</th><th>Time</th></tr></thead>
                <tbody>
                  ${records.map(r => `
                    <tr>
                      <td class="mono bold">${esc(r.roll_number || '')}</td>
                      <td>${esc(r.name || '')}</td>
                      <td>${r.face_verified ? '<span class="dot-success"></span> Yes' : '<span class="dot-error"></span> No'}</td>
                      <td>${r.face_match_confidence ? (r.face_match_confidence * 100).toFixed(0) + '%' : '-'}</td>
                      <td class="muted">${r.created_at ? timeAgo(r.created_at) : '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              </div>`}
              <div class="modal-actions"><button class="btn btn-sm btn-outline" onclick="this.closest('.modal-overlay').remove()">Close</button></div>
            </div>`;
          document.body.appendChild(overlay);
          overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        } catch (ex) { alert('Failed: ' + ex.message); }
      };
    });
  } catch (ex) { el.innerHTML = `<div class="error-state"><p>Error: ${esc(ex.message)}</p></div>`; }
}

/* ═══════════════════════════════════════════════════════════
   COPY CHECK — Plagiarism checker using vision model
   ═══════════════════════════════════════════════════════════ */
async function renderCopyCheck() {
  const el = document.getElementById('page-content');
  el.className = 'page';
  el.innerHTML = `
    <div class="copycheck-page">
      <div class="copycheck-header">
        <h2>Copy Check</h2>
        <p class="muted">Upload answer sheets or documents to check for similarities using AI vision analysis.</p>
      </div>
      <div class="copycheck-upload-area" id="cc-drop-zone">
        <div class="cc-drop-content">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <p>Drag & drop images here or <label class="cc-browse" for="cc-file-input">browse</label></p>
          <p class="muted" style="font-size:.75rem">Supports JPG, PNG, PDF — up to 10 files at once</p>
          <input type="file" id="cc-file-input" multiple accept="image/*,.pdf" style="display:none">
        </div>
      </div>
      <div class="cc-files" id="cc-file-list"></div>
      <div class="cc-actions" id="cc-actions" style="display:none">
        <button class="btn btn-primary" id="cc-analyze-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Analyze for Copies
        </button>
        <button class="btn btn-outline btn-sm" id="cc-clear-btn">Clear All</button>
      </div>
      <div id="cc-results"></div>
    </div>`;
  bindCopyCheck();
}

function bindCopyCheck() {
  const dropZone = document.getElementById('cc-drop-zone');
  const fileInput = document.getElementById('cc-file-input');
  const fileList = document.getElementById('cc-file-list');
  const actions = document.getElementById('cc-actions');
  const results = document.getElementById('cc-results');
  let files = [];

  function renderFileList() {
    if (files.length === 0) { fileList.innerHTML = ''; actions.style.display = 'none'; return; }
    actions.style.display = 'flex';
    fileList.innerHTML = files.map((f, i) => `
      <div class="cc-file-item">
        <div class="cc-file-thumb">${f.type.startsWith('image/') ? `<img src="${URL.createObjectURL(f)}" alt="">` : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'}</div>
        <div class="cc-file-info">
          <span class="cc-file-name">${esc(f.name)}</span>
          <span class="cc-file-size">${(f.size / 1024).toFixed(1)} KB</span>
        </div>
        <button class="icon-btn cc-file-remove" data-idx="${i}" title="Remove">&times;</button>
      </div>
    `).join('');
    fileList.querySelectorAll('.cc-file-remove').forEach(btn => {
      btn.onclick = () => { files.splice(+btn.dataset.idx, 1); renderFileList(); };
    });
  }

  function addFiles(newFiles) {
    for (const f of newFiles) {
      if (files.length >= 10) break;
      files.push(f);
    }
    renderFileList();
  }

  dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('dragover'); };
  dropZone.ondragleave = () => dropZone.classList.remove('dragover');
  dropZone.ondrop = (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); addFiles(e.dataTransfer.files); };
  fileInput.onchange = () => { addFiles(fileInput.files); fileInput.value = ''; };

  document.getElementById('cc-clear-btn').onclick = () => { files = []; renderFileList(); results.innerHTML = ''; };
  document.getElementById('cc-analyze-btn').onclick = async () => {
    if (files.length < 2) { alert('Upload at least 2 documents to compare.'); return; }
    results.innerHTML = `<div class="mac-thinking"><div class="mac-think-orb"><div class="mac-think-ring"></div><div class="mac-think-ring r2"></div><div class="mac-think-ring r3"></div><div class="mac-think-letters"><span class="mac-tl">M</span><span class="mac-tl">A</span><span class="mac-tl">C</span></div></div><div class="mac-think-label">Analyzing documents for similarities...</div></div>`;
    // Animate thinking letters
    const tls = results.querySelectorAll('.mac-tl');
    let litIdx = 0;
    const litIv = setInterval(() => { tls.forEach((t,i) => t.classList.toggle('lit', i === litIdx)); litIdx = (litIdx + 1) % tls.length; }, 400);
    try {
      // Convert files to base64, send to LLM for vision analysis
      const images = [];
      for (const f of files) {
        if (f.type.startsWith('image/')) {
          const b64 = await fileToBase64(f);
          images.push({ name: f.name, data: b64, type: f.type });
        }
      }
      if (images.length < 2) {
        clearInterval(litIv);
        results.innerHTML = '<div class="cc-result-card error"><p>Need at least 2 image files for comparison.</p></div>';
        return;
      }
      const content = [
        { type: 'text', text: 'You are a plagiarism detection expert. Compare these answer sheets / documents carefully. For each pair of documents, identify: 1) Percentage of similarity 2) Specific copied sections 3) Whether copying is confirmed, suspected, or unlikely. Give a detailed structured report. Focus on handwriting similarity, identical answers, same mistakes, and identical phrasing.' },
      ];
      images.forEach(img => {
        content.push({ type: 'text', text: `Document: ${img.name}` });
        content.push({ type: 'image_url', image_url: { url: `data:${img.type};base64,${img.data}` } });
      });
      const res = await api('/query/chat', {
        method: 'POST',
        body: JSON.stringify({
          model: 'auto',
          messages: [{ role: 'user', content }],
          temperature: 0.2,
          max_tokens: 2000,
        }),
      });
      clearInterval(litIv);
      if (!res.ok) {
        const d = await res.json();
        results.innerHTML = `<div class="cc-result-card error"><p>Analysis failed: ${esc(d.detail?.message || d.detail || 'Unknown error')}</p></div>`;
        return;
      }
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || data.response || 'No response';
      results.innerHTML = `<div class="cc-result-card"><h3>Analysis Report</h3><div class="cc-report">${formatMd(reply)}</div></div>`;
    } catch (ex) {
      clearInterval(litIv);
      results.innerHTML = `<div class="cc-result-card error"><p>Error: ${esc(ex.message)}</p></div>`;
    }
  };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ═══════════════════════════════════════════════════════════
   NOTIFICATIONS — Bell, Panel, Push Subscription
   ═══════════════════════════════════════════════════════════ */
async function loadNotifCount() {
  try {
    const data = await apiJson('/notifications?per_page=1');
    const count = data.unread_count || 0;
    const badge = document.getElementById('notif-count');
    if (badge) badge.textContent = count > 0 ? (count > 99 ? '99+' : count) : '';
  } catch {}
}

async function loadNotifications() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  list.innerHTML = '<div class="loading-state" style="padding:20px"><div class="spinner"></div></div>';
  try {
    const data = await apiJson('/notifications?per_page=30');
    const notifs = data.notifications || [];
    if (notifs.length === 0) {
      list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
      return;
    }
    list.innerHTML = notifs.map(n => `
      <div class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" ${n.link ? 'data-link="' + esc(n.link) + '"' : ''}>
        <div class="notif-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
        <div class="notif-body">
          <span class="notif-title">${esc(n.title)}</span>
          <span class="notif-text">${esc(n.body || '')}</span>
          <span class="notif-time">${timeAgo(n.created_at)}</span>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('.notif-item').forEach(item => {
      item.onclick = async () => {
        if (item.classList.contains('unread')) {
          try { await api('/notifications/' + item.dataset.id + '/read', { method: 'POST' }); item.classList.remove('unread'); loadNotifCount(); } catch {}
        }
        const link = item.dataset.link;
        if (link) { document.getElementById('notif-panel').classList.remove('open'); if (link.startsWith('#')) navigate(link.slice(1)); }
      };
    });
    loadNotifCount();
  } catch { list.innerHTML = '<div class="notif-empty">Failed to load</div>'; }
}

/* Push notification subscription */
async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const vapidResp = await apiJson('/notifications/vapid-key').catch(() => null);
      if (!vapidResp || !vapidResp.public_key) return;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidResp.public_key),
      });
    }
    const key = sub.getKey('p256dh');
    const auth = sub.getKey('auth');
    await api('/notifications/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh_key: key ? btoa(String.fromCharCode(...new Uint8Array(key))) : '',
        auth_key: auth ? btoa(String.fromCharCode(...new Uint8Array(auth))) : '',
      }),
    });
  } catch {}
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

/* ═══════════════════════════════════════════════════════════
   CHART HELPERS
   ═══════════════════════════════════════════════════════════ */
function makeDonut(id, used, total, color) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const remaining = Math.max(0, total - used);
  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Used', 'Remaining'],
      datasets: [{ data: [used, remaining], backgroundColor: [color || '#000', '#eee'], borderWidth: 0, cutout: '75%' }],
    },
    options: {
      responsive: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          titleColor: '#fff',
          bodyColor: '#ddd',
          borderColor: 'rgba(255,255,255,0.15)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 10,
          boxPadding: 4,
          callbacks: {
            label: (ctx) => ' ' + ctx.label + ': ' + fmtNum(ctx.raw),
          }
        }
      },
      animation: { animateRotate: true, duration: 800 }
    },
  });
}

/* ═══════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════ */
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function fmtNum(n) { return Math.round(n || 0).toLocaleString('en-IN'); }
function timeAgo(iso) {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return d.toLocaleDateString();
}

function shortModel(m) {
  if (!m) return '?';
  return m.replace(/^(Qwen\/|deepseek-ai\/|openai\/)/, '').replace(/-Instruct$/, '').slice(0, 24);
}

function formatMd(text) {
  let html = esc(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

window.logout = logout;

/* ═══════════════════════════════════════════════════════════
   INTERACTIVE BACKGROUND — Physics-based MAC/MBM particles
   Text particles scatter on hover/touch, spring back to origin
   ═══════════════════════════════════════════════════════════ */
const BG = {
  canvas: null, ctx: null, particles: [], mouse: { x: -9999, y: -9999, active: false },
  raf: null, dpr: 1, W: 0, H: 0,
  REPEL_RADIUS: 120,
  REPEL_FORCE: 8,
  SPRING: 0.04,
  DAMPING: 0.88,
  WORDS: ['MAC', 'MBM', 'MAC', 'MBM', 'AI', 'MAC', 'MBM'],
  FONT_SIZES: [11, 13, 15],
  OPACITY_RANGE: [0.03, 0.07],
};

function initBgCanvas() {
  // Create persistent canvas (lives outside #app so it survives re-renders)
  let canvas = document.getElementById('bg-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'bg-canvas';
    document.body.insertBefore(canvas, document.body.firstChild);
  }
  BG.canvas = canvas;
  BG.ctx = canvas.getContext('2d');
  BG.dpr = Math.min(window.devicePixelRatio || 1, 2);
  resizeBg();
  spawnParticles();
  bindBgEvents();
  if (!BG.raf) animateBg();
}

function resizeBg() {
  BG.W = window.innerWidth;
  BG.H = window.innerHeight;
  BG.canvas.width = BG.W * BG.dpr;
  BG.canvas.height = BG.H * BG.dpr;
  BG.canvas.style.width = BG.W + 'px';
  BG.canvas.style.height = BG.H + 'px';
  BG.ctx.setTransform(BG.dpr, 0, 0, BG.dpr, 0, 0);
}

function spawnParticles() {
  BG.particles = [];
  const spacing = 80;
  const cols = Math.ceil(BG.W / spacing) + 1;
  const rows = Math.ceil(BG.H / spacing) + 1;
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ox = c * spacing + (r % 2 === 0 ? 0 : spacing * 0.5) + (Math.random() - 0.5) * 20;
      const oy = r * spacing + (Math.random() - 0.5) * 16;
      const word = BG.WORDS[idx % BG.WORDS.length];
      const fontSize = BG.FONT_SIZES[idx % BG.FONT_SIZES.length];
      const opMin = BG.OPACITY_RANGE[0], opMax = BG.OPACITY_RANGE[1];
      const baseOpacity = opMin + Math.random() * (opMax - opMin);
      BG.particles.push({
        ox, oy,           // origin
        x: ox, y: oy,     // current
        vx: 0, vy: 0,     // velocity
        word,
        fontSize,
        baseOpacity,
        opacity: baseOpacity,
        rotation: (Math.random() - 0.5) * 0.3,
        rotOrigin: 0,
        rot: 0,
      });
      BG.particles[BG.particles.length - 1].rotOrigin = BG.particles[BG.particles.length - 1].rotation;
      idx++;
    }
  }
}

function bindBgEvents() {
  const onMove = (x, y) => { BG.mouse.x = x; BG.mouse.y = y; BG.mouse.active = true; };

  window.addEventListener('mousemove', e => onMove(e.clientX, e.clientY), { passive: true });
  window.addEventListener('touchmove', e => {
    if (e.touches.length > 0) onMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  window.addEventListener('touchstart', e => {
    if (e.touches.length > 0) onMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  window.addEventListener('mouseleave', () => { BG.mouse.active = false; BG.mouse.x = -9999; BG.mouse.y = -9999; });
  window.addEventListener('touchend', () => { BG.mouse.active = false; BG.mouse.x = -9999; BG.mouse.y = -9999; }, { passive: true });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resizeBg(); spawnParticles(); }, 200);
  });
}

function animateBg() {
  const { ctx, particles, mouse, W, H } = BG;
  ctx.clearRect(0, 0, W, H);

  const rr = BG.REPEL_RADIUS;
  const rr2 = rr * rr;
  const force = BG.REPEL_FORCE;
  const spring = BG.SPRING;
  const damp = BG.DAMPING;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];

    // Repulsion from mouse
    const dx = p.x - mouse.x;
    const dy = p.y - mouse.y;
    const dist2 = dx * dx + dy * dy;

    if (dist2 < rr2 && dist2 > 0.1) {
      const dist = Math.sqrt(dist2);
      const f = (1 - dist / rr) * force;
      p.vx += (dx / dist) * f;
      p.vy += (dy / dist) * f;
      // Spin on repel
      p.rot += (dx > 0 ? 0.1 : -0.1) * f * 0.05;
      // Boost opacity when disturbed
      p.opacity = Math.min(0.18, p.baseOpacity + (1 - dist / rr) * 0.12);
    } else {
      // Fade back to base
      p.opacity += (p.baseOpacity - p.opacity) * 0.05;
    }

    // Spring back to origin
    p.vx += (p.ox - p.x) * spring;
    p.vy += (p.oy - p.y) * spring;

    // Damping
    p.vx *= damp;
    p.vy *= damp;

    // Rotation spring
    p.rot += (p.rotOrigin - p.rot) * 0.03;

    // Integrate
    p.x += p.vx;
    p.y += p.vy;

    // Draw
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.font = `900 ${p.fontSize}px 'Courier New', monospace`;
    ctx.fillStyle = `rgba(0,0,0,${p.opacity.toFixed(3)})`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.word, 0, 0);
    ctx.restore();
  }

  BG.raf = requestAnimationFrame(animateBg);
}

// Initialize background on load
document.addEventListener('DOMContentLoaded', initBgCanvas);
// Also re-init if canvas gets removed (SPA navigation nukes #app, not body)
const _origRender = render;
window._bgCheck = () => {
  if (!document.getElementById('bg-canvas')) initBgCanvas();
};

init();