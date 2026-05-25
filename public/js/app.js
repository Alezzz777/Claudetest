const API = '/api';
let token = localStorage.getItem('token');
let currentUser = null;
let currentFilter = '';
let currentPage = 1;
let previousView = 'dashboard';
let currentDetailId = null;
let pingInterval = null;

const ROLE_LABELS = { client: 'Клиент', executor: 'Исполнитель', dispatcher: 'Диспетчер' };
const STATUS_LABELS = { new: 'Новая', assigned: 'Назначена', in_progress: 'В пути', delivered: 'Доставлена', confirmed: 'Подтверждена', rejected: 'Отклонена' };
const PRIORITY_LABELS = { low: 'Низкий', normal: 'Обычный', high: 'Высокий', urgent: 'Срочный' };

// ── API Helper ──
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка');
  return data;
}

// ── Toast ──
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast toast-${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Connection Indicator ──
function setConnectionStatus(online) {
  const el = document.getElementById('connection-indicator');
  if (!el) return;
  el.className = `conn-indicator ${online ? 'online' : 'offline'}`;
  el.querySelector('.conn-label').textContent = online ? 'Online' : 'Offline';
}

async function checkConnection() {
  try {
    await fetch(API + '/ping', { method: 'GET', cache: 'no-store' });
    setConnectionStatus(true);
  } catch {
    setConnectionStatus(false);
  }
}

function startPing() {
  checkConnection();
  if (pingInterval) clearInterval(pingInterval);
  pingInterval = setInterval(checkConnection, 10000);
}

function stopPing() {
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
}

// ── Auth ──
function toggleAuthForm() {
  const login = document.getElementById('login-form');
  const reg = document.getElementById('register-form');
  const link = document.getElementById('auth-toggle-link');
  const text = document.getElementById('auth-toggle-text');
  if (login.style.display === 'none') {
    login.style.display = 'block';
    reg.style.display = 'none';
    text.textContent = 'Нет аккаунта? ';
    link.textContent = 'Регистрация';
  } else {
    login.style.display = 'none';
    reg.style.display = 'block';
    text.textContent = 'Есть аккаунт? ';
    link.textContent = 'Войти';
  }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('login-username').value,
        password: document.getElementById('login-password').value
      })
    });
    token = data.token;
    localStorage.setItem('token', token);
    currentUser = data.user;
    showApp();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('reg-username').value,
        password: document.getElementById('reg-password').value,
        full_name: document.getElementById('reg-fullname').value,
        role: document.getElementById('reg-role').value,
        phone: document.getElementById('reg-phone').value
      })
    });
    token = data.token;
    localStorage.setItem('token', token);
    currentUser = data.user;
    showApp();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('token');
  stopPing();
  document.getElementById('app-screen').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
}

// ── App Init ──
async function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  document.getElementById('header-user').textContent = `${currentUser.full_name} (${ROLE_LABELS[currentUser.role]})`;

  document.getElementById('nav-new').style.display = ['client', 'dispatcher'].includes(currentUser.role) ? 'flex' : 'none';
  document.getElementById('nav-locations').style.display = currentUser.role === 'dispatcher' ? 'flex' : 'none';

  startPing();
  navigateTo('dashboard');
}

// ── Navigation ──
function navigateTo(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (view === 'dashboard') loadDashboard();
  else if (view === 'requests') { currentPage = 1; loadRequests(); }
  else if (view === 'new') loadNewRequestForm();
  else if (view === 'locations') loadLocations();
  else if (view === 'health') loadHealth();
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    if (view) navigateTo(view);
  });
});

