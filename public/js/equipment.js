const STATUS_LABELS = {
    working: 'В работе',
    idle: 'Простой',
    maintenance: 'Ремонт',
    broken: 'Авария',
};

let equipFilter = 'all';

async function renderEquipment() {
    const list = await Store.getEquipment();
    const container = document.getElementById('equipmentList');

    const filtered = equipFilter === 'all' ? list : list.filter(e => e.status === equipFilter);

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            <p>Нет оборудования</p>
        </div>`;
        return;
    }

    container.innerHTML = filtered.map(eq => `
        <div class="equip-card" onclick="editEquipment(${eq.id})">
            <div class="equip-status-dot ${eq.status}"></div>
            <div class="equip-info">
                <div class="equip-name">${eq.name}</div>
                <div class="equip-detail">Инв. № ${eq.inventoryNo}${eq.note ? ' · ' + eq.note : ''}</div>
            </div>
            <span class="equip-status-badge ${eq.status}">${STATUS_LABELS[eq.status]}</span>
        </div>
    `).join('');
}

function equipmentFormHtml(eq) {
    const s = eq || { name: '', inventoryNo: '', status: 'working', note: '' };
    return `
        <div class="form-group">
            <label>Название</label>
            <input id="eqName" value="${s.name}" placeholder="Например: Токарный станок ТВ-320">
        </div>
        <div class="form-group">
            <label>Инвентарный номер</label>
            <input id="eqInvNo" value="${s.inventoryNo}" placeholder="Например: ТВ-001">
        </div>
        <div class="form-group">
            <label>Статус</label>
            <select id="eqStatus">
                ${Object.entries(STATUS_LABELS).map(([k,v]) =>
                    `<option value="${k}" ${s.status === k ? 'selected' : ''}>${v}</option>`
                ).join('')}
            </select>
        </div>
        <div class="form-group">
            <label>Примечание</label>
            <textarea id="eqNote" placeholder="Причина простоя, описание неисправности...">${s.note || ''}</textarea>
        </div>
    `;
}

function showAddEquipment() {
    openModal('Добавить оборудование', equipmentFormHtml(),
        `<button class="btn-primary" onclick="saveNewEquipment()">Добавить</button>
         <button class="btn-secondary" onclick="closeModal()">Отмена</button>`
    );
}

async function saveNewEquipment() {
    const name = document.getElementById('eqName').value.trim();
    const inventoryNo = document.getElementById('eqInvNo').value.trim();
    if (!name) { alert('Введите название'); return; }
    await Store.addEquipment({
        name,
        inventoryNo,
        status: document.getElementById('eqStatus').value,
        note: document.getElementById('eqNote').value.trim(),
    });
    closeModal();
    await Promise.all([renderEquipment(), renderDashboard(), refreshCaches()]);
}

async function editEquipment(id) {
    const list = await Store.getEquipment();
    const eq = list.find(e => e.id === id);
    if (!eq) return;
    openModal('Редактировать', equipmentFormHtml(eq),
        `<button class="btn-primary" onclick="saveEditEquipment(${id})">Сохранить</button>
         <button class="btn-danger" onclick="confirmDeleteEquipment(${id})">Удалить</button>
         <button class="btn-secondary" onclick="closeModal()">Отмена</button>`
    );
}

async function confirmDeleteEquipment(id) {
    if (!confirm('Удалить оборудование?')) return;
    await Store.deleteEquipment(id);
    closeModal();
    await Promise.all([renderEquipment(), renderDashboard(), refreshCaches()]);
}

async function saveEditEquipment(id) {
    const name = document.getElementById('eqName').value.trim();
    if (!name) { alert('Введите название'); return; }
    await Store.updateEquipment(id, {
        name,
        inventoryNo: document.getElementById('eqInvNo').value.trim(),
        status: document.getElementById('eqStatus').value,
        note: document.getElementById('eqNote').value.trim(),
    });
    closeModal();
    await Promise.all([renderEquipment(), renderDashboard(), refreshCaches()]);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnAddEquipment').addEventListener('click', showAddEquipment);

    document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            equipFilter = btn.dataset.filter;
            renderEquipment();
        });
    });
});
