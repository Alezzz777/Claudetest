let currentDate = new Date();

function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function formatDateRu(d) {
    const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
    const days = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

function switchTab(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    const pageEl = document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1));
    if (pageEl) pageEl.classList.add('active');

    const navBtn = document.querySelector(`.nav-btn[data-page="${page}"]`);
    if (navBtn) navBtn.classList.add('active');

    switch (page) {
        case 'dashboard': renderDashboard(); break;
        case 'equipment': renderEquipment(); break;
        case 'attendance': renderAttendance(); break;
        case 'output': renderOutput(); break;
        case 'plan': renderPlan(); break;
    }
}

function openModal(title, bodyHtml, footerHtml) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHtml;
    document.getElementById('modalFooter').innerHTML = footerHtml || '';
    document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
}

document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
});

function getEmployeeName(id) {
    const emp = Store.getEmployees().find(e => e.id === id);
    return emp ? emp.name : 'Неизвестный';
}

function getEquipmentName(id) {
    const eq = Store.getEquipment().find(e => e.id === id);
    return eq ? eq.name : '—';
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    Store.load();
    Store.seedDemoData();

    document.getElementById('headerDate').textContent = formatDateRu(new Date());

    document.getElementById('btnSettings').addEventListener('click', () => {
        openModal('Настройки',
            `<div class="form-group">
                <label>Данные приложения</label>
                <p style="font-size:13px;color:var(--gray-500);margin-bottom:10px;">
                    Все данные хранятся локально в браузере.
                </p>
            </div>`,
            `<button class="btn-danger" onclick="if(confirm('Удалить все данные?')){localStorage.clear();location.reload();}">Очистить данные</button>
             <button class="btn-secondary" onclick="closeModal()">Закрыть</button>`
        );
    });

    switchTab('dashboard');
});
