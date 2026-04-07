/* ═══════════════════════════════════════════════════════════
   MAC — MBM AI Cloud  ·  PWA Frontend  v2
   ═══════════════════════════════════════════════════════════ */

// ── API helper ────────────────────────────────────────────
const API = '/api/v1';
const state = { token: localStorage.getItem('mac_token'), user: null, page: 'login' };

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
  state.page = page;
  window.history.pushState({}, '', page === 'login' ? '/' : `#${page}`);
  render();
}

window.addEventListener('popstate', () => {
  const hash = location.hash.slice(1);
  state.page = hash || (state.token ? 'dashboard' : 'login');
  render();
});

// ── Bootstrap ─────────────────────────────────────────────
async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/static/sw.js');
  if (state.token) {
    try {
      const u = await apiJson('/auth/me');
      state.user = u;
      if (u.must_change_password) {
        state.page = 'set-password';
      } else {
        state.page = location.hash.slice(1) || 'dashboard';
      }
    } catch { state.token = null; localStorage.removeItem('mac_token'); state.page = 'login'; }
  }
  render();
}

function render() {
  const app = document.getElementById('app');
  if (!state.token || state.page === 'login') { app.innerHTML = authPage(); bindAuth(); return; }
  if (state.page === 'set-password') { app.innerHTML = setPasswordPage(); bindSetPassword(); bindEyeToggles(); return; }
  // App shell
  app.innerHTML = shell();
  bindShell();
  if (state.page === 'dashboard') renderDashboard();
  else if (state.page === 'chat') renderChat();
  else if (state.page === 'admin') renderAdmin();
  else if (state.page === 'settings') renderSettings();
  else { state.page = 'dashboard'; renderDashboard(); }
}

function logout() {
  state.token = null; state.user = null;
  localStorage.removeItem('mac_token');
  navigate('login');
}

/* ═══════════════════════════════════════════════════════════
   SINGLE AUTH PAGE — Registration Number + DOB
   ═══════════════════════════════════════════════════════════ */
function authPage() {
  return `
  <div class="bg-mac">MAC</div>
  <div class="auth-page">
    <div class="auth-card">
      <div class="logo"><span class="glitch" data-text="MAC">MAC</span></div>
      <div class="subtitle">MBM AI Cloud · Self-Hosted Inference</div>
      <p style="font-size:.85rem;color:var(--muted);margin-bottom:24px">
        Enter your college registration number and date of birth to continue.
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
    </div>
  </div>`;
}

function bindAuth() {
  const form = document.getElementById('auth-form');
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = document.getElementById('auth-error');
    err.textContent = '';
    const roll = document.getElementById('auth-roll').value.trim();
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
      state.token = data.access_token;
      state.user = data.user;
      localStorage.setItem('mac_token', data.access_token);
      if (data.must_change_password) navigate('set-password');
      else navigate('dashboard');
    } catch (ex) { err.textContent = 'Connection error'; }
  };
}

/* ═══════════════════════════════════════════════════════════
   SET PASSWORD (first-time / forced)
   ═══════════════════════════════════════════════════════════ */
