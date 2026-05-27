let planDate = new Date();

function renderPlan() {
    const dateStr = formatDate(planDate);
    document.getElementById('planDate').textContent = formatDateRu(planDate);

    const items = Store.getPlanItems();
    const facts = Store.getPlanFact(dateStr);

    let totalPlan = 0;
    let totalFact = 0;

    items.forEach(item => {
        totalPlan += Number(item.planQty);
        totalFact += Number(facts[item.id] || 0);
    });

    const overallPercent = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;
    const barColor = overallPercent >= 100 ? 'var(--success)' :
                     overallPercent >= 80 ? 'var(--primary)' :
                     overallPercent >= 50 ? 'var(--warning)' : 'var(--danger)';

    document.getElementById('planOverall').innerHTML = `
        <div class="plan-overall-percent" style="color:${barColor}">${overallPercent}%</div>
        <div class="plan-overall-label">Общее выполнение плана · ${totalFact} из ${totalPlan}</div>
        <div class="plan-progress-bar">
            <div class="plan-progress-fill" style="width:${Math.min(overallPercent, 100)}%;background:${barColor}"></div>
        </div>
    `;

    const container = document.getElementById('planList');
    if (items.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>Нет номенклатуры. Добавьте первую позицию.</p></div>`;
        return;
    }

    container.innerHTML = items.map(item => {
        const fact = Number(facts[item.id] || 0);
        const pct = item.planQty > 0 ? Math.round((fact / item.planQty) * 100) : 0;
        const cls = pct >= 100 ? 'over100' : pct >= 80 ? 'over80' : pct >= 50 ? 'over50' : 'under50';
        const color = pct >= 100 ? 'var(--success)' :
                      pct >= 80 ? 'var(--primary)' :
                      pct >= 50 ? 'var(--warning)' : 'var(--danger)';

        return `
            <div class="plan-card">
                <div class="plan-card-header">
                    <span class="plan-item-name">${item.name}</span>
                    <span class="plan-item-percent ${cls}">${pct}%</span>
                </div>
                <div class="plan-card-bar">
                    <div class="plan-card-bar-fill" style="width:${Math.min(pct, 100)}%;background:${color}"></div>
                </div>
                <div class="plan-card-numbers">
                    <span>План: <strong>${item.planQty} ${item.unit}</strong></span>
                    <span>Факт: <strong>${fact} ${item.unit}</strong></span>
                    <span>Остаток: <strong>${Math.max(item.planQty - fact, 0)} ${item.unit}</strong></span>
                </div>
                <div class="plan-card-actions">
                    <button class="btn-fact" onclick="addFactQty('${dateStr}','${item.id}')">Внести факт</button>
                    <button class="btn-edit" onclick="editPlanItem('${item.id}')">Изм.</button>
                    <button class="btn-delete" onclick="deletePlanItemConfirm('${item.id}')">Уд.</button>
                </div>
            </div>
        `;
    }).join('');
}

function addFactQty(dateStr, itemId) {
    const item = Store.getPlanItems().find(e => e.id === itemId);
    const currentFact = Number(Store.getPlanFact(dateStr)[itemId] || 0);
    if (!item) return;

    openModal('Внести факт: ' + item.name,
        `<div class="form-group">
            <label>Текущий факт: ${currentFact} ${item.unit} из ${item.planQty} ${item.unit}</label>
            <input id="factQty" type="number" inputmode="numeric" value="${currentFact}" placeholder="0">
        </div>`,
        `<button class="btn-primary" onclick="saveFactQty('${dateStr}','${itemId}')">Сохранить</button>
         <button class="btn-secondary" onclick="closeModal()">Отмена</button>`
    );
    setTimeout(() => {
        const input = document.getElementById('factQty');
        if (input) { input.focus(); input.select(); }
    }, 300);
}

function saveFactQty(dateStr, itemId) {
    const qty = Number(document.getElementById('factQty').value);
    if (isNaN(qty) || qty < 0) { alert('Введите корректное количество'); return; }
    Store.setPlanFact(dateStr, itemId, qty);
    closeModal();
    renderPlan();
    renderDashboard();
}

function showAddPlanItem() {
    openModal('Добавить номенклатуру',
        `<div class="form-group">
            <label>Наименование</label>
            <input id="planItemName" placeholder="Вал приводной">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>План (кол-во)</label>
                <input id="planItemQty" type="number" inputmode="numeric" placeholder="0">
            </div>
            <div class="form-group">
                <label>Единица</label>
                <select id="planItemUnit">
                    ${['шт','кг','м','п.м.','л','компл.'].map(u => `<option>${u}</option>`).join('')}
                </select>
            </div>
        </div>`,
        `<button class="btn-primary" onclick="saveNewPlanItem()">Добавить</button>
         <button class="btn-secondary" onclick="closeModal()">Отмена</button>`
    );
}

function saveNewPlanItem() {
    const name = document.getElementById('planItemName').value.trim();
    const planQty = Number(document.getElementById('planItemQty').value);
    if (!name) { alert('Введите наименование'); return; }
    if (!planQty || planQty <= 0) { alert('Введите плановое количество'); return; }
    Store.addPlanItem({
        name,
        planQty,
        unit: document.getElementById('planItemUnit').value,
    });
    closeModal();
    renderPlan();
    renderDashboard();
}

function editPlanItem(id) {
    const item = Store.getPlanItems().find(e => e.id === id);
    if (!item) return;
    openModal('Редактировать номенклатуру',
        `<div class="form-group">
            <label>Наименование</label>
            <input id="planItemName" value="${item.name}">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>План (кол-во)</label>
                <input id="planItemQty" type="number" inputmode="numeric" value="${item.planQty}">
            </div>
            <div class="form-group">
                <label>Единица</label>
                <select id="planItemUnit">
                    ${['шт','кг','м','п.м.','л','компл.'].map(u =>
                        `<option ${item.unit === u ? 'selected' : ''}>${u}</option>`
                    ).join('')}
                </select>
            </div>
        </div>`,
        `<button class="btn-primary" onclick="saveEditPlanItem('${id}')">Сохранить</button>
         <button class="btn-secondary" onclick="closeModal()">Отмена</button>`
    );
}

function saveEditPlanItem(id) {
    const name = document.getElementById('planItemName').value.trim();
    const planQty = Number(document.getElementById('planItemQty').value);
    if (!name || !planQty) { alert('Заполните все поля'); return; }
    Store.updatePlanItem(id, {
        name,
        planQty,
        unit: document.getElementById('planItemUnit').value,
    });
    closeModal();
    renderPlan();
    renderDashboard();
}

function deletePlanItemConfirm(id) {
    if (!confirm('Удалить номенклатуру?')) return;
    Store.deletePlanItem(id);
    renderPlan();
    renderDashboard();
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnAddPlanItem').addEventListener('click', showAddPlanItem);

    document.getElementById('btnPrevPlanDate').addEventListener('click', () => {
        planDate.setDate(planDate.getDate() - 1);
        renderPlan();
    });
    document.getElementById('btnNextPlanDate').addEventListener('click', () => {
        planDate.setDate(planDate.getDate() + 1);
        renderPlan();
    });
});
