let outputDate = new Date();

function renderOutput() {
    const dateStr = formatDate(outputDate);
    document.getElementById('outputDate').textContent = formatDateRu(outputDate);

    const entries = Store.getOutput(dateStr);
    const employees = Store.getEmployees();

    const totalQty = entries.reduce((sum, e) => sum + Number(e.qty), 0);
    const uniqueEmployees = new Set(entries.map(e => e.employeeId)).size;

    document.getElementById('outputTotalBar').innerHTML = `
        <div class="output-total-item"><span class="ot-value">${entries.length}</span><span class="ot-label">Записей</span></div>
        <div class="output-total-item"><span class="ot-value">${uniqueEmployees}</span><span class="ot-label">Сотрудников</span></div>
        <div class="output-total-item"><span class="ot-value">${totalQty}</span><span class="ot-label">Единиц всего</span></div>
    `;

    const container = document.getElementById('outputList');
    if (entries.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>Нет записей выработки за этот день</p></div>`;
        return;
    }

    container.innerHTML = entries.map(entry => `
        <div class="output-card">
            <div class="output-card-header">
                <span class="output-employee">${getEmployeeName(entry.employeeId)}</span>
                <span class="output-qty">${entry.qty} ${entry.unit}</span>
            </div>
            <div class="output-card-details">
                <span>${entry.product}</span>
                <span>${getEquipmentName(entry.equipment)}</span>
            </div>
            <div class="output-card-actions">
                <button class="btn-edit" onclick="editOutput('${dateStr}','${entry.id}')">Изменить</button>
                <button class="btn-delete" onclick="deleteOutputEntry('${dateStr}','${entry.id}')">Удалить</button>
            </div>
        </div>
    `).join('');
}

function outputFormHtml(entry) {
    const employees = Store.getEmployees();
    const equipment = Store.getEquipment();
    const s = entry || { employeeId: '', product: '', qty: '', unit: 'шт', equipment: '' };

    return `
        <div class="form-group">
            <label>Сотрудник</label>
            <select id="outEmployee">
                <option value="">Выберите сотрудника</option>
                ${employees.map(e => `<option value="${e.id}" ${s.employeeId === e.id ? 'selected' : ''}>${e.name}</option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label>Наименование продукции</label>
            <input id="outProduct" value="${s.product}" placeholder="Вал приводной">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Количество</label>
                <input id="outQty" type="number" inputmode="numeric" value="${s.qty}" placeholder="0">
            </div>
            <div class="form-group">
                <label>Единица</label>
                <select id="outUnit">
                    ${['шт','кг','м','п.м.','л','компл.'].map(u =>
                        `<option ${s.unit === u ? 'selected' : ''}>${u}</option>`
                    ).join('')}
                </select>
            </div>
        </div>
        <div class="form-group">
            <label>Оборудование</label>
            <select id="outEquipment">
                <option value="">Не указано</option>
                ${equipment.map(e => `<option value="${e.id}" ${s.equipment === e.id ? 'selected' : ''}>${e.name}</option>`).join('')}
            </select>
        </div>
    `;
}

function showAddOutput() {
    const dateStr = formatDate(outputDate);
    openModal('Записать выработку', outputFormHtml(),
        `<button class="btn-primary" onclick="saveNewOutput('${dateStr}')">Записать</button>
         <button class="btn-secondary" onclick="closeModal()">Отмена</button>`
    );
}

function saveNewOutput(dateStr) {
    const employeeId = document.getElementById('outEmployee').value;
    const product = document.getElementById('outProduct').value.trim();
    const qty = Number(document.getElementById('outQty').value);
    if (!employeeId) { alert('Выберите сотрудника'); return; }
    if (!product) { alert('Введите наименование продукции'); return; }
    if (!qty || qty <= 0) { alert('Введите количество'); return; }

    Store.addOutput(dateStr, {
        employeeId,
        product,
        qty,
        unit: document.getElementById('outUnit').value,
        equipment: document.getElementById('outEquipment').value,
    });
    closeModal();
    renderOutput();
    renderDashboard();
}

function editOutput(dateStr, id) {
    const entries = Store.getOutput(dateStr);
    const entry = entries.find(e => e.id === id);
    if (!entry) return;

    openModal('Редактировать', outputFormHtml(entry),
        `<button class="btn-primary" onclick="saveEditOutput('${dateStr}','${id}')">Сохранить</button>
         <button class="btn-secondary" onclick="closeModal()">Отмена</button>`
    );
}

function saveEditOutput(dateStr, id) {
    const employeeId = document.getElementById('outEmployee').value;
    const product = document.getElementById('outProduct').value.trim();
    const qty = Number(document.getElementById('outQty').value);
    if (!employeeId || !product || !qty) { alert('Заполните все поля'); return; }

    Store.updateOutput(dateStr, id, {
        employeeId,
        product,
        qty,
        unit: document.getElementById('outUnit').value,
        equipment: document.getElementById('outEquipment').value,
    });
    closeModal();
    renderOutput();
    renderDashboard();
}

function deleteOutputEntry(dateStr, id) {
    if (!confirm('Удалить запись?')) return;
    Store.deleteOutput(dateStr, id);
    renderOutput();
    renderDashboard();
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnAddOutput').addEventListener('click', showAddOutput);

    document.getElementById('btnPrevOutputDate').addEventListener('click', () => {
        outputDate.setDate(outputDate.getDate() - 1);
        renderOutput();
    });
    document.getElementById('btnNextOutputDate').addEventListener('click', () => {
        outputDate.setDate(outputDate.getDate() + 1);
        renderOutput();
    });
});