function setPasswordPage() {
  const u = state.user || {};
  return `
  <div class="bg-mac">MAC</div>
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
      // Refresh user profile
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
  const pages = { dashboard: 'Dashboard', chat: 'Chat', settings: 'Settings', admin: 'Admin' };
  return `
  <div class="bg-mac">MAC</div>
  <div class="shell" id="shell">
    <nav class="sidebar">
      <div class="sidebar-header">
        <div class="brand"><span class="glitch" data-text="MAC">MAC</span></div>
      </div>
      <div class="sidebar-nav">
        <a href="#dashboard" data-page="dashboard" class="${state.page==='dashboard'?'active':''}">
          <span>◈</span> Dashboard
        </a>
        <a href="#chat" data-page="chat" class="${state.page==='chat'?'active':''}">
          <span>◉</span> Chat
        </a>
        <a href="#settings" data-page="settings" class="${state.page==='settings'?'active':''}">
          <span>⚡</span> Settings
        </a>
        ${isAdmin ? `<a href="#admin" data-page="admin" class="${state.page==='admin'?'active':''}">
          <span>⚙</span> Admin Panel
        </a>` : ''}
      </div>
      <div class="sidebar-user">
        <div class="name">${esc(u.name || '')}</div>
        <div>${esc(u.roll_number || '')} · <span class="badge badge-${u.role}">${esc(u.role || '')}</span></div>
        <button class="btn btn-sm btn-outline" style="margin-top:8px;width:100%" onclick="logout()">Sign Out</button>
      </div>
    </nav>
    <div class="main-content">
      <div class="topbar">
        <button class="btn btn-sm menu-btn" onclick="document.getElementById('shell').classList.toggle('sidebar-open')">☰</button>
        <h1>${pages[state.page] || 'Dashboard'}</h1>
        <div style="font-size:.75rem;color:var(--muted)">vLLM Backend</div>
      </div>
      <div class="page" id="page-content"></div>
    </div>
  </div>`;
}
function bindShell() {
  document.querySelectorAll('.sidebar-nav a').forEach(a => {
    a.onclick = (e) => { e.preventDefault(); navigate(a.dataset.page); };
  });
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════════ */
async function renderDashboard() {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">Loading...</div>';
  try {
    const [me, quota, history] = await Promise.all([
      apiJson('/auth/me'),
      apiJson('/usage/me/quota'),
      apiJson('/usage/me/history?per_page=10'),
    ]);
    state.user = me;
    const q = quota;
    const tokensUsed = q.current?.tokens_used_today || 0;
    const tokensLimit = q.limits?.daily_tokens || 50000;
    const reqsUsed = q.current?.requests_this_hour || 0;
    const reqsLimit = q.limits?.requests_per_hour || 100;
    const tokenPct = Math.round((tokensUsed / tokensLimit) * 100);
    const reqPct = Math.round((reqsUsed / reqsLimit) * 100);

    el.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="label">Welcome</div>
          <div class="value" style="font-size:1.1rem;font-family:inherit">${esc(me.name)}</div>
          <div class="sub"><span class="badge badge-${me.role}">${me.role}</span> · ${esc(me.department)}</div>
        </div>
        <div class="stat-card">
          <div class="label">Tokens Today</div>
          <div class="value">${fmtNum(tokensUsed)}</div>
          <div class="sub">of ${fmtNum(tokensLimit)} daily limit</div>
        </div>
        <div class="stat-card">
          <div class="label">Requests / hr</div>
          <div class="value">${reqsUsed}</div>
          <div class="sub">of ${reqsLimit} hourly limit</div>
        </div>
        <div class="stat-card">
          <div class="label">Chat Sessions</div>
          <div class="value">${getSessions().length}</div>
          <div class="sub">saved locally</div>
        </div>
      </div>

      <div class="charts-grid">
        <div class="chart-card">
          <h3>Daily Token Usage</h3>
          <div class="chart-wrap">
            <canvas id="chart-tokens"></canvas>
            <div class="chart-center-text">
              <div class="pct">${tokenPct}%</div>
              <div class="lbl">used</div>
            </div>
          </div>
        </div>
        <div class="chart-card">
          <h3>Hourly Request Usage</h3>
          <div class="chart-wrap">
            <canvas id="chart-reqs"></canvas>
            <div class="chart-center-text">
              <div class="pct">${reqPct}%</div>
              <div class="lbl">used</div>
            </div>
          </div>
        </div>
        <div class="chart-card">
          <h3>Available Models</h3>
          <div id="models-list" style="font-size:.85rem;color:var(--muted)">Loading...</div>
        </div>
      </div>

      <div class="chart-card" style="margin-bottom:24px">
        <h3>Recent Activity</h3>
        ${history.requests && history.requests.length > 0 ? `
          <table class="history-table">
            <thead><tr><th>Model</th><th>Endpoint</th><th>Tokens</th><th>Latency</th><th>Time</th></tr></thead>
            <tbody>
              ${history.requests.map(r => `
                <tr>
                  <td style="font-family:monospace;font-size:.8rem">${esc(r.model)}</td>
                  <td>${esc(r.endpoint)}</td>
                  <td>${r.tokens_in + r.tokens_out}</td>
                  <td>${r.latency_ms}ms</td>
                  <td style="color:var(--muted)">${timeAgo(r.created_at)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<p style="color:var(--muted);font-size:.85rem;padding:12px">No activity yet. Start a chat!</p>'}
      </div>
    `;
    makeDonut('chart-tokens', tokensUsed, tokensLimit);
    makeDonut('chart-reqs', reqsUsed, reqsLimit);

    try {
      const m = await apiJson('/models');
      const list = m.models || [];
      document.getElementById('models-list').innerHTML = list.map(md =>
        `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="font-family:monospace">${esc(md.id || md.name)}</span>
          <span class="badge" style="background:${md.status==='loaded'?'#000':'#eee'};color:${md.status==='loaded'?'#fff':'#999'}">${md.status}</span>
        </div>`
      ).join('') || '<p>No models configured</p>';
    } catch { document.getElementById('models-list').textContent = 'Could not load models'; }

  } catch (ex) { el.innerHTML = `<p style="color:var(--danger)">Error loading dashboard: ${esc(ex.message)}</p>`; }
}

function makeDonut(id, used, total) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Used', 'Remaining'],
      datasets: [{ data: [used, Math.max(0, total - used)], backgroundColor: ['#000', '#eee'], borderWidth: 0, cutout: '75%' }],
    },
    options: { responsive: true, plugins: { legend: { display: false }, tooltip: { enabled: true } }, animation: { animateRotate: true, duration: 800 } },
  });
}

