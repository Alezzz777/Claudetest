const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Fetch full item info by id or barcode
async function loadItem(client, key) {
    const str = String(key);
    // PostgreSQL INTEGER max is 2 147 483 647 (10 digits). EAN-13 barcodes are
    // 13 digits and overflow integer cast — search by id only for short
    // numeric strings, otherwise look up by barcode.
    const asInt = /^\d+$/.test(str) && str.length <= 9 ? parseInt(str, 10) : null;

    const select = `
        SELECT i.*, n.code AS nom_code, n.name AS nom_name,
               op.seq AS current_seq, op.name AS current_op_name
        FROM items i
        JOIN nomenclatures n ON n.id = i.nomenclature_id
        LEFT JOIN operations op ON op.id = i.current_operation_id`;

    let q, params;
    if (asInt !== null) {
        q = `${select} WHERE i.id = $1 OR i.barcode = $2 LIMIT 1`;
        params = [asInt, str];
    } else {
        q = `${select} WHERE i.barcode = $1 LIMIT 1`;
        params = [str];
    }
    const { rows } = await client.query(q, params);
    return rows[0] || null;
}

async function getOperations(client, nomId) {
    const { rows } = await client.query(
        `SELECT id, seq, name FROM operations WHERE nomenclature_id = $1 ORDER BY seq`,
        [nomId]
    );
    return rows;
}

async function loadHistory(client, itemId) {
    const { rows } = await client.query(
        `SELECT m.*, u.full_name AS user_name, u.role AS user_role,
                fo.name AS from_op_name, fo.seq AS from_op_seq,
                to_.name AS to_op_name, to_.seq AS to_op_seq
         FROM movements m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN operations fo ON fo.id = m.from_operation_id
         LEFT JOIN operations to_ ON to_.id = m.to_operation_id
         WHERE m.item_id = $1
         ORDER BY m.created_at DESC`,
        [itemId]
    );
    return rows;
}

// List items with filters
router.get('/', async (req, res) => {
    const { status, nomenclature_id, q } = req.query;
    const params = [];
    const where = [];
    if (status) { params.push(status); where.push(`i.status = $${params.length}`); }
    if (nomenclature_id) { params.push(nomenclature_id); where.push(`i.nomenclature_id = $${params.length}`); }
    if (q) {
        params.push(`%${q}%`);
        where.push(`(i.barcode ILIKE $${params.length} OR i.serial_number ILIKE $${params.length})`);
    }
    const sql = `
        SELECT i.id, i.serial_number, i.barcode, i.status,
               n.code AS nom_code, n.name AS nom_name,
               op.seq AS current_seq, op.name AS current_op_name,
               i.updated_at
        FROM items i
        JOIN nomenclatures n ON n.id = i.nomenclature_id
        LEFT JOIN operations op ON op.id = i.current_operation_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY i.updated_at DESC
        LIMIT 200`;
    const { rows } = await db.query(sql, params);
    res.json(rows);
});

// Lookup single item by barcode or id (with full history & next operation)
router.get('/lookup/:key', async (req, res) => {
    const client = await db.getClient();
    try {
        const item = await loadItem(client, req.params.key);
        if (!item) return res.status(404).json({ error: 'Изделие не найдено' });
        const ops = await getOperations(client, item.nomenclature_id);
        const history = await loadHistory(client, item.id);
        res.json({ item, operations: ops, history });
    } finally {
        client.release();
    }
});

function ean13Checksum(twelve) {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        const d = parseInt(twelve[i], 10);
        sum += (i % 2 === 0) ? d : d * 3;
    }
    return String((10 - (sum % 10)) % 10);
}

function isValidEAN13(code) {
    if (!/^\d{13}$/.test(code)) return false;
    return ean13Checksum(code.slice(0, 12)) === code[12];
}

// Prefix '200' = EAN-13 internal/in-store range, safe for private use
function generateEAN13() {
    let twelve = '200';
    for (let i = 0; i < 9; i++) twelve += Math.floor(Math.random() * 10);
    return twelve + ean13Checksum(twelve);
}

