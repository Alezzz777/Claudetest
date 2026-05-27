function renderDashboard() {
    const today = formatDate(new Date());

    // Equipment
    const equipment = Store.getEquipment();
    const working = equipment.filter(e => e.status === 'working').length;
    document.getElementById('dashEquipWorking').textContent = `${working}/${equipment.length}`;

    // Attendance
    const employees = Store.getEmployees();
    const attendance = Store.getAttendance(today);
    const present = employees.filter(e => attendance[e.id] === 'present').length;
    document.getElementById('dashAttendance').textContent = `${present}/${employees.length}`;

    // Output
    const output = Store.getOutput(today);
    const totalOutput = output.reduce((sum, e) => sum + Number(e.qty), 0);
    document.getElementById('dashOutputTotal').textContent = totalOutput;

    // Plan
    const items = Store.getPlanItems();
    const facts = Store.getPlanFact(today);
    let totalPlan = 0, totalFact = 0;
    items.forEach(item => {
        totalPlan += Number(item.planQty);
        totalFact += Number(facts[item.id] || 0);
    });
    const pct = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;
    document.getElementById('dashPlanPercent').textContent = pct + '%';

    // Summary list
    const summaryList = document.getElementById('summaryList');
    const idle = equipment.filter(e => e.status === 'idle').length;
    const broken = equipment.filter(e => e.status === 'broken').length;
    const maint = equipment.filter(e => e.status === 'maintenance').length;
    const absent = employees.length - present;
    const sick = employees.filter(e => attendance[e.id] === 'sick').length;

    summaryList.innerHTML = `
        <div class="summary-item"><span class="label">Оборудование в работе</span><span class="value" style="color:var(--success)">${working} из ${equipment.length}</span></div>
        <div class="summary-item"><span class="label">Простой / Ремонт / Авария</span><span class="value">${idle} / ${maint} / ${broken}</span></div>
        <div class="summary-item"><span class="label">Сотрудников на месте</span><span class="value" style="color:var(--success)">${present} из ${employees.length}</span></div>
        <div class="summary-item"><span class="label">Отсутствуют / Больничный</span><span class="value" style="color:var(--danger)">${absent - sick} / ${sick}</span></div>
        <div class="summary-item"><span class="label">Общая выработка</span><span class="value" style="color:var(--primary)">${totalOutput} ед.</span></div>
        <div class="summary-item"><span class="label">Выполнение плана</span><span class="value" style="color:${pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)'}">${pct}%</span></div>
        <div class="summary-item"><span class="label">План / Факт</span><span class="value">${totalFact} / ${totalPlan}</span></div>
    `;
}