/* ═══════════════════════════════════════════════════════════
   SETTINGS (Profile + Change Password)
   ═══════════════════════════════════════════════════════════ */
async function renderSettings() {
  const el = document.getElementById('page-content');
  const u = state.user || {};
  el.innerHTML = `
    <div class="settings-cards">
      <div class="settings-card">
        <h3>Profile Information</h3>
        <div class="field"><label>Roll Number</label><input value="${esc(u.roll_number)}" disabled></div>
        <div class="field"><label>Name</label><input id="pf-name" value="${esc(u.name)}"></div>
        <div class="field"><label>Email</label><input id="pf-email" type="email" value="${esc(u.email || '')}" placeholder="Optional"></div>
        <div class="field"><label>Department</label><input value="${esc(u.department)}" disabled></div>
        <div class="field"><label>Role</label><input value="${esc(u.role)}" disabled></div>
        <div id="pf-msg" style="font-size:.85rem;min-height:20px;margin-bottom:8px"></div>
        <button class="btn btn-primary" id="save-profile-btn" style="width:auto;padding:8px 24px">Save Profile</button>
      </div>
      <div class="settings-card">
        <h3>Change Password</h3>
        ${pwField('cp-old', 'Current Password', 'Current password')}
        ${pwField('cp-new', 'New Password', 'Min 8 characters')}
        ${pwField('cp-confirm', 'Confirm New Password', 'Repeat password')}
        <div id="cp-msg" style="font-size:.85rem;min-height:20px;margin-bottom:8px"></div>
        <button class="btn btn-primary" id="change-pw-btn" style="width:auto;padding:8px 24px">Update Password</button>
      </div>
      <div class="settings-card">
        <h3>API Key</h3>
        <p style="font-size:.85rem;color:var(--muted);margin-bottom:12px">Use this key to authenticate API requests programmatically.</p>
        <div class="api-key" id="api-key-display">${esc(u.api_key || 'N/A')}</div>
        <button class="btn btn-sm btn-outline" style="margin-top:12px" onclick="navigator.clipboard.writeText(document.getElementById('api-key-display').textContent)">Copy to Clipboard</button>
      </div>
    </div>`;

  bindEyeToggles(el);

  document.getElementById('save-profile-btn').onclick = async () => {
    const msg = document.getElementById('pf-msg');
    try {
      const r = await api('/auth/me/profile', {
        method: 'PUT',
        body: JSON.stringify({ name: document.getElementById('pf-name').value, email: document.getElementById('pf-email').value }),
      });
      if (!r.ok) { const d = await r.json(); msg.innerHTML = `<span style="color:var(--danger)">${esc(d.detail?.message || 'Failed')}</span>`; return; }
      state.user = await apiJson('/auth/me');
      msg.innerHTML = '<span style="color:var(--success)">Profile updated</span>';
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
      msg.innerHTML = '<span style="color:var(--success)">Password changed!</span>';
      document.getElementById('cp-old').value = '';
      document.getElementById('cp-new').value = '';
      document.getElementById('cp-confirm').value = '';
    } catch (ex) { msg.innerHTML = `<span style="color:var(--danger)">${esc(ex.message)}</span>`; }
  };
}

