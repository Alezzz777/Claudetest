require('dotenv/config');
const pool = require('./pool');
const initDb = require('./init');

async function seed() {
    await initDb();

    const { rows: existing } = await pool.query('SELECT count(*) AS c FROM equipment');
    if (Number(existing[0].c) > 0) {
        console.log('Database already has data, skipping seed.');
        await pool.end();
        return;
    }

    const today = new Date().toISOString().slice(0, 10);

    const eqData = [
        ['Токарный станок ТВ-320', 'ТВ-001', 'working', ''],
        ['Фрезерный станок 6Р82', 'ФР-002', 'working', ''],
        ['Сверлильный станок 2Н135', 'СВ-003', 'idle', 'Нет заготовок'],
        ['Шлифовальный станок 3Б71М', 'ШЛ-004', 'maintenance', 'Замена подшипника'],
        ['Пресс гидравлический П6330', 'ПР-005', 'working', ''],
    ];
    for (const [name, inv, status, note] of eqData) {
        await pool.query(
            'INSERT INTO equipment (name, inventory_no, status, note) VALUES ($1,$2,$3,$4)',
            [name, inv, status, note]
        );
    }

    const empData = [
        ['Иванов И.А.', 'Токарь', '5 разряд'],
        ['Петров С.В.', 'Фрезеровщик', '4 разряд'],
        ['Сидоров К.М.', 'Сверловщик', '4 разряд'],
        ['Козлов Д.Н.', 'Шлифовщик', '5 разряд'],
        ['Новиков А.П.', 'Прессовщик', '3 разряд'],
        ['Морозов В.Г.', 'Токарь', '6 разряд'],
    ];
    const empIds = [];
    for (const [name, position, grade] of empData) {
        const { rows } = await pool.query(
            'INSERT INTO employees (name, position, grade) VALUES ($1,$2,$3) RETURNING id',
            [name, position, grade]
        );
        empIds.push(rows[0].id);
    }

    const attData = [
        [empIds[0], 'present'], [empIds[1], 'present'], [empIds[2], 'absent'],
        [empIds[3], 'present'], [empIds[4], 'present'], [empIds[5], 'sick'],
    ];
    for (const [empId, status] of attData) {
        await pool.query(
            'INSERT INTO attendance (employee_id, date, status) VALUES ($1,$2,$3)',
            [empId, today, status]
        );
    }

    const { rows: eqRows } = await pool.query('SELECT id FROM equipment ORDER BY id');
    const outputData = [
        [empIds[0], eqRows[0].id, 'Вал приводной', 12, 'шт'],
        [empIds[1], eqRows[1].id, 'Корпус редуктора', 4, 'шт'],
        [empIds[3], eqRows[3].id, 'Втулка направляющая', 24, 'шт'],
        [empIds[4], eqRows[4].id, 'Заготовка фланца', 30, 'шт'],
    ];
    for (const [empId, eqId, product, qty, unit] of outputData) {
        await pool.query(
            'INSERT INTO output (employee_id, equipment_id, date, product, qty, unit) VALUES ($1,$2,$3,$4,$5,$6)',
            [empId, eqId, today, product, qty, unit]
        );
    }

    const planData = [
        ['Вал приводной', 'шт', 20, 12],
        ['Корпус редуктора', 'шт', 8, 4],
        ['Втулка направляющая', 'шт', 50, 24],
        ['Заготовка фланца', 'шт', 40, 30],
        ['Шестерня Z=32', 'шт', 15, 0],
    ];
    for (const [name, unit, planQty, factQty] of planData) {
        const { rows } = await pool.query(
            'INSERT INTO plan_items (name, unit, plan_qty) VALUES ($1,$2,$3) RETURNING id',
            [name, unit, planQty]
        );
        if (factQty > 0) {
            await pool.query(
                'INSERT INTO plan_fact (plan_item_id, date, fact_qty) VALUES ($1,$2,$3)',
                [rows[0].id, today, factQty]
            );
        }
    }

    console.log('Seed data inserted successfully.');
    await pool.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
