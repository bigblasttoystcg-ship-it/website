// ── API helper ───────────────────────────────────────────
const API = {
  token: () => localStorage.getItem('admin_token'),

  async request(method, path, body) {
    const res = await fetch(`/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token() ? { 'Authorization': `Bearer ${this.token()}` } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  get:    (path)        => API.request('GET',    path),
  post:   (path, body)  => API.request('POST',   path, body),
  put:    (path, body)  => API.request('PUT',     path, body),
  patch:  (path, body)  => API.request('PATCH',  path, body),
  delete: (path)        => API.request('DELETE', path),
};

// ── Auth ─────────────────────────────────────────────────
function getUser() {
  try { return JSON.parse(localStorage.getItem('admin_user')); } catch { return null; }
}

async function requireAuth() {
  const token = localStorage.getItem('admin_token');
  if (!token) { window.location.href = '/admin/index.html'; return null; }
  try {
    const { user } = await API.get('/auth/me');
    return user;
  } catch {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    window.location.href = '/admin/index.html';
    return null;
  }
}

function signOut() {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_user');
  window.location.href = '/admin/index.html';
}

// ── Sidebar ───────────────────────────────────────────────
function renderSidebar(user) {
  const initials = (user.name || 'U').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  const page = window.location.pathname.split('/').pop();
  const isAdmin = user.role === 'admin';

  const navItem = (href, icon, label, datePage, badge = '') => `
    <a class="nav-item ${datePage === page ? 'active' : ''}" href="${href}">
      ${icon}
      ${label}
      ${badge ? `<span class="nav-badge" id="${badge}"></span>` : ''}
    </a>`;

  const icons = {
    dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
    analytics: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    inventory: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
    graded:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="5"/><path d="M12 13v8m-4-4h8"/></svg>`,
    orders:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
    staff:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    settings:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>`,
  };

  document.getElementById('sidebar-mount').innerHTML = `
    <aside class="sidebar">
      <div class="sidebar-logo">
        <div class="logo-mark">BB</div>
        <div class="logo-text">BigBlast<br><span class="logo-sub">Admin Panel</span></div>
      </div>

      <div class="nav-section">
        <div class="nav-label">Overview</div>
        ${navItem('dashboard.html', icons.dashboard, 'Dashboard', 'dashboard.html')}
        ${isAdmin ? navItem('analytics.html', icons.analytics, 'Analytics', 'analytics.html') : ''}
      </div>

      <div class="nav-section">
        <div class="nav-label">Inventory</div>
        ${navItem('inventory.html', icons.inventory, 'All Inventory', 'inventory.html')}
        ${navItem('graded.html', icons.graded, 'Graded Cards', 'graded.html')}
      </div>

      <div class="nav-section">
        <div class="nav-label">Sales</div>
        ${navItem('orders.html', icons.orders, 'Orders', 'orders.html')}
      </div>

      ${isAdmin ? `
      <div class="nav-section">
        <div class="nav-label">Admin</div>
        ${navItem('staff.html', icons.staff, 'Staff Access', 'staff.html')}
        ${navItem('settings.html', icons.settings, 'Settings', 'settings.html')}
      </div>` : ''}

      <div class="sidebar-footer">
        <div class="user-pill">
          <div class="user-avatar">${initials}</div>
          <div>
            <div class="user-name">${user.name}</div>
            <div class="user-role">${user.role}</div>
          </div>
        </div>
        <button class="btn-signout" onclick="signOut()">Sign Out</button>
      </div>
    </aside>`;
}

// ── Init page (call on every authenticated page) ─────────
async function initPage(title) {
  const user = await requireAuth();
  if (!user) return null;
  renderSidebar(user);
  if (title) document.getElementById('page-title').textContent = title;
  return user;
}

// ── Toast ─────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ── Stock badge helper ────────────────────────────────────
function stockBadge(online, instore, threshold = 3) {
  const total = online + instore;
  if (online === 0) return '<span class="badge badge-out">Out Online</span>';
  if (total <= threshold) return '<span class="badge badge-low">Low</span>';
  return '<span class="badge badge-ok">In Stock</span>';
}

// ── Format currency ───────────────────────────────────────
function fmt(n) {
  return '$' + parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