/* ═══════════════════════════════════════════════════════════
   CHAT
   ═══════════════════════════════════════════════════════════ */
let currentSession = null;
let isStreaming = false;

function renderChat() {
  const el = document.getElementById('page-content');
  el.style.padding = '0';
  el.style.maxWidth = 'none';
  el.style.height = 'calc(100vh - 57px)';

  const sessions = getSessions();
  el.innerHTML = `
    <div class="chat-layout" style="height:100%">
      <div class="chat-sessions">
        <div class="chat-sessions-header">
          <h3>Sessions</h3>
          <button class="btn btn-sm btn-outline" id="new-chat-btn">+ New</button>
        </div>
        <div class="session-list" id="session-list">
          ${sessions.map(s => sessionItem(s)).join('')}
        </div>
      </div>
      <div class="chat-main">
        <div class="chat-messages" id="chat-messages">
          <div class="chat-empty">
            <div class="logo"><span class="glitch" data-text="MAC">MAC</span></div>
            <p>Start a conversation</p>
          </div>
        </div>
        <div class="chat-model-bar">
          <span>Model:</span>
          <select id="model-select">
            <option value="auto" selected>Auto (Smart Route)</option>
            <option value="qwen2.5-coder:7b">Qwen2.5-Coder 7B</option>
            <option value="deepseek-r1:8b">DeepSeek-R1 8B</option>
            <option value="qwen2.5:14b">Qwen2.5 14B</option>
            <option value="llava:7b">LLaVA 7B (Vision)</option>
          </select>
          <span id="chat-status" style="margin-left:auto"></span>
        </div>
        <div class="chat-input-bar">
          <textarea id="chat-input" placeholder="Type a message..." rows="1"></textarea>
          <button class="send-btn" id="send-btn">▶</button>
        </div>
      </div>
    </div>`;
  bindChat();
  if (sessions.length > 0 && !currentSession) loadSession(sessions[0].id);
}

