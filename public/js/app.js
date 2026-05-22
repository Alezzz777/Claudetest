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
        if (required) {
            const allowed = required.split(/[\s,]+/).filter(Boolean);
            if (!allowed.includes(user.role)) t.hidden = true;
        }
        t.addEventListener('click', () => activateTab(t.dataset.tab));
    });

    function activateTab(name) {
        document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
        if (name === 'list') loadList();
        if (name === 'launch') loadNomenclatureSelect();
        if (name === 'nomenclatures') loadNomenclatures();
        if (name === 'kanban') loadKanban();
        if (name === 'brigades') loadBrigades();
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

    const launchBarcodeInput = document.getElementById('launch-barcode');
    const launchBarcodeHint = document.getElementById('launch-barcode-hint');

    document.getElementById('launch-scan-btn').addEventListener('click', () => {
        openScanner((code) => {
            closeScanner();
            launchBarcodeInput.value = code;
            updateBarcodeHint();
        });
    });

    // Live EAN-13 validation hint
    launchBarcodeInput.addEventListener('input', () => {
        // strip anything that isn't a digit
        const cleaned = launchBarcodeInput.value.replace(/\D/g, '').slice(0, 13);
        if (cleaned !== launchBarcodeInput.value) launchBarcodeInput.value = cleaned;
        updateBarcodeHint();
    });

    function updateBarcodeHint() {
        const v = launchBarcodeInput.value;
        if (!v) {
            launchBarcodeHint.className = 'field-hint';
            launchBarcodeHint.textContent = 'Будет сгенерирован автоматически';
            return;
        }
        if (v.length < 13) {
            launchBarcodeHint.className = 'field-hint err';
            launchBarcodeHint.textContent = `Введено ${v.length} из 13 цифр`;
            return;
        }
        if (isValidEAN13(v)) {
            launchBarcodeHint.className = 'field-hint ok';
            launchBarcodeHint.textContent = '✓ Корректный EAN-13';
        } else {
            launchBarcodeHint.className = 'field-hint err';
            launchBarcodeHint.textContent = '✗ Неверная контрольная цифра EAN-13';
        }
    }

    function isValidEAN13(code) {
        if (!/^\d{13}$/.test(code)) return false;
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            const d = +code[i];
            sum += (i % 2 === 0) ? d : d * 3;
        }
        return ((10 - sum % 10) % 10) === +code[12];
    }

    const launchResult = document.getElementById('launch-result');
    const lrSerial = document.getElementById('lr-serial');
    const lrBarcode = document.getElementById('lr-barcode');
    const lrSvg = document.getElementById('lr-barcode-svg');

    document.getElementById('lr-new').addEventListener('click', () => {
        launchResult.classList.add('hidden');
        launchForm.classList.remove('hidden');
        launchForm.querySelector('input[name="serial_number"]').focus();
    });
    document.getElementById('lr-print').addEventListener('click', () => window.print());
    document.getElementById('lr-copy').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(lrBarcode.textContent);
            const btn = document.getElementById('lr-copy');
            const orig = btn.textContent;
            btn.textContent = '✓ Скопировано';
            setTimeout(() => btn.textContent = orig, 1500);
        } catch {}
    });

    launchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        launchMsg.classList.add('hidden');
        const data = Object.fromEntries(new FormData(launchForm).entries());

        if (data.barcode) {
            if (!isValidEAN13(data.barcode)) {
                launchMsg.className = 'error-banner';
                launchMsg.textContent = 'Штрих-код должен быть корректным EAN-13 (13 цифр с правильной контрольной цифрой). Очистите поле для автогенерации.';
                launchMsg.classList.remove('hidden');
                launchBarcodeInput.focus();
                return;
            }
        } else {
            delete data.barcode; // let server auto-generate
        }

        try {
            const res = await api.post('/api/items', data);
            launchForm.reset();
            updateBarcodeHint();
            launchForm.classList.add('hidden');
            lrSerial.textContent = res.serial_number;
            lrBarcode.textContent = res.barcode + (res.auto_generated ? ' (сгенерирован)' : '');
            renderBarcode(lrSvg, res.barcode);
            launchResult.classList.remove('hidden');
            launchResult.scrollIntoView({ behavior: 'smooth' });
        } catch (err) {
            launchMsg.className = 'error-banner';
            launchMsg.textContent = err.message;
            launchMsg.classList.remove('hidden');
        }
    });

    updateBarcodeHint();

    function renderBarcode(svg, code) {
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        try {
            const isEAN13 = /^\d{13}$/.test(code);
            JsBarcode(svg, code, {
                format: isEAN13 ? 'EAN13' : 'CODE128',
                displayValue: true,
                fontSize: 16,
                margin: 8,
                height: 80,
            });
        } catch (err) {
            console.error('barcode render failed', err);
        }
    }

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

    // ---------- BRIGADES TAB ----------
    const brigadeListEl = document.getElementById('brigade-list');
    const brigadeForm = document.getElementById('brigade-form');
    const brigadeFormForeman = document.getElementById('brigade-form-foreman');
    const brigadeMsg = document.getElementById('brigade-msg');
    const brigadeAddWrap = document.getElementById('brigade-add-wrap');
    if (user.role !== 'master') brigadeAddWrap.style.display = 'none';

    const openBrigades = new Set();
    let workersCache = null;

    async function loadBrigades() {
        brigadeListEl.innerHTML = '<div class="muted">Загрузка…</div>';
        try {
            const [brigades, workers] = await Promise.all([
                api.get('/api/brigades'),
                api.get('/api/users?role=worker'),
            ]);
            workersCache = workers;

            if (user.role === 'master' && brigadeFormForeman.options.length <= 1) {
                const foremen = await api.get('/api/users?role=foreman');
                foremen.forEach(f => {
                    const opt = document.createElement('option');
                    opt.value = f.id;
                    opt.textContent = f.full_name + ' (' + f.username + ')';
                    brigadeFormForeman.appendChild(opt);
                });
            }

            if (!brigades.length) {
                brigadeListEl.innerHTML = '<div class="muted">Бригады ещё не созданы</div>';
                return;
            }

            const cards = await Promise.all(brigades.map(async b => {
                const isMine = user.role === 'foreman' && b.foreman_id === user.id;
                const expanded = openBrigades.has(b.id) || isMine;
                const detail = expanded ? await api.get('/api/brigades/' + b.id) : null;
                return renderBrigadeCard(b, detail, isMine);
            }));
            brigadeListEl.innerHTML = cards.join('');
            bindBrigadeHandlers();
        } catch (err) {
            brigadeListEl.innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
        }
    }

    function canManageBrigade(b) {
        if (user.role === 'master') return true;
        if (user.role === 'foreman' && b.foreman_id === user.id) return true;
        return false;
    }

    function renderBrigadeCard(b, detail, isMine) {
        const canManage = canManageBrigade(b);
        const isOpen = openBrigades.has(b.id) || isMine;

        const memberIds = new Set((detail?.members || []).map(m => m.id));
        const available = (workersCache || []).filter(w => !memberIds.has(w.id));

        const memberRows = detail ? (detail.members.length ?
            detail.members.map(m => `
                <div class="brigade-member">
                    <span class="name">${escapeHtml(m.full_name)} <small>${escapeHtml(m.username)}</small></span>
                    ${canManage ? `<button class="btn small danger" data-remove="${m.id}" data-brigade="${b.id}">Исключить</button>` : ''}
                </div>`).join('') :
            '<div class="brigade-empty">Состав бригады пуст</div>'
        ) : '';

        const addRow = (canManage && detail) ? `
            <div class="brigade-add-row">
                <select data-add-select="${b.id}">
                    <option value="">— выберите рабочего —</option>
                    ${available.map(w => `<option value="${w.id}">${escapeHtml(w.full_name)} (${escapeHtml(w.username)})</option>`).join('')}
                </select>
                <button class="btn primary small" data-add-btn="${b.id}" ${available.length ? '' : 'disabled'}>Добавить</button>
            </div>
            ${available.length === 0 ? '<div class="muted" style="font-size:.85rem;margin-top:.5rem">Свободных рабочих нет — все уже состоят в бригадах.</div>' : ''}
        ` : '';

        const masterActions = user.role === 'master' ? `
            <div class="brigade-actions">
                <button class="btn small" data-rename="${b.id}">Переименовать</button>
                <button class="btn small" data-foreman="${b.id}">Сменить бригадира</button>
                <button class="btn small danger" data-delete="${b.id}">Удалить</button>
            </div>
        ` : '';

        const foremanLabel = b.foreman_name
            ? `<span class="brigade-foreman">👷 ${escapeHtml(b.foreman_name)}</span>`
            : `<span class="brigade-foreman" style="background:#fff3cd;color:#664d03">бригадир не назначен</span>`;

        return `
            <div class="brigade-card ${isMine ? 'is-mine' : ''}" data-card="${b.id}">
                <div class="brigade-head">
                    <div>
                        <h3>${escapeHtml(b.name)}</h3>
                        <div class="meta">${foremanLabel}<span class="brigade-count">${b.member_count} чел.</span></div>
                    </div>
                    <button class="btn small" data-toggle="${b.id}">${isOpen ? 'Свернуть' : 'Состав'}</button>
                </div>
                ${isOpen ? `
                    <div class="brigade-body">
                        <div class="brigade-members">${memberRows}</div>
                        ${addRow}
                        ${masterActions}
                    </div>` : ''}
            </div>`;
    }

    function bindBrigadeHandlers() {
        brigadeListEl.querySelectorAll('[data-toggle]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = +btn.dataset.toggle;
                if (openBrigades.has(id)) openBrigades.delete(id);
                else openBrigades.add(id);
                loadBrigades();
            });
        });
        brigadeListEl.querySelectorAll('[data-add-btn]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const bId = btn.dataset.addBtn;
                const sel = brigadeListEl.querySelector(`[data-add-select="${bId}"]`);
                const userId = sel.value;
                if (!userId) return;
                try {
                    await api.post(`/api/brigades/${bId}/members`, { user_id: +userId });
                    openBrigades.add(+bId);
                    loadBrigades();
                } catch (err) { alert(err.message); }
            });
        });
        brigadeListEl.querySelectorAll('[data-remove]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Исключить рабочего из бригады?')) return;
                const bId = btn.dataset.brigade;
                const uId = btn.dataset.remove;
                try {
                    await api.del(`/api/brigades/${bId}/members/${uId}`);
                    openBrigades.add(+bId);
                    loadBrigades();
                } catch (err) { alert(err.message); }
            });
        });
        brigadeListEl.querySelectorAll('[data-rename]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const bId = btn.dataset.rename;
                const card = brigadeListEl.querySelector(`[data-card="${bId}"] h3`);
                const cur = card ? card.textContent : '';
                const name = prompt('Новое название бригады:', cur);
                if (!name || !name.trim()) return;
                try {
                    await patchBrigade(bId, { name: name.trim() });
                    loadBrigades();
                } catch (err) { alert(err.message); }
            });
        });
        brigadeListEl.querySelectorAll('[data-foreman]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const bId = btn.dataset.foreman;
                try {
                    const foremen = await api.get('/api/users?role=foreman');
                    const choices = foremen.map((f, i) => `${i + 1}. ${f.full_name} (${f.username})`).join('\n');
                    const sel = prompt(`Выберите бригадира (номер) или 0 — снять:\n${choices}\n0. — снять —`, '');
                    if (sel === null) return;
                    const n = parseInt(sel, 10);
                    if (isNaN(n) || n < 0 || n > foremen.length) return alert('Некорректный выбор');
                    const foreman_id = n === 0 ? null : foremen[n - 1].id;
                    await patchBrigade(bId, { foreman_id });
                    loadBrigades();
                } catch (err) { alert(err.message); }
            });
        });
        brigadeListEl.querySelectorAll('[data-delete]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const bId = btn.dataset.delete;
                if (!confirm('Удалить бригаду? Состав будет очищен.')) return;
                try {
                    await api.del(`/api/brigades/${bId}`);
                    openBrigades.delete(+bId);
                    loadBrigades();
                } catch (err) { alert(err.message); }
            });
        });
    }

    async function patchBrigade(id, body) {
        await api.patch(`/api/brigades/${id}`, body);
    }

    brigadeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        brigadeMsg.classList.add('hidden');
        const data = Object.fromEntries(new FormData(brigadeForm).entries());
        const payload = {
            name: data.name,
            foreman_id: data.foreman_id ? +data.foreman_id : null,
        };
        try {
            await api.post('/api/brigades', payload);
            brigadeForm.reset();
            brigadeAddWrap.open = false;
            loadBrigades();
        } catch (err) {
            brigadeMsg.className = 'error-banner';
            brigadeMsg.textContent = err.message;
            brigadeMsg.classList.remove('hidden');
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
