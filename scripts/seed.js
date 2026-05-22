require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../db');

async function upsertUser(username, fullName, role, password) {
    const hash = await bcrypt.hash(password, 10);
    await db.query(
        `INSERT INTO users (username, full_name, role, password_hash)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (username) DO UPDATE
           SET full_name = EXCLUDED.full_name,
               role = EXCLUDED.role,
               password_hash = EXCLUDED.password_hash`,
        [username, fullName, role, hash]
    );
}

async function upsertNomenclature(code, name, operations) {
    const { rows } = await db.query(
        `INSERT INTO nomenclatures (code, name)
         VALUES ($1,$2)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [code, name]
    );
    const nomId = rows[0].id;

    await db.query('DELETE FROM operations WHERE nomenclature_id = $1', [nomId]);
    for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        const opName = typeof op === 'string' ? op : op.name;
        const opHours = typeof op === 'string' ? 0 : (op.hours || 0);
        await db.query(
            `INSERT INTO operations (nomenclature_id, seq, name, hours) VALUES ($1,$2,$3,$4)`,
            [nomId, i + 1, opName, opHours]
        );
    }
    return nomId;
}

(async () => {
    try {
        await upsertUser('worker',  'Иван Рабочий',     'worker',  'worker123');
        await upsertUser('worker2', 'Алексей Кузнецов', 'worker',  'worker123');
        await upsertUser('worker3', 'Дмитрий Орлов',    'worker',  'worker123');
        await upsertUser('worker4', 'Николай Сидоров',  'worker',  'worker123');
        await upsertUser('foreman', 'Пётр Бригадир',    'foreman', 'foreman123');
        await upsertUser('foreman2','Олег Лебедев',     'foreman', 'foreman123');
        await upsertUser('master',  'Сергей Мастер',    'master',  'master123');
        await upsertUser('admin',   'Администратор',    'admin',   'admin123');
        await upsertUser('tech',    'Анна Технолог',    'technologist', 'tech123');

        await upsertNomenclature('VAL-001', 'Вал ведущий', [
            { name: 'Заготовка',           hours: 0.25 },
            { name: 'Токарная обработка',  hours: 1.50 },
            { name: 'Фрезеровка',          hours: 1.00 },
            { name: 'Термообработка',      hours: 4.00 },
            { name: 'Шлифовка',            hours: 0.75 },
            { name: 'Контроль ОТК',        hours: 0.20 },
        ]);

        await upsertNomenclature('KOR-002', 'Корпус редуктора', [
            { name: 'Литьё',         hours: 2.00 },
            { name: 'Обдирка',       hours: 1.20 },
            { name: 'Расточка',      hours: 2.50 },
            { name: 'Сверловка',     hours: 1.00 },
            { name: 'Покраска',      hours: 0.80 },
            { name: 'Контроль ОТК',  hours: 0.30 },
        ]);

        console.log('Seed completed.');
        console.log('Users: worker/worker123, foreman/foreman123, master/master123, admin/admin123, tech/tech123');
        process.exit(0);
    } catch (err) {
        console.error('Seed failed:', err.message);
        process.exit(1);
    }
})();