function sessionItem(s) {
  const active = currentSession && currentSession.id === s.id;
  return `<div class="session-item ${active ? 'active' : ''}" data-id="${s.id}">
    <span>${esc(s.title || 'New Chat')}</span>
    <span class="del" data-del="${s.id}">✕</span>
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
    msgs.innerHTML = `<div class="chat-empty"><div class="logo"><span class="glitch" data-text="MAC">MAC</span></div><p>Start a conversation</p></div>`;
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
  assistantDiv.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
  msgs.appendChild(assistantDiv);
  msgs.scrollTop = msgs.scrollHeight;

  const status = document.getElementById('chat-status');
  status.textContent = 'Generating...';
  isStreaming = true;

  try {
    const apiMessages = currentSession.messages.map(m => ({ role: m.role, content: m.content }));
    const res = await api('/query/chat', { method: 'POST', body: JSON.stringify({ messages: apiMessages, model, stream: true }) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.detail?.message || 'Request failed'); }

    let fullContent = '';
    assistantDiv.textContent = '';
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
    if (!fullContent) fullContent = '(No response)';
    currentSession.messages.push({ role: 'assistant', content: fullContent });
    persistSession();
    assistantDiv.innerHTML = formatMd(fullContent);
  } catch (err) {
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
   ADMIN PANEL — Full Control
   ═══════════════════════════════════════════════════════════ */
let adminTab = 'users';

async function renderAdmin() {
  const el = document.getElementById('page-content');
  if (!state.user || state.user.role !== 'admin') {
    el.innerHTML = '<p style="color:var(--danger)">Admin access required.</p>';
    return;
  }
  el.innerHTML = `
    <div class="admin-tabs" id="admin-tabs">
      <div class="admin-tab ${adminTab==='overview'?'active':''}" data-tab="overview">Overview</div>
      <div class="admin-tab ${adminTab==='users'?'active':''}" data-tab="users">Users</div>
      <div class="admin-tab ${adminTab==='registry'?'active':''}" data-tab="registry">Student Registry</div>
    </div>
    <div id="admin-content"><div style="text-align:center;padding:40px;color:var(--muted)">Loading...</div></div>
  `;
  document.querySelectorAll('#admin-tabs .admin-tab').forEach(t => {
    t.onclick = () => { adminTab = t.dataset.tab; renderAdmin(); };
  });
  if (adminTab === 'overview') await renderAdminOverview();
  else if (adminTab === 'users') await renderAdminUsers();
  else if (adminTab === 'registry') await renderAdminRegistry();
}

async function renderAdminOverview() {
  const el = document.getElementById('admin-content');
  try {
    const stats = await apiJson('/auth/admin/stats');
    el.innerHTML = `
      <div class="stats-grid" style="margin-top:4px">
        <div class="stat-card"><div class="label">Total Users</div><div class="value">${stats.total_users}</div></div>
        <div class="stat-card"><div class="label">Active Users</div><div class="value">${stats.active_users}</div></div>
        <div class="stat-card"><div class="label">Admins</div><div class="value">${stats.admin_count}</div></div>
        <div class="stat-card"><div class="label">Registry Entries</div><div class="value">${stats.registry_count}</div></div>
        <div class="stat-card"><div class="label">Requests Today</div><div class="value">${fmtNum(stats.requests_today)}</div></div>
        <div class="stat-card"><div class="label">Tokens Today</div><div class="value">${fmtNum(stats.tokens_today)}</div></div>
      </div>`;
  } catch (ex) { el.innerHTML = `<p style="color:var(--danger)">Error: ${esc(ex.message)}</p>`; }
}

async function renderAdminUsers() {
  const el = document.getElementById('admin-content');
  try {
    const data = await apiJson('/auth/admin/users');
    const users = data.users || [];
    el.innerHTML = `
      <div class="admin-header">
        <h2>User Management (${users.length})</h2>
        <button class="btn btn-sm btn-primary" id="add-user-btn" style="width:auto;padding:8px 16px">+ Add User</button>
      </div>
      <div style="overflow-x:auto">
      <table class="users-table">
        <thead><tr><th>Roll No</th><th>Name</th><th>Dept</th><th>Role</th><th>Status</th><th>Pwd Reset</th><th>Joined</th><th>Actions</th></tr></thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td style="font-family:monospace;font-weight:600">${esc(u.roll_number)}</td>
              <td>${esc(u.name)}</td>
              <td>${esc(u.department)}</td>
              <td><span class="badge badge-${u.role}">${u.role}</span></td>
              <td>${u.is_active ? '<span style="color:var(--success)">● Active</span>' : '<span style="color:var(--danger)">○ Inactive</span>'}</td>
              <td>${u.must_change_password ? '<span style="color:var(--danger)">Pending</span>' : '<span style="color:var(--muted)">Done</span>'}</td>
              <td style="color:var(--muted);font-size:.8rem">${new Date(u.created_at).toLocaleDateString()}</td>
              <td style="white-space:nowrap">
                <select class="role-select" data-uid="${u.id}" style="padding:4px 6px;font-size:.78rem;border-radius:4px">
                  <option value="student" ${u.role==='student'?'selected':''}>Student</option>
                  <option value="faculty" ${u.role==='faculty'?'selected':''}>Faculty</option>
                  <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
                </select>
                <button class="btn btn-sm btn-outline toggle-status" data-uid="${u.id}" data-active="${u.is_active}" style="margin-left:4px">
                  ${u.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button class="btn btn-sm btn-outline reset-pw" data-uid="${u.id}" style="margin-left:4px" title="Reset password">🔑</button>
                <button class="btn btn-sm btn-outline regen-key" data-uid="${u.id}" style="margin-left:4px" title="Regenerate API key">🔄</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      </div>`;

    el.querySelectorAll('.role-select').forEach(sel => {
      sel.onchange = async () => {
        try { await api(`/auth/admin/users/${sel.dataset.uid}/role`, { method: 'PUT', body: JSON.stringify({ role: sel.value }) }); renderAdmin(); } catch { alert('Failed'); }
      };
    });
    el.querySelectorAll('.toggle-status').forEach(btn => {
      btn.onclick = async () => {
        try { await api(`/auth/admin/users/${btn.dataset.uid}/status`, { method: 'PUT', body: JSON.stringify({ is_active: btn.dataset.active !== 'true' }) }); renderAdmin(); } catch { alert('Failed'); }
      };
    });
    el.querySelectorAll('.reset-pw').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Reset this user\'s password?')) return;
        try {
          const r = await apiJson(`/auth/admin/users/${btn.dataset.uid}/reset-password`, { method: 'POST' });
          alert(`Temp password: ${r.temp_password}\nUser must change on next login.`);
          renderAdmin();
        } catch { alert('Failed'); }
      };
    });
    el.querySelectorAll('.regen-key').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Regenerate API key? Old key will stop working.')) return;
        try { const r = await apiJson(`/auth/admin/users/${btn.dataset.uid}/regenerate-key`, { method: 'POST' }); alert(`New key: ${r.api_key}`); renderAdmin(); } catch { alert('Failed'); }
      };
    });
    document.getElementById('add-user-btn').onclick = showAddUserModal;
  } catch (ex) { el.innerHTML = `<p style="color:var(--danger)">Error: ${esc(ex.message)}</p>`; }
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
      overlay.remove();
      renderAdmin();
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
        <h2>Student Registry (${entries.length})</h2>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm btn-outline" id="add-reg-btn" style="width:auto;padding:8px 16px">+ Add Student</button>
          <button class="btn btn-sm btn-primary" id="bulk-reg-btn" style="width:auto;padding:8px 16px">Bulk Import</button>
        </div>
      </div>
      <p style="font-size:.85rem;color:var(--muted);margin-bottom:16px">Students must exist here before they can sign up. Their roll number + DOB are verified during registration.</p>
      <div style="overflow-x:auto">
      <table class="users-table">
        <thead><tr><th>Roll No</th><th>Name</th><th>Dept</th><th>DOB</th><th>Batch</th></tr></thead>
        <tbody>
          ${entries.map(e => `
            <tr>
              <td style="font-family:monospace;font-weight:600">${esc(e.roll_number)}</td>
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
          overlay.remove();
          renderAdmin();
        } catch (ex) { err.textContent = ex.message; }
      };
    };

    document.getElementById('bulk-reg-btn').onclick = () => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal">
          <h3>Bulk Import Students</h3>
          <p style="font-size:.85rem;color:var(--muted);margin-bottom:12px">Paste JSON array of students. Each entry: <code>{ roll_number, name, department, dob (DD-MM-YYYY), batch_year }</code></p>
          <textarea id="bulk-json" rows="8" style="width:100%;font-family:monospace;font-size:.8rem" placeholder='[{"roll_number":"23CS001","name":"Student Name","department":"CSE","dob":"10-05-2005","batch_year":2023}]'></textarea>
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
  } catch (ex) { el.innerHTML = `<p style="color:var(--danger)">Error: ${esc(ex.message)}</p>`; }
}

/* ═══════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════ */
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function fmtNum(n) { return (n || 0).toLocaleString(); }
function timeAgo(iso) {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return d.toLocaleDateString();
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
init();