// ── Dashboard ──
async function loadDashboard() {
  try {
    const stats = await api('/requests/stats');
    const container = document.getElementById('stats-container');
    container.innerHTML = `
      <div class="stat-card total"><div class="stat-value">${stats.total}</div><div class="stat-label">Всего заявок</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--primary)">${stats.new}</div><div class="stat-label">Новые</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--warning)">${stats.in_progress}</div><div class="stat-label">В пути</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#eab308">${stats.assigned}</div><div class="stat-label">Назначены</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${stats.confirmed}</div><div class="stat-label">Выполнены</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${stats.delivered}</div><div class="stat-label">Доставлены</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--danger)">${stats.rejected}</div><div class="stat-label">Отклонены</div></div>
    `;

    const data = await api('/requests?page=1');
    renderRequestList(data.requests, 'recent-requests');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Requests List ──
async function loadRequests() {
  renderFilterTabs();
  try {
    const qs = currentFilter ? `?status=${currentFilter}&page=${currentPage}` : `?page=${currentPage}`;
    const data = await api(`/requests${qs}`);
    renderRequestList(data.requests, 'requests-list');

    const pag = document.getElementById('requests-pagination');
    if (data.pages > 1) {
      let html = '';
      for (let i = 1; i <= data.pages; i++) {
        html += `<button class="btn btn-sm ${i === data.page ? 'btn-primary' : 'btn-outline'}" onclick="goPage(${i})" style="margin:2px">${i}</button>`;
      }
      pag.innerHTML = html;
    } else {
      pag.innerHTML = '';
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function goPage(p) { currentPage = p; loadRequests(); }

function renderFilterTabs() {
  const tabs = document.getElementById('filter-tabs');
  const statuses = [
    { value: '', label: 'Все' },
    { value: 'new', label: 'Новые' },
    { value: 'assigned', label: 'Назначены' },
    { value: 'in_progress', label: 'В пути' },
    { value: 'delivered', label: 'Доставлены' },
    { value: 'confirmed', label: 'Выполнены' },
    { value: 'rejected', label: 'Отклонены' },
  ];
  tabs.innerHTML = statuses.map(s =>
    `<button class="filter-tab ${currentFilter === s.value ? 'active' : ''}" onclick="setFilter('${s.value}')">${s.label}</button>`
  ).join('');
}

function setFilter(f) { currentFilter = f; currentPage = 1; loadRequests(); }

function renderRequestList(requests, containerId) {
  const container = document.getElementById(containerId);
  if (!requests.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128230;</div><p>Заявок пока нет</p></div>';
    return;
  }
  container.innerHTML = requests.map(r => `
    <div class="request-card priority-${r.priority}" onclick="openDetail(${r.id})">
      <div class="request-card-header">
        <span class="request-id">#${r.id}</span>
        <span class="badge badge-${r.status}">${STATUS_LABELS[r.status]}</span>
      </div>
      <div class="request-card-body">
        <p><strong>${escapeHtml(r.cargo_description)}</strong></p>
        <p>${escapeHtml(r.pickup_location)} &rarr; ${escapeHtml(r.delivery_location)}</p>
      </div>
      <div class="request-card-footer">
        <span>${r.sender_name || '—'}</span>
        <span>${formatDate(r.created_at)}</span>
      </div>
    </div>
  `).join('');
}

// ── Request Detail ──
async function openDetail(id) {
  previousView = document.querySelector('.view.active')?.id.replace('view-', '') || 'requests';
  currentDetailId = id;
  navigateToView('detail');

  try {
    const r = await api(`/requests/${id}`);
    renderDetail(r);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function navigateToView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
}

function renderDetail(r) {
  const role = currentUser.role;
  const userId = currentUser.id;
  let actionsHtml = '';

  // Диспетчер: назначить исполнителя
  if (role === 'dispatcher' && ['new', 'assigned'].includes(r.status)) {
    actionsHtml += `<button class="btn btn-primary btn-sm" onclick="openAssignModal(${r.id})">Назначить</button>`;
  }

  // Исполнитель: взять в работу
  if (role === 'executor' && r.status === 'assigned') {
    actionsHtml += `<button class="btn btn-warning btn-sm" onclick="changeStatus(${r.id},'in_progress')">Взять в работу</button>`;
  }

  // Исполнитель: доставлено
  if (role === 'executor' && r.status === 'in_progress') {
    actionsHtml += `<button class="btn btn-success btn-sm" onclick="changeStatus(${r.id},'delivered')">Доставлено</button>`;
  }

  // Клиент (получатель/отправитель): подтвердить или отклонить доставку
  if (role === 'client' && r.status === 'delivered' && (r.receiver_id === userId || r.sender_id === userId)) {
    actionsHtml += `<button class="btn btn-success btn-sm" onclick="changeStatus(${r.id},'confirmed')">Подтвердить</button>`;
    actionsHtml += `<button class="btn btn-danger btn-sm" onclick="openRejectModal(${r.id})">Отклонить</button>`;
  }

  // Диспетчер: отклонить
  if (role === 'dispatcher' && ['new', 'assigned', 'delivered'].includes(r.status)) {
    actionsHtml += `<button class="btn btn-danger btn-sm" onclick="openRejectModal(${r.id})">Отклонить</button>`;
  }

  const historyHtml = (r.history || []).map(h => `
    <div class="history-item">
      <span class="badge badge-${h.status}">${STATUS_LABELS[h.status]}</span>
      ${h.comment ? `<p style="margin-top:6px;font-size:14px">${escapeHtml(h.comment)}</p>` : ''}
      <div class="history-meta">${h.changed_by_name} &mdash; ${formatDate(h.created_at)}</div>
    </div>
  `).join('');

  document.getElementById('detail-content').innerHTML = `
    <div class="detail-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-size:20px;font-weight:700">Заявка #${r.id}</span>
        <span class="badge badge-${r.status}">${STATUS_LABELS[r.status]}</span>
      </div>
      ${actionsHtml ? `<div class="btn-group">${actionsHtml}</div>` : ''}
    </div>

    <div class="detail-section">
      <h3>Груз</h3>
      <div class="detail-row"><span class="detail-label">Описание</span><span class="detail-value">${escapeHtml(r.cargo_description)}</span></div>
      <div class="detail-row"><span class="detail-label">Вес</span><span class="detail-value">${r.weight ? r.weight + ' кг' : '—'}</span></div>
      <div class="detail-row"><span class="detail-label">Приоритет</span><span class="detail-value">${PRIORITY_LABELS[r.priority]}</span></div>
      ${r.notes ? `<div class="detail-row"><span class="detail-label">Примечания</span><span class="detail-value">${escapeHtml(r.notes)}</span></div>` : ''}
    </div>

    <div class="detail-section">
      <h3>Маршрут</h3>
      <div class="detail-row"><span class="detail-label">Откуда</span><span class="detail-value">${escapeHtml(r.pickup_location)}</span></div>
      <div class="detail-row"><span class="detail-label">Куда</span><span class="detail-value">${escapeHtml(r.delivery_location)}</span></div>
    </div>

    <div class="detail-section">
      <h3>Участники</h3>
      <div class="detail-row"><span class="detail-label">Заказчик</span><span class="detail-value">${r.sender_name || '—'}${r.sender_phone ? '<br>' + r.sender_phone : ''}</span></div>
      <div class="detail-row"><span class="detail-label">Получатель</span><span class="detail-value">${r.receiver_name || '—'}${r.receiver_phone ? '<br>' + r.receiver_phone : ''}</span></div>
      <div class="detail-row"><span class="detail-label">Исполнитель</span><span class="detail-value">${r.executor_name || '—'}${r.executor_phone ? '<br>' + r.executor_phone : ''}</span></div>
      <div class="detail-row"><span class="detail-label">Диспетчер</span><span class="detail-value">${r.dispatcher_name || '—'}</span></div>
    </div>

    <div class="detail-section">
      <h3>Даты</h3>
      <div class="detail-row"><span class="detail-label">Создана</span><span class="detail-value">${formatDate(r.created_at)}</span></div>
      <div class="detail-row"><span class="detail-label">Обновлена</span><span class="detail-value">${formatDate(r.updated_at)}</span></div>
    </div>

    ${historyHtml ? `<div class="detail-section"><h3>История</h3>${historyHtml}</div>` : ''}
  `;
}

// ── Status Change ──
async function changeStatus(id, status) {
  try {
    await api(`/requests/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    showToast('Статус обновлён');
    openDetail(id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Assign Modal ──
async function openAssignModal(id) {
  currentDetailId = id;
  try {
    const [executors, clients] = await Promise.all([
      api('/users/by-role/executor'),
      api('/users/by-role/client')
    ]);

    const execSelect = document.getElementById('assign-executor');
    execSelect.innerHTML = executors.map(e => `<option value="${e.id}">${e.full_name}</option>`).join('');

    const recSelect = document.getElementById('assign-receiver');
    recSelect.innerHTML = '<option value="">Не менять</option>' + clients.map(c => `<option value="${c.id}">${c.full_name}</option>`).join('');

    document.getElementById('assign-modal').classList.add('active');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

document.getElementById('assign-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const body = { executor_id: parseInt(document.getElementById('assign-executor').value) };
    const recId = document.getElementById('assign-receiver').value;
    if (recId) body.receiver_id = parseInt(recId);

    await api(`/requests/${currentDetailId}/assign`, { method: 'PATCH', body: JSON.stringify(body) });
    closeModal('assign-modal');
    showToast('Исполнитель назначен');
    openDetail(currentDetailId);
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ── Reject Modal ──
function openRejectModal(id) {
  currentDetailId = id;
  document.getElementById('reject-comment').value = '';
  document.getElementById('reject-modal').classList.add('active');
}

document.getElementById('reject-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api(`/requests/${currentDetailId}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ comment: document.getElementById('reject-comment').value })
    });
    closeModal('reject-modal');
    showToast('Заявка отклонена');
    openDetail(currentDetailId);
  } catch (err) {
    showToast(err.message, 'error');
  }
});

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// ── New Request Form ──
async function loadNewRequestForm() {
  try {
    const [clients, locations] = await Promise.all([
      api('/users/by-role/client'),
      api('/locations')
    ]);

    const receiverSelect = document.getElementById('nr-receiver');
    receiverSelect.innerHTML = '<option value="">Не указан</option>' + clients.map(c => `<option value="${c.id}">${c.full_name}</option>`).join('');

    const pickupSelect = document.getElementById('nr-pickup');
    const deliverySelect = document.getElementById('nr-delivery');
    const locOptions = locations.map(l => `<option value="${escapeHtml(l.name + (l.address ? ' (' + l.address + ')' : ''))}">${escapeHtml(l.name)}${l.address ? ' — ' + escapeHtml(l.address) : ''}</option>`).join('');
    pickupSelect.innerHTML = '<option value="">Выберите место</option>' + locOptions;
    deliverySelect.innerHTML = '<option value="">Выберите место</option>' + locOptions;
  } catch {}
}

document.getElementById('new-request-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const body = {
      cargo_description: document.getElementById('nr-cargo').value,
      weight: document.getElementById('nr-weight').value || null,
      pickup_location: document.getElementById('nr-pickup').value,
      delivery_location: document.getElementById('nr-delivery').value,
      priority: document.getElementById('nr-priority').value,
      notes: document.getElementById('nr-notes').value || null,
    };
    const recId = document.getElementById('nr-receiver').value;
    if (recId) body.receiver_id = parseInt(recId);

    const result = await api('/requests', { method: 'POST', body: JSON.stringify(body) });
    showToast('Заявка #' + result.id + ' создана');
    e.target.reset();
    navigateTo('requests');
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ── Locations Management ──
async function loadLocations() {
  const container = document.getElementById('locations-list');
  try {
    const locations = await api('/locations');
    if (!locations.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128205;</div><p>Мест пока нет</p></div>';
      return;
    }
    container.innerHTML = locations.map(l => `
      <div class="location-card">
        <div class="location-info">
          <div class="location-name">${escapeHtml(l.name)}</div>
          ${l.address ? `<div class="location-address">${escapeHtml(l.address)}</div>` : ''}
        </div>
        <div class="location-actions">
          <button class="btn btn-outline btn-sm" onclick="openLocationModal(${l.id}, '${escapeAttr(l.name)}', '${escapeAttr(l.address || '')}')">Ред.</button>
          <button class="btn btn-danger btn-sm" onclick="deleteLocation(${l.id})">Уд.</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openLocationModal(id, name, address) {
  document.getElementById('loc-id').value = id || '';
  document.getElementById('loc-name').value = name || '';
  document.getElementById('loc-address').value = address || '';
  document.getElementById('location-modal-title').textContent = id ? 'Редактировать место' : 'Добавить место';
  document.getElementById('location-modal').classList.add('active');
}

document.getElementById('location-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('loc-id').value;
  const body = {
    name: document.getElementById('loc-name').value,
    address: document.getElementById('loc-address').value || null
  };

  try {
    if (id) {
      await api(`/locations/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      showToast('Место обновлено');
    } else {
      await api('/locations', { method: 'POST', body: JSON.stringify(body) });
      showToast('Место добавлено');
    }
    closeModal('location-modal');
    loadLocations();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

async function deleteLocation(id) {
  if (!confirm('Удалить это место?')) return;
  try {
    await api(`/locations/${id}`, { method: 'DELETE' });
    showToast('Место удалено');
    loadLocations();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Health Page ──
async function loadHealth() {
  const container = document.getElementById('health-content');
  container.innerHTML = '<div class="loading">Проверка...</div>';

  try {
    const start = Date.now();
    const data = await api('/health');
    const latency = Date.now() - start;

    container.innerHTML = `
      <div class="health-row">
        <span>Сервер</span>
        <span class="${data.server === 'ok' ? 'health-ok' : 'health-err'}">${data.server === 'ok' ? 'Работает' : 'Ошибка'}</span>
      </div>
      <div class="health-row">
        <span>База данных</span>
        <span class="${data.database === 'ok' ? 'health-ok' : 'health-err'}">${data.database === 'ok' ? 'Подключена' : 'Ошибка'}</span>
      </div>
      <div class="health-row">
        <span>Задержка (ping)</span>
        <span>${latency} мс</span>
      </div>
      <div class="health-row">
        <span>Время сервера</span>
        <span>${formatDate(data.timestamp)}</span>
      </div>
      ${data.db_time ? `<div class="health-row"><span>Время БД</span><span>${formatDate(data.db_time)}</span></div>` : ''}
    `;
  } catch {
    container.innerHTML = `
      <div class="health-row">
        <span>Сервер</span>
        <span class="health-err">Недоступен</span>
      </div>
    `;
  }
}

// ── Helpers ──
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Auto-login ──
(async function init() {
  if (token) {
    try {
      const me = await api('/auth/me');
      currentUser = me;
      showApp();
    } catch {
      logout();
    }
  }
})();
