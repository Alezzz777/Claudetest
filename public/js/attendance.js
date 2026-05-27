let attendanceDate = new Date();

const ATT_STATUSES = {
    present: 'Присутствует',
    absent: 'Отсутствует',
    sick: 'Больничный',
    vacation: 'Отпуск',
};

async function renderAttendance() {
    const dateStr = formatDate(attendanceDate);
    document.getElementById('attendanceDate').textContent = formatDateRu(attendanceDate);

    const [employees, attendance] = await Promise.all([
        Store.getEmployees(),
        Store.getAttendance(dateStr),
    ]);

    const counts = { present: 0, absent: 0, sick: 0, vacation: 0 };
    employees.forEach(emp => {
        const status = attendance[emp.id] || 'absent';
        counts[status] = (counts[status] || 0) + 1;
    });

    document.getElementById('attendanceSummary').innerHTML = `
        <div class="att-summary-item present"><span class="att-count">${counts.present}</span><span class="att-label">На месте</span></div>
        <div class="att-summary-item absent"><span class="att-count">${counts.absent}</span><span class="att-label">Отсутствует</span></div>
        <div class="att-summary-item sick"><span class="att-count">${counts.sick}</span><span class="att-label">Больничный</span></div>
        <div class="att-summary-item vacation"><span class="att-count">${counts.vacation}</span><span class="att-label">Отпуск</span></div>
    `;

    const container = document.getElementById('attendanceList');
    if (employees.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>Нет сотрудников. Добавьте первого сотрудника.</p></div>`;
        return;
    }

    container.innerHTML = employees.map(emp => {
        const status = attendance[emp.id] || 'absent';
        const initials = emp.name.split(' ').map(w => w[0]).join('').slice(0, 2);
        return `
            <div class="att-card">
                <div class="att-avatar">${initials}</div>
                <div class="att-info">
                    <div class="att-name">${emp.name}</div>
                    <div class="att-position">${emp.position}${emp.grade ? ', ' + emp.grade : ''}</div>
                </div>
                <select class="att-status-select" onchange="updateAttendance('${dateStr}',${emp.id},this.value)">
                    ${Object.entries(ATT_STATUSES).map(([k,v]) =>
                        `<option value="${k}" ${status === k ? 'selected' : ''}>${v}</option>`
                    ).join('')}
                </select>
            </div>
        `;
    }).join('');
}

async function updateAttendance(date, empId, status) {
    await Store.setAttendance(date, empId, status);
    renderDashboard();
}

function showAddEmployee() {
    openModal('Добавить сотрудника',
        `<div class="form-group">
            <label>ФИО</label>
            <input id="empName" placeholder="Иванов И.А.">
        </div>
        <div class="form-group">
            <label>Должность</label>
            <input id="empPosition" placeholder="Токарь">
        </div>
        <div class="form-group">
            <label>Разряд / Категория</label>
            <input id="empGrade" placeholder="5 разряд">
        </div>`,
        `<button class="btn-primary" onclick="saveNewEmployee()">Добавить</button>
         <button class="btn-secondary" onclick="closeModal()">Отмена</button>`
    );
}

async function saveNewEmployee() {
    const name = document.getElementById('empName').value.trim();
    const position = document.getElementById('empPosition').value.trim();
    if (!name) { alert('Введите ФИО'); return; }
    await Store.addEmployee({
        name,
        position,
        grade: document.getElementById('empGrade').value.trim(),
    });
    closeModal();
    await Promise.all([renderAttendance(), renderDashboard(), refreshCaches()]);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnAddEmployee').addEventListener('click', showAddEmployee);

    document.getElementById('btnPrevDate').addEventListener('click', () => {
        attendanceDate.setDate(attendanceDate.getDate() - 1);
        renderAttendance();
    });
    document.getElementById('btnNextDate').addEventListener('click', () => {
        attendanceDate.setDate(attendanceDate.getDate() + 1);
        renderAttendance();
    });
});
