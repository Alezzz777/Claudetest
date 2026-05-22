(() => {
    const user = api.currentUser();
    if (!user) { location.href = '/'; return; }

    const ROLE_LABELS = { worker: 'Рабочий', foreman: 'Бригадир', master: 'Мастер' };
    const STATUS_LABELS = {
        created: 'Создано',
        in_progress: 'В работе',
        completed: 'Завершено',
        scrapped: 'Брак',
    };
    const ACTION_LABELS = {
        launch: 'Запуск',
        advance: 'Продвижение',
        complete: 'Завершение',
        rollback: 'Откат',
        scrap: 'В брак',
        return_from_scrap: 'Возврат из брака',
    };

    // Header
    document.getElementById('user-name').textContent = user.full_name;
    document.getElementById('user-role').textContent = ROLE_LABELS[user.role] || user.role;
    document.getElementById('logout-btn').addEventListener('click', () => api.logout());

    // Tabs: hide role-restricted tabs
    document.querySelectorAll('.tab').forEach(t => {
        const required = t.dataset.role;
        if (required && user.role !== required) t.hidden = true;
        t.addEventListener('click', () => activateTab(t.dataset.tab));
    });

    function activateTab(name) {
        document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
        if (name === 'list') loadList();
        if (name === 'launch') loadNomenclatureSelect();
        if (name === 'nomenclatures') loadNomenclatures();
        if (name === 'kanban') loadKanban();
    }

    // ---------- SCAN TAB ----------
    const scanError = document.getElementById('scan-error');
    const scannerContainer = document.getElementById('scanner-container');
    const scannerVideo = document.getElementById('scanner-video');
    const itemCard = document.getElementById('item-card');

    document.getElementById('scan-start').addEventListener('click', () => openScanner((code) => {
        closeScanner();
        document.getElementById('manual-barcode').value = code;
        lookupAndShow(code);
    }));
    document.getElementById('scan-stop').addEventListener('click', closeScanner);
    document.getElementById('manual-lookup').addEventListener('click', () => {
        const v = document.getElementById('manual-barcode').value.trim();
        if (v) lookupAndShow(v);
    });
    document.getElementById('manual-barcode').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('manual-lookup').click();
        }
    });

    function openScanner(cb) {
        scanError.classList.add('hidden');
        scannerContainer.classList.remove('hidden');
        barcodeScanner.start(scannerVideo, cb, (err) => {
            closeScanner();
            showScanError('Не удалось открыть камеру: ' + (err.message || err.name || 'нет доступа'));
        });
    }
    function closeScanner() {
        barcodeScanner.stop();
        scannerContainer.classList.add('hidden');
    }
    function showScanError(msg) {
        scanError.textContent = msg;
        scanError.classList.remove('hidden');
    }

    async function lookupAndShow(key) {
        scanError.classList.add('hidden');
        itemCard.classList.add('hidden');
        try {
            const data = await api.get('/api/items/lookup/' + encodeURIComponent(key));
            renderItem(data);
        } catch (err) {
            showScanError(err.message);
        }
    }

    function renderItem({ item, operations, history }) {
        itemCard.classList.remove('hidden');

        const curIdx = operations.findIndex(o => o.id === item.current_operation_id);
        const isScrapped = item.status === 'scrapped';
        const isCompleted = item.status === 'completed';

        const progressBars = operations.map((op, i) => {
            let cls = '';
            if (isScrapped) cls = i <= curIdx ? 'current' : '';
            else if (isCompleted) cls = 'done';
            else if (i < curIdx) cls = 'done';
            else if (i === curIdx) cls = 'current';
            return `<div class="progress-step ${cls}" title="${escapeHtml(op.name)}"></div>`;
        }).join('');

        const progressLabels = operations.map((op, i) => {
            let cls = '';
            if (isCompleted) cls = 'done';
            else if (isScrapped) cls = i === curIdx ? 'scrapped' : (i < curIdx ? 'done' : '');
            else if (i < curIdx) cls = 'done';
            else if (i === curIdx) cls = 'current';
            return `<span class="${cls}">${op.seq}. ${escapeHtml(op.name)}</span>`;
        }).join('');

        const role = user.role;
        const canAdvance = !isScrapped && !isCompleted && ['worker', 'foreman', 'master'].includes(role);
        const canRollback = !isScrapped && !isCompleted && curIdx > 0 && ['foreman', 'master'].includes(role);
        const canScrap = !isScrapped && !isCompleted && ['foreman', 'master'].includes(role);
        const canReturn = isScrapped && role === 'master';

        const isLast = curIdx === operations.length - 1;
        const advanceLabel = isLast ? '✓ Завершить' : '→ Продвинуть на следующую';

        const actions = [];
        if (canAdvance) actions.push(`<button class="btn ${isLast ? 'success' : 'primary'} big" data-action="advance">${advanceLabel}</button>`);
        if (canRollback) actions.push(`<button class="btn warning" data-action="rollback">⟵ Откатить</button>`);
        if (canScrap) actions.push(`<button class="btn danger" data-action="scrap">⨯ В брак</button>`);
        if (canReturn) actions.push(`<button class="btn success" data-action="return_from_scrap">↺ Вернуть из брака</button>`);

        itemCard.innerHTML = `
            <h2>${escapeHtml(item.nom_name)} № ${escapeHtml(item.serial_number)}</h2>
            <div class="meta">${escapeHtml(item.nom_code)} · <span class="status-badge status-${item.status}">${STATUS_LABELS[item.status]}</span></div>

            <div class="progress">${progressBars}</div>
            <div class="progress-labels">${progressLabels}</div>

            <dl class="kv">
                <dt>Штрих-код</dt><dd>${escapeHtml(item.barcode)}</dd>
                <dt>Текущая операция</dt><dd>${item.current_op_name ? `${item.current_seq}. ${escapeHtml(item.current_op_name)}` : '—'}</dd>
                ${item.scrap_reason ? `<dt>Причина брака</dt><dd>${escapeHtml(item.scrap_reason)}</dd>` : ''}
                <dt>Обновлено</dt><dd>${formatDate(item.updated_at)}</dd>
            </dl>

            ${actions.length ? `<div class="actions">${actions.join('')}</div>` : ''}

            <div class="history">
                <h3>История</h3>
                <div class="history-list">
                    ${history.map(h => `
                        <div class="history-item ${escapeHtml(h.action)}">
                            <div><b>${ACTION_LABELS[h.action] || h.action}</b>
                                ${h.from_op_name ? ` · с «${escapeHtml(h.from_op_name)}»` : ''}
                                ${h.to_op_name ? ` → «${escapeHtml(h.to_op_name)}»` : ''}
                            </div>
                            ${h.note ? `<div>${escapeHtml(h.note)}</div>` : ''}
                            <div class="who">${escapeHtml(h.user_name)} (${ROLE_LABELS[h.user_role] || h.user_role})</div>
                            <div class="ts">${formatDate(h.created_at)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        itemCard.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', () => doAction(item.id, btn.dataset.action));
        });
    }

    async function doAction(itemId, action) {
        let note = null;
        if (action === 'scrap') {
            note = prompt('Укажите причину брака:');
            if (note === null) return;
        } else if (action === 'return_from_scrap') {
            if (!confirm('Вернуть изделие из брака на текущую операцию?')) return;
        } else if (action === 'rollback') {
            note = prompt('Комментарий к откату (необязательно):', '') || null;
        }
        try {
            const data = await api.post(`/api/items/${itemId}/action`, { action, note });
            renderItem(data);
        } catch (err) {
            alert(err.message);
        }
    }

    // ---------- LIST TAB ----------
    const listEl = document.getElementById('item-list');
    const listSearch = document.getElementById('list-search');
    const listStatus = document.getElementById('list-status');
    const listNom = document.getElementById('list-nomenclature');

    let listDebounce = null;
    [listSearch, listStatus, listNom].forEach(el => {
        el.addEventListener('input', () => {
            clearTimeout(listDebounce);
            listDebounce = setTimeout(loadList, 250);
        });
    });

    async function loadList() {
        const params = new URLSearchParams();
        if (listSearch.value.trim()) params.set('q', listSearch.value.trim());
        if (listStatus.value) params.set('status', listStatus.value);
        if (listNom.value) params.set('nomenclature_id', listNom.value);

        // populate nom select once
        if (listNom.options.length <= 1) {
            try {
                const noms = await api.get('/api/nomenclatures');
                noms.forEach(n => {
                    const opt = document.createElement('option');
                    opt.value = n.id;
                    opt.textContent = `${n.code} · ${n.name}`;
                    listNom.appendChild(opt);
                });
            } catch {}
        }

        listEl.innerHTML = '<div class="muted">Загрузка…</div>';
        try {
            const items = await api.get('/api/items?' + params.toString());
            if (!items.length) {
                listEl.innerHTML = '<div class="muted">Изделия не найдены</div>';
                return;
            }
            listEl.innerHTML = items.map(it => `
                <div class="list-item" data-id="${it.id}">
                    <div class="main">
                        <div><b>${escapeHtml(it.nom_name)}</b> № ${escapeHtml(it.serial_number)}</div>
                        <div class="sub">${it.current_op_name ? `${it.current_seq}. ${escapeHtml(it.current_op_name)}` : 'Не запущено'}</div>
                        <div class="barcode">${escapeHtml(it.barcode)}</div>
                    </div>
                    <div class="right">
                        <span class="status-badge status-${it.status}">${STATUS_LABELS[it.status]}</span>
                    </div>
                </div>
            `).join('');
            listEl.querySelectorAll('.list-item').forEach(el => {
                el.addEventListener('click', () => {
                    activateTab('scan');
                    lookupAndShow(el.dataset.id);
                });
            });
        } catch (err) {
            listEl.innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
        }
    }

    // ---------- KANBAN TAB ----------
    const kanbanBoard = document.getElementById('kanban-board');
    const kanbanNom = document.getElementById('kanban-nomenclature');
    const kanbanShowScrap = document.getElementById('kanban-show-scrap');
    const kanbanRefresh = document.getElementById('kanban-refresh');

    let kanbanNomsLoaded = false;

    kanbanNom.addEventListener('change', () => {
        localStorage.setItem('kanbanNom', kanbanNom.value);
        renderKanban();
    });
    kanbanShowScrap.addEventListener('change', () => {
        localStorage.setItem('kanbanShowScrap', kanbanShowScrap.checked ? '1' : '');
        renderKanban();
    });
    kanbanRefresh.addEventListener('click', renderKanban);

    async function loadKanban() {
        if (!kanbanNomsLoaded) {
            kanbanBoard.innerHTML = '<div class="kanban-placeholder">Загрузка номенклатур…</div>';
            try {
                const noms = await api.get('/api/nomenclatures');
                kanbanNom.innerHTML = '';
                if (!noms.length) {
                    kanbanBoard.innerHTML = '<div class="kanban-placeholder">Сначала создайте номенклатуру</div>';
                    return;
                }
                noms.forEach(n => {
                    const opt = document.createElement('option');
                    opt.value = n.id;
                    opt.textContent = `${n.code} · ${n.name}`;
                    opt._operations = n.operations;
                    kanbanNom.appendChild(opt);
                });
                const saved = localStorage.getItem('kanbanNom');
                if (saved && [...kanbanNom.options].some(o => o.value === saved)) {
                    kanbanNom.value = saved;
                }
                kanbanShowScrap.checked = localStorage.getItem('kanbanShowScrap') === '1';
                kanbanNomsLoaded = true;
            } catch (err) {
                kanbanBoard.innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
                return;
            }
        }
        renderKanban();
    }

    async function renderKanban() {
        const nomId = kanbanNom.value;
        if (!nomId) {
            kanbanBoard.innerHTML = '<div class="kanban-placeholder">Выберите номенклатуру</div>';
            return;
        }
        const selectedOpt = kanbanNom.selectedOptions[0];
        const operations = selectedOpt._operations || [];

        kanbanBoard.innerHTML = '<div class="kanban-placeholder">Загрузка…</div>';
        try {
            const params = new URLSearchParams({ nomenclature_id: nomId });
            const items = await api.get('/api/items?' + params.toString());

            const byOp = new Map();
            operations.forEach(o => byOp.set(o.id, []));
            const scrapItems = [];

            for (const it of items) {
                if (it.status === 'scrapped') {
                    scrapItems.push(it);
                } else if (it.status === 'in_progress' && it.current_seq != null) {
                    const opId = operations.find(o => o.seq === it.current_seq)?.id;
                    if (opId && byOp.has(opId)) byOp.get(opId).push(it);
                }
            }

            const columns = operations.map(op => {
                const list = byOp.get(op.id) || [];
                return `
                    <div class="kanban-column">
                        <div class="kanban-column-header">
                            <span class="seq">${op.seq}</span>
                            <span class="name" title="${escapeHtml(op.name)}">${escapeHtml(op.name)}</span>
                            <span class="count">${list.length}</span>
                        </div>
                        <div class="kanban-cards">
                            ${list.length ? list.map(cardHtml).join('') :
                                '<div class="kanban-empty">пусто</div>'}
                        </div>
                    </div>`;
            }).join('');

            const scrapCol = kanbanShowScrap.checked ? `
                <div class="kanban-column scrap-col">
                    <div class="kanban-column-header">
                        <span class="seq">⨯</span>
                        <span class="name">Брак</span>
                        <span class="count">${scrapItems.length}</span>
                    </div>
                    <div class="kanban-cards">
                        ${scrapItems.length ? scrapItems.map(it => cardHtml(it, true)).join('') :
                            '<div class="kanban-empty">пусто</div>'}
                    </div>
                </div>` : '';

            kanbanBoard.innerHTML = columns + scrapCol;
            kanbanBoard.querySelectorAll('.kanban-card').forEach(el => {
                el.addEventListener('click', () => {
                    activateTab('scan');
                    document.getElementById('manual-barcode').value = el.dataset.barcode || '';
                    lookupAndShow(el.dataset.id);
                });
            });
        } catch (err) {
            kanbanBoard.innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
        }
    }

    function cardHtml(it, scrap = false) {
        return `
            <div class="kanban-card ${scrap ? 'scrap' : ''}"
                 data-id="${it.id}" data-barcode="${escapeHtml(it.barcode)}">
                <div class="sn">№ ${escapeHtml(it.serial_number)}</div>
                <div class="bc">${escapeHtml(it.barcode)}</div>
                <div class="age">${timeAgo(it.updated_at)}</div>
            </div>`;
    }

    function timeAgo(iso) {
        if (!iso) return '';
        const diff = (Date.now() - new Date(iso).getTime()) / 1000;
        if (diff < 60) return 'только что';
        if (diff < 3600) return Math.floor(diff / 60) + ' мин';
        if (diff < 86400) return Math.floor(diff / 3600) + ' ч';
        return Math.floor(diff / 86400) + ' дн';
    }

    // ---------- LAUNCH TAB ----------
    const launchForm = document.getElementById('launch-form');
    const launchMsg = document.getElementById('launch-msg');

    async function loadNomenclatureSelect() {
        const sel = launchForm.querySelector('select[name="nomenclature_id"]');
        if (sel.options.length > 0) return;
        try {
            const noms = await api.get('/api/nomenclatures');
            noms.forEach(n => {
                const opt = document.createElement('option');
                opt.value = n.id;
                opt.textContent = `${n.code} · ${n.name} (${n.operations.length} оп.)`;
                sel.appendChild(opt);
            });
        } catch (err) {
            launchMsg.textContent = err.message;
            launchMsg.classList.remove('hidden');
        }
    }

    document.getElementById('launch-scan-btn').addEventListener('click', () => {
        openScanner((code) => {
            closeScanner();
            document.getElementById('launch-barcode').value = code;
        });
    });

    launchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        launchMsg.classList.add('hidden');
        const data = Object.fromEntries(new FormData(launchForm).entries());
        try {
            const res = await api.post('/api/items', data);
            launchMsg.className = 'error-banner success';
            launchMsg.textContent = 'Изделие запущено. ID: ' + res.id;
            launchMsg.classList.remove('hidden');
            launchForm.reset();
        } catch (err) {
            launchMsg.className = 'error-banner';
            launchMsg.textContent = err.message;
            launchMsg.classList.remove('hidden');
        }
    });

    // ---------- NOMENCLATURES TAB ----------
    const nomListEl = document.getElementById('nom-list');
    const nomForm = document.getElementById('nom-form');
    const nomMsg = document.getElementById('nom-msg');
    const nomAddWrap = document.getElementById('nom-add-wrap');
    if (user.role !== 'master') nomAddWrap.style.display = 'none';

    async function loadNomenclatures() {
        nomListEl.innerHTML = '<div class="muted">Загрузка…</div>';
        try {
            const noms = await api.get('/api/nomenclatures');
            if (!noms.length) {
                nomListEl.innerHTML = '<div class="muted">Номенклатуры ещё не созданы</div>';
                return;
            }
            nomListEl.innerHTML = noms.map(n => `
                <div class="nom-card">
                    <h3>${escapeHtml(n.name)}</h3>
                    <div class="code">${escapeHtml(n.code)}</div>
                    ${n.description ? `<div class="muted" style="margin-top:.25rem">${escapeHtml(n.description)}</div>` : ''}
                    <ol>${n.operations.map(o => `<li>${escapeHtml(o.name)}</li>`).join('')}</ol>
                </div>
            `).join('');
        } catch (err) {
            nomListEl.innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
        }
    }

    nomForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        nomMsg.classList.add('hidden');
        const fd = new FormData(nomForm);
        const operations = fd.get('operations').split('\n').map(s => s.trim()).filter(Boolean);
        const payload = {
            code: fd.get('code').trim(),
            name: fd.get('name').trim(),
            description: fd.get('description').trim() || null,
            operations,
        };
        try {
            await api.post('/api/nomenclatures', payload);
            nomMsg.className = 'error-banner success';
            nomMsg.textContent = 'Номенклатура создана';
            nomMsg.classList.remove('hidden');
            nomForm.reset();
            loadNomenclatures();
        } catch (err) {
            nomMsg.className = 'error-banner';
            nomMsg.textContent = err.message;
            nomMsg.classList.remove('hidden');
        }
    });

    // ---------- HELPERS ----------
    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }
    function formatDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
    }
})();