// Launch a new item into production (master only)
router.post('/', requireRole('master'), async (req, res) => {
    const { nomenclature_id, serial_number } = req.body || {};
    let { barcode } = req.body || {};
    if (typeof barcode === 'string') barcode = barcode.trim();
    if (!nomenclature_id || !serial_number) {
        return res.status(400).json({ error: 'Заполните номенклатуру и серийный номер' });
    }
    if (barcode && !isValidEAN13(barcode)) {
        return res.status(400).json({ error: 'Штрих-код должен быть корректным EAN-13 (13 цифр с правильной контрольной цифрой)' });
    }
    const autoBarcode = !barcode;
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const ops = await getOperations(client, nomenclature_id);
        if (ops.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'У номенклатуры нет операций' });
        }
        const firstOp = ops[0];

        let itemId = null;
        for (let attempt = 0; attempt < 5 && itemId === null; attempt++) {
            const candidate = autoBarcode ? generateEAN13() : barcode;
            try {
                const { rows } = await client.query(
                    `INSERT INTO items (nomenclature_id, serial_number, barcode, current_operation_id, status)
                     VALUES ($1,$2,$3,$4,'in_progress')
                     RETURNING id`,
                    [nomenclature_id, serial_number, candidate, firstOp.id]
                );
                itemId = rows[0].id;
                barcode = candidate;
            } catch (err) {
                if (err.code === '23505' && autoBarcode) {
                    // collision on generated barcode — try again
                    continue;
                }
                throw err;
            }
        }
        if (itemId === null) {
            await client.query('ROLLBACK');
            return res.status(500).json({ error: 'Не удалось сгенерировать уникальный штрих-код' });
        }

        await client.query(
            `INSERT INTO movements (item_id, user_id, action, to_operation_id, note)
             VALUES ($1,$2,'launch',$3,$4)`,
            [itemId, req.user.id, firstOp.id, 'Запуск в производство']
        );
        await client.query('COMMIT');
        res.json({ id: itemId, barcode, serial_number, auto_generated: autoBarcode });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Штрих-код или серийный номер уже существует' });
        }
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Movement action: advance | rollback | scrap | return_from_scrap | complete
router.post('/:key/action', async (req, res) => {
    const { action, note } = req.body || {};
    const role = req.user.role;

    const permissions = {
        advance:           ['worker', 'foreman', 'master'],
        rollback:          ['foreman', 'master'],
        scrap:             ['foreman', 'master'],
        return_from_scrap: ['master'],
    };
    if (!permissions[action]) {
        return res.status(400).json({ error: 'Неизвестное действие' });
    }
    if (!permissions[action].includes(role)) {
        return res.status(403).json({ error: 'Недостаточно прав для этого действия' });
    }

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const item = await loadItem(client, req.params.key);
        if (!item) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Изделие не найдено' });
        }
        const ops = await getOperations(client, item.nomenclature_id);
        const curIdx = ops.findIndex(o => o.id === item.current_operation_id);

        let newOpId = item.current_operation_id;
        let newStatus = item.status;
        let scrapReason = item.scrap_reason;
        let resolvedAction = action;
        const fromOpId = item.current_operation_id;

        if (action === 'advance') {
            if (item.status === 'scrapped') throw httpError(409, 'Изделие в браке — продвижение невозможно');
            if (item.status === 'completed') throw httpError(409, 'Изделие уже завершено');
            if (curIdx === -1) throw httpError(409, 'Изделие не запущено в производство');
            if (curIdx >= ops.length - 1) {
                newStatus = 'completed';
                resolvedAction = 'complete';
            } else {
                newOpId = ops[curIdx + 1].id;
                newStatus = 'in_progress';
            }
        } else if (action === 'rollback') {
            if (item.status === 'scrapped') throw httpError(409, 'Изделие в браке — откат невозможен');
            if (curIdx <= 0) throw httpError(409, 'Откат с первой операции невозможен');
            newOpId = ops[curIdx - 1].id;
            newStatus = 'in_progress';
        } else if (action === 'scrap') {
            if (item.status === 'scrapped') throw httpError(409, 'Изделие уже в браке');
            newStatus = 'scrapped';
            scrapReason = note || 'Без указания причины';
        } else if (action === 'return_from_scrap') {
            if (item.status !== 'scrapped') throw httpError(409, 'Изделие не в браке');
            newStatus = 'in_progress';
            scrapReason = null;
        }

        await client.query(
            `UPDATE items
             SET current_operation_id = $1, status = $2, scrap_reason = $3, updated_at = NOW()
             WHERE id = $4`,
            [newOpId, newStatus, scrapReason, item.id]
        );
        await client.query(
            `INSERT INTO movements (item_id, user_id, action, from_operation_id, to_operation_id, note)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [item.id, req.user.id, resolvedAction, fromOpId, newOpId, note || null]
        );
        await client.query('COMMIT');

        const fresh = await loadItem(client, item.id);
        const history = await loadHistory(client, item.id);
        res.json({ item: fresh, operations: ops, history });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

function httpError(code, msg) {
    const e = new Error(msg);
    e.statusCode = code;
    return e;
}

module.exports = router;
