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
  if (title) { const el = document.getElementById('page-title'); if (el) el.textContent = title; }
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

// ── Profit display ────────────────────────────────────────
function profitBadge(price, pricePaid) {
  if (!pricePaid || pricePaid <= 0) return '';
  const profit = parseFloat(price) - parseFloat(pricePaid);
  const pct    = Math.round((profit / parseFloat(pricePaid)) * 100);
  const color  = profit >= 0 ? 'var(--green)' : 'var(--red)';
  const sign   = profit >= 0 ? '+' : '';
  return `<span style="color:${color};font-size:0.72rem;font-weight:700;white-space:nowrap">${sign}${fmt(profit)} (${sign}${pct}%)</span>`;
}

// ── Set name autocomplete ─────────────────────────────────
function initSetAutocomplete(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const listId = inputId + '-datalist';
  let dl = document.getElementById(listId);
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = listId;
    input.parentElement.appendChild(dl);
  }
  input.setAttribute('list', listId);
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { dl.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      const sets = await API.get(`/pokemoncards/sets?q=${encodeURIComponent(q)}`).catch(() => []);
      dl.innerHTML = sets.map(s => `<option value="${s}">`).join('');
    }, 300);
  });
}

// ── Card image picker ─────────────────────────────────────
let _pickerTimer  = null;
let _pickerSelect = null;

function initCardPicker(nameId, setId, onSelect) {
  _pickerSelect = onSelect;
  const nameEl = document.getElementById(nameId);
  const setEl  = document.getElementById(setId);
  const trigger = () => {
    clearTimeout(_pickerTimer);
    const name = nameEl?.value?.trim();
    if (!name || name.length < 2) { _renderPicker([], false); return; }
    _renderPicker([], true); // show loading state
    _pickerTimer = setTimeout(() => _searchCards(name, setEl?.value?.trim() || ''), 500);
  };
  nameEl?.addEventListener('input', trigger);
  setEl?.addEventListener('input',  trigger);
}

async function _searchCards(name, set) {
  try {
    const params = new URLSearchParams({ name, set });
    const results = await API.get('/pokemoncards/search?' + params);
    _renderPicker(results, false);
  } catch { _renderPicker([], false); }
}

function _renderPicker(cards, loading) {
  const el = document.getElementById('card-picker');
  if (!el) return;
  if (loading) {
    el.innerHTML = '<div class="card-picker-status">Searching...</div>';
    return;
  }
  if (!cards.length) {
    el.innerHTML = el.dataset.searched ? '<div class="card-picker-status">No matches found</div>' : '';
    return;
  }
  el.dataset.searched = '1';
  el.innerHTML = `
    <div class="card-picker-cards">${cards.map((c, i) => `
      <div class="card-pick" onclick="_expandCard(this, ${i})" data-idx="${i}" data-card='${JSON.stringify(c).replace(/'/g,"&#39;")}'>
        <img src="${c.img_url}" alt="${c.name}" onerror="this.parentElement.style.display='none'">
        <div class="card-pick-name">${c.name}</div>
        <div class="card-pick-set">${c.set}</div>
        ${c.variant ? `<div class="card-pick-rarity">${c.variant}</div>` : ''}
      </div>`).join('')}
    </div>
    <div class="card-picker-variants" id="card-picker-variants"></div>`;
}

function _expandCard(el, idx) {
  document.querySelectorAll('.card-pick').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  try {
    const card = JSON.parse(el.dataset.card);
    const varEl = document.getElementById('card-picker-variants');
    if (!varEl) return;

    if (!card.variants || !card.variants.length) {
      // No price variants — select directly
      if (_pickerSelect) _pickerSelect({ ...card });
      varEl.innerHTML = '';
      return;
    }

    varEl.innerHTML = `
      <div class="card-picker-variants-label">Select print / finish:</div>
      <div class="card-picker-variants-row">
        ${card.variants.map(v => `
          <button class="variant-btn" onclick="_selectVariant(this, '${el.dataset.idx}')"
            data-card='${JSON.stringify(card).replace(/'/g,"&#39;")}'
            data-variant='${JSON.stringify(v).replace(/'/g,"&#39;")}'>
            <span class="variant-btn-label">${v.label}</span>
            <span class="variant-btn-price">$${parseFloat(v.market).toFixed(2)}</span>
          </button>`).join('')}
      </div>`;
  } catch {}
}

function _selectVariant(btn, cardIdx) {
  document.querySelectorAll('.variant-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  try {
    const card    = JSON.parse(btn.dataset.card);
    const variant = JSON.parse(btn.dataset.variant);
    if (_pickerSelect) _pickerSelect({
      ...card,
      market_price: variant.market,
      variant:      card.variant ? `${card.variant} — ${variant.label}` : variant.label,
    });
  } catch {}
}

function resetCardPicker() {
  clearTimeout(_pickerTimer);
  const el = document.getElementById('card-picker');
  if (el) { el.innerHTML = ''; delete el.dataset.searched; }
}

// ── Condition price helpers ───────────────────────────────
// Standard TCGPlayer condition multipliers (NM = market price)
const CONDITION_MULTIPLIERS = { NM: 1.0, LP: 0.75, MP: 0.50, HP: 0.30, DMG: 0.15 };
const CONDITION_BADGE_CLASS  = { NM: 'badge-ok', LP: 'badge-low', MP: 'badge-orange', HP: 'badge-out', DMG: 'badge-out' };

// Render condition price pills into containerId.
// opts.conditionId — select to update on click
// opts.priceId     — number input to update on click
function renderConditionPrices(nmPrice, containerId, opts = {}) {
  const el = document.getElementById(containerId);
  if (!el || !nmPrice) return;
  el.innerHTML = `
    <div class="cond-prices-label">Market prices by condition <span style="color:var(--muted);font-size:0.7rem">(TCGPlayer NM ${fmt(nmPrice)})</span></div>
    <div class="cond-prices-row">
      ${Object.entries(CONDITION_MULTIPLIERS).map(([cond, mult]) => {
        const price = (nmPrice * mult).toFixed(2);
        return `<button class="cond-price-pill" data-cond="${cond}" data-price="${price}"
          onclick="selectConditionPrice(this,'${opts.conditionId || ''}','${opts.priceId || ''}')"
          title="Set condition to ${cond} and price to $${price}">
          <span class="cond-pill-label">${cond}</span>
          <span class="cond-pill-price">$${price}</span>
        </button>`;
      }).join('')}
    </div>`;
}

function selectConditionPrice(btn, conditionId, priceId) {
  const cond  = btn.dataset.cond;
  const price = btn.dataset.price;
  if (conditionId) {
    const condEl = document.getElementById(conditionId);
    if (condEl) condEl.value = cond;
  }
  if (priceId) {
    const priceEl = document.getElementById(priceId);
    if (priceEl) {
      priceEl.value = price;
      priceEl.dispatchEvent(new Event('input'));
    }
  }
  // Highlight selected pill
  btn.closest('.cond-prices-row')?.querySelectorAll('.cond-price-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
