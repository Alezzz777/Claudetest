const API = {
    async get(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    },
    async post(url, data) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    },
    async put(url, data) {
        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    },
    async del(url) {
        const res = await fetch(url, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    },
    async upload(url, formData) {
        const res = await fetch(url, { method: 'POST', body: formData });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    },
};

let personsCache = [];

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

// --- Tabs ---
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
        const nav = document.getElementById('mainNav');
        nav.classList.remove('nav-open');
        nav.classList.add('nav-closed');

        if (btn.dataset.tab === 'persons') loadPersons();
        if (btn.dataset.tab === 'families') loadFamilies();
        if (btn.dataset.tab === 'tree') loadTreeSelect();
    });
});

document.getElementById('menuToggle').addEventListener('click', () => {
    const nav = document.getElementById('mainNav');
    nav.classList.toggle('nav-open');
    nav.classList.toggle('nav-closed');
});

// --- Persons ---
async function loadPersons(search = '') {
    const url = search ? `/api/persons?search=${encodeURIComponent(search)}` : '/api/persons';
    const persons = await API.get(url);
    personsCache = persons;
    renderPersons(persons);
}

function genderBadge(g) {
    if (g === 'M') return '<span class="card-badge badge-male">М</span>';
    if (g === 'F') return '<span class="card-badge badge-female">Ж</span>';
    return '<span class="card-badge badge-unknown">?</span>';
}

function genderTag(name, g) {
    const cls = g === 'M' ? 'tag-male' : (g === 'F' ? 'tag-female' : 'tag-unknown');
    return `<span class="family-person-tag ${cls}">${escapeHtml(name)}</span>`;
}

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

function renderPersons(persons) {
    const list = document.getElementById('personsList');
    if (!persons.length) {
        list.innerHTML = '<div class="tree-empty-state"><p>Нет записей. Добавьте первую персону.</p></div>';
        return;
    }
    list.innerHTML = persons.map(p => {
        const name = `${p.first_name} ${p.last_name}`.trim();
        const details = [];
        if (p.birth_date) details.push(`<span class="card-detail">&#128197; ${escapeHtml(p.birth_date)}</span>`);
        if (p.birth_place) details.push(`<span class="card-detail">&#128205; ${escapeHtml(p.birth_place)}</span>`);
        if (p.death_date) details.push(`<span class="card-detail">&#10013; ${escapeHtml(p.death_date)}</span>`);
        return `
            <div class="card">
                <div class="card-header">
                    <span class="card-name">${escapeHtml(name)}</span>
                    ${genderBadge(p.gender)}
                </div>
                ${details.length ? `<div class="card-details">${details.join('')}</div>` : ''}
                <div class="card-actions">
                    <button class="btn btn-secondary btn-sm" onclick="editPerson(${p.id})">&#9998; Изменить</button>
                    <button class="btn btn-secondary btn-sm" onclick="viewInTree(${p.id})">&#127795; Дерево</button>
                    <button class="btn btn-danger btn-sm" onclick="deletePerson(${p.id})">&#128465;</button>
                </div>
            </div>
        `;
    }).join('');
}

let searchTimeout;
document.getElementById('personSearch').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadPersons(e.target.value), 300);
});

document.getElementById('addPersonBtn').addEventListener('click', () => openPersonModal());

function openPersonModal(person = null) {
    const modal = document.getElementById('personModal');
    document.getElementById('personModalTitle').textContent = person ? 'Редактировать персону' : 'Добавить персону';
    document.getElementById('personId').value = person ? person.id : '';
    document.getElementById('firstName').value = person ? person.first_name : '';
    document.getElementById('lastName').value = person ? person.last_name : '';
    document.getElementById('maidenName').value = person ? person.maiden_name : '';
    document.getElementById('gender').value = person ? person.gender : 'U';
    document.getElementById('birthDate').value = person ? person.birth_date : '';
    document.getElementById('birthPlace').value = person ? person.birth_place : '';
    document.getElementById('deathDate').value = person ? person.death_date : '';
    document.getElementById('deathPlace').value = person ? person.death_place : '';
    document.getElementById('notes').value = person ? person.notes : '';
    modal.classList.add('open');
}

document.getElementById('closePersonModal').addEventListener('click', () => {
    document.getElementById('personModal').classList.remove('open');
});
document.getElementById('cancelPersonBtn').addEventListener('click', () => {
    document.getElementById('personModal').classList.remove('open');
});

document.getElementById('personForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('personId').value;
    const data = {
        first_name: document.getElementById('firstName').value.trim(),
        last_name: document.getElementById('lastName').value.trim(),
        maiden_name: document.getElementById('maidenName').value.trim(),
        gender: document.getElementById('gender').value,
        birth_date: document.getElementById('birthDate').value.trim(),
        birth_place: document.getElementById('birthPlace').value.trim(),
        death_date: document.getElementById('deathDate').value.trim(),
        death_place: document.getElementById('deathPlace').value.trim(),
        notes: document.getElementById('notes').value.trim(),
    };
    try {
        if (id) {
            await API.put(`/api/persons/${id}`, data);
            showToast('Персона обновлена');
        } else {
            await API.post('/api/persons', data);
            showToast('Персона добавлена');
        }
        document.getElementById('personModal').classList.remove('open');
        loadPersons();
    } catch (err) {
        showToast('Ошибка: ' + err.message);
    }
});

async function editPerson(id) {
    const person = await API.get(`/api/persons/${id}`);
    openPersonModal(person);
}

async function deletePerson(id) {
    if (!confirm('Удалить эту персону?')) return;
    try {
        await API.del(`/api/persons/${id}`);
        showToast('Персона удалена');
        loadPersons();
    } catch (err) {
        showToast('Ошибка: ' + err.message);
    }
}

function viewInTree(id) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    document.querySelector('[data-tab="tree"]').classList.add('active');
    document.getElementById('tab-tree').classList.add('active');
    loadTreeSelect().then(() => {
        document.getElementById('treeRootSelect').value = id;
        loadTree(id);
    });
}

// --- Families ---
async function loadFamilies() {
    const families = await API.get('/api/families');
    renderFamilies(families);
}

function renderFamilies(families) {
    const list = document.getElementById('familiesList');
    if (!families.length) {
        list.innerHTML = '<div class="tree-empty-state"><p>Нет семей. Создайте первую семью.</p></div>';
        return;
    }
    list.innerHTML = families.map(f => {
        const hName = f.husband ? `${f.husband.first_name} ${f.husband.last_name}`.trim() : '?';
        const wName = f.wife ? `${f.wife.first_name} ${f.wife.last_name}`.trim() : '?';
        const hGender = f.husband ? f.husband.gender : 'U';
        const wGender = f.wife ? f.wife.gender : 'U';
        const children = f.children || [];
        return `
            <div class="card">
                <div class="family-card-people">
                    ${genderTag(hName, hGender)}
                    <span class="family-heart">&#10084;&#65039;</span>
                    ${genderTag(wName, wGender)}
                </div>
                ${f.marriage_date ? `<div class="card-details" style="margin-top:8px"><span class="card-detail">&#128141; ${escapeHtml(f.marriage_date)}</span></div>` : ''}
                ${children.length ? `
                    <div class="family-children-label">Дети (${children.length}):</div>
                    <div class="family-children-tags">
                        ${children.map(c => `<span class="child-tag">${escapeHtml(c.child.first_name)} ${escapeHtml(c.child.last_name)}</span>`).join('')}
                    </div>
                ` : ''}
                <div class="card-actions">
                    <button class="btn btn-secondary btn-sm" onclick="editFamily(${f.id})">&#9998; Изменить</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteFamily(${f.id})">&#128465;</button>
                </div>
            </div>
        `;
    }).join('');
}

document.getElementById('addFamilyBtn').addEventListener('click', () => openFamilyModal());

async function openFamilyModal(family = null) {
    await loadPersons();
    const modal = document.getElementById('familyModal');
    document.getElementById('familyModalTitle').textContent = family ? 'Редактировать семью' : 'Создать семью';
    document.getElementById('familyId').value = family ? family.id : '';

    const options = personsCache.map(p =>
        `<option value="${p.id}">${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)} (${p.gender})</option>`
    ).join('');

    document.getElementById('husbandSelect').innerHTML = `<option value="">-- Не выбран --</option>${options}`;
    document.getElementById('wifeSelect').innerHTML = `<option value="">-- Не выбрана --</option>${options}`;

    if (family) {
        document.getElementById('husbandSelect').value = family.husband_id || '';
        document.getElementById('wifeSelect').value = family.wife_id || '';
        document.getElementById('marriageDate').value = family.marriage_date || '';
        document.getElementById('marriagePlace').value = family.marriage_place || '';
        document.getElementById('divorceDate').value = family.divorce_date || '';
    } else {
        document.getElementById('husbandSelect').value = '';
        document.getElementById('wifeSelect').value = '';
        document.getElementById('marriageDate').value = '';
        document.getElementById('marriagePlace').value = '';
        document.getElementById('divorceDate').value = '';
    }

    const existingChildIds = family ? (family.children || []).map(c => c.child_id) : [];
    const checkboxes = document.getElementById('childrenCheckboxes');
    checkboxes.innerHTML = personsCache.map(p => `
        <div class="checkbox-item">
            <input type="checkbox" id="child_${p.id}" value="${p.id}" ${existingChildIds.includes(p.id) ? 'checked' : ''}>
            <label for="child_${p.id}">${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</label>
        </div>
    `).join('');

    modal.classList.add('open');
}

document.getElementById('closeFamilyModal').addEventListener('click', () => {
    document.getElementById('familyModal').classList.remove('open');
});
document.getElementById('cancelFamilyBtn').addEventListener('click', () => {
    document.getElementById('familyModal').classList.remove('open');
});

document.getElementById('familyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('familyId').value;
    const selectedChildren = [];
    document.querySelectorAll('#childrenCheckboxes input:checked').forEach(cb => {
        selectedChildren.push(parseInt(cb.value));
    });

    const data = {
        husband_id: document.getElementById('husbandSelect').value ? parseInt(document.getElementById('husbandSelect').value) : null,
        wife_id: document.getElementById('wifeSelect').value ? parseInt(document.getElementById('wifeSelect').value) : null,
        marriage_date: document.getElementById('marriageDate').value.trim(),
        marriage_place: document.getElementById('marriagePlace').value.trim(),
        divorce_date: document.getElementById('divorceDate').value.trim(),
        children_ids: selectedChildren,
    };

    try {
        if (id) {
            await API.put(`/api/families/${id}`, data);
            showToast('Семья обновлена');
        } else {
            await API.post('/api/families', data);
            showToast('Семья создана');
        }
        document.getElementById('familyModal').classList.remove('open');
        loadFamilies();
    } catch (err) {
        showToast('Ошибка: ' + err.message);
    }
});

async function editFamily(id) {
    const family = await API.get(`/api/families/${id}`);
    openFamilyModal(family);
}

async function deleteFamily(id) {
    if (!confirm('Удалить эту семью?')) return;
    try {
        await API.del(`/api/families/${id}`);
        showToast('Семья удалена');
        loadFamilies();
    } catch (err) {
        showToast('Ошибка: ' + err.message);
    }
}

// --- Tree ---
let treeScale = 1;
let treeOffsetX = 0;
let treeOffsetY = 0;
let isDragging = false;
let dragStartX, dragStartY;
let lastTouchDist = 0;

const treeContainer = document.getElementById('treeContainer');
const treeCanvas = document.getElementById('treeCanvas');

async function loadTreeSelect() {
    const persons = await API.get('/api/persons');
    personsCache = persons;
    const sel = document.getElementById('treeRootSelect');
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">Выберите корневую персону...</option>';
    persons.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.first_name} ${p.last_name}`.trim();
        sel.appendChild(opt);
    });
    if (currentVal) sel.value = currentVal;
}

document.getElementById('treeRootSelect').addEventListener('change', (e) => {
    if (e.target.value) loadTree(parseInt(e.target.value));
});

async function loadTree(rootId) {
    try {
        const tree = await API.get(`/api/tree/${rootId}`);
        renderTree(tree);
    } catch (err) {
        showToast('Ошибка загрузки дерева');
    }
}

function renderTree(tree) {
    treeCanvas.innerHTML = '';
    if (!tree) return;

    const NODE_W = 160;
    const NODE_H = 60;
    const H_GAP = 30;
    const V_GAP = 80;

    const nodes = [];
    const edges = [];

    function measureSubtree(node) {
        if (!node) return 0;
        if (!node.children || node.children.length === 0) return NODE_W;
        let totalWidth = 0;
        node.children.forEach((child, i) => {
            if (i > 0) totalWidth += H_GAP;
            totalWidth += measureSubtree(child);
        });
        return Math.max(NODE_W, totalWidth);
    }

    function layoutNode(node, x, y, availableWidth) {
        const nodeX = x + (availableWidth - NODE_W) / 2;
        nodes.push({ ...node, x: nodeX, y, w: NODE_W, h: NODE_H });

        if (node.spouses && node.spouses.length > 0) {
            const spouse = node.spouses[0];
            const spouseX = nodeX + NODE_W + 20;
            nodes.push({
                id: spouse.id,
                name: spouse.name,
                gender: spouse.gender,
                birth_date: '',
                death_date: '',
                x: spouseX,
                y: y,
                w: NODE_W,
                h: NODE_H,
                isSpouse: true,
            });
            edges.push({
                x1: nodeX + NODE_W, y1: y + NODE_H / 2,
                x2: spouseX, y2: y + NODE_H / 2,
                type: 'spouse',
            });
        }

        if (node.children && node.children.length > 0) {
            const childrenWidths = node.children.map(c => measureSubtree(c));
            const totalChildrenWidth = childrenWidths.reduce((a, b) => a + b, 0) + (node.children.length - 1) * H_GAP;
            let startX = x + (availableWidth - totalChildrenWidth) / 2;

            const parentCenterX = node.spouses && node.spouses.length > 0
                ? nodeX + NODE_W + 10
                : nodeX + NODE_W / 2;

            node.children.forEach((child, i) => {
                const childWidth = childrenWidths[i];
                const childCenterX = startX + childWidth / 2;
                const childY = y + NODE_H + V_GAP;

                edges.push({
                    x1: parentCenterX, y1: y + NODE_H,
                    x2: childCenterX, y2: childY,
                    type: 'child',
                });

                layoutNode(child, startX, childY, childWidth);
                startX += childWidth + H_GAP;
            });
        }
    }

    const totalWidth = measureSubtree(tree);
    const spouseExtra = (tree.spouses && tree.spouses.length > 0) ? NODE_W + 20 : 0;
    const canvasWidth = Math.max(totalWidth + spouseExtra + 100, treeContainer.clientWidth);

    layoutNode(tree, 50, 30, totalWidth);

    let maxY = 0;
    let maxX = 0;
    nodes.forEach(n => {
        if (n.y + n.h > maxY) maxY = n.y + n.h;
        if (n.x + n.w > maxX) maxX = n.x + n.w;
    });

    const svgW = maxX + 100;
    const svgH = maxY + 100;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'tree-svg');
    svg.setAttribute('width', svgW);
    svg.setAttribute('height', svgH);

    edges.forEach(e => {
        if (e.type === 'spouse') {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', e.x1);
            line.setAttribute('y1', e.y1);
            line.setAttribute('x2', e.x2);
            line.setAttribute('y2', e.y2);
            line.style.stroke = '#ec4899';
            line.style.strokeWidth = '2';
            line.style.strokeDasharray = '6,3';
            svg.appendChild(line);
        } else {
            const midY = (e.y1 + e.y2) / 2;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M${e.x1},${e.y1} L${e.x1},${midY} L${e.x2},${midY} L${e.x2},${e.y2}`);
            path.style.fill = 'none';
            path.style.stroke = '#d1d5db';
            path.style.strokeWidth = '2';
            svg.appendChild(path);
        }
    });

    treeCanvas.appendChild(svg);

    nodes.forEach(n => {
        const div = document.createElement('div');
        div.className = `tree-node ${n.gender === 'M' ? 'male' : (n.gender === 'F' ? 'female' : '')}`;
        div.style.left = n.x + 'px';
        div.style.top = n.y + 'px';
        div.style.width = n.w + 'px';

        const dates = [];
        if (n.birth_date) dates.push(n.birth_date);
        if (n.death_date) dates.push('† ' + n.death_date);

        div.innerHTML = `
            <div class="node-name">${escapeHtml(n.name)}</div>
            ${dates.length ? `<div class="node-dates">${escapeHtml(dates.join(' — '))}</div>` : ''}
        `;

        div.addEventListener('click', () => {
            if (!n.isSpouse) {
                document.getElementById('treeRootSelect').value = n.id;
                loadTree(n.id);
            } else {
                document.getElementById('treeRootSelect').value = n.id;
                loadTree(n.id);
            }
        });

        treeCanvas.appendChild(div);
    });

    treeCanvas.style.width = svgW + 'px';
    treeCanvas.style.height = svgH + 'px';

    treeScale = 1;
    treeOffsetX = 0;
    treeOffsetY = 0;
    updateTreeTransform();

    const containerW = treeContainer.clientWidth;
    if (svgW > containerW) {
        treeScale = Math.max(0.4, containerW / svgW);
        updateTreeTransform();
    }
}

function updateTreeTransform() {
    treeCanvas.style.transform = `translate(${treeOffsetX}px, ${treeOffsetY}px) scale(${treeScale})`;
}

document.getElementById('zoomIn').addEventListener('click', () => {
    treeScale = Math.min(2, treeScale + 0.1);
    updateTreeTransform();
});

document.getElementById('zoomOut').addEventListener('click', () => {
    treeScale = Math.max(0.2, treeScale - 0.1);
    updateTreeTransform();
});

document.getElementById('zoomReset').addEventListener('click', () => {
    treeScale = 1;
    treeOffsetX = 0;
    treeOffsetY = 0;
    updateTreeTransform();
});

treeContainer.addEventListener('mousedown', (e) => {
    if (e.target.closest('.tree-node')) return;
    isDragging = true;
    dragStartX = e.clientX - treeOffsetX;
    dragStartY = e.clientY - treeOffsetY;
    treeContainer.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    treeOffsetX = e.clientX - dragStartX;
    treeOffsetY = e.clientY - dragStartY;
    updateTreeTransform();
});

window.addEventListener('mouseup', () => {
    isDragging = false;
    treeContainer.style.cursor = '';
});

treeContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    treeScale = Math.max(0.2, Math.min(2, treeScale + delta));
    updateTreeTransform();
}, { passive: false });

let touchStartX, touchStartY;
treeContainer.addEventListener('touchstart', (e) => {
    if (e.target.closest('.tree-node')) return;
    if (e.touches.length === 1) {
        isDragging = true;
        touchStartX = e.touches[0].clientX - treeOffsetX;
        touchStartY = e.touches[0].clientY - treeOffsetY;
    } else if (e.touches.length === 2) {
        isDragging = false;
        lastTouchDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
    }
});

treeContainer.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && isDragging) {
        treeOffsetX = e.touches[0].clientX - touchStartX;
        treeOffsetY = e.touches[0].clientY - touchStartY;
        updateTreeTransform();
    } else if (e.touches.length === 2) {
        const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        if (lastTouchDist > 0) {
            const scaleDelta = (dist - lastTouchDist) * 0.005;
            treeScale = Math.max(0.2, Math.min(2, treeScale + scaleDelta));
            updateTreeTransform();
        }
        lastTouchDist = dist;
    }
}, { passive: false });

treeContainer.addEventListener('touchend', () => {
    isDragging = false;
    lastTouchDist = 0;
});

// --- Import/Export ---
const dropZone = document.getElementById('dropZone');
const gedcomFile = document.getElementById('gedcomFile');
const importBtn = document.getElementById('importBtn');
const importResult = document.getElementById('importResult');

dropZone.addEventListener('click', () => gedcomFile.click());
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
        gedcomFile.files = e.dataTransfer.files;
        handleFileSelect();
    }
});

gedcomFile.addEventListener('change', handleFileSelect);

function handleFileSelect() {
    const file = gedcomFile.files[0];
    if (file) {
        document.getElementById('fileName').textContent = file.name;
        importBtn.disabled = false;
    }
}

importBtn.addEventListener('click', async () => {
    const file = gedcomFile.files[0];
    if (!file) return;
    importBtn.disabled = true;
    importBtn.textContent = 'Импортируется...';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const result = await API.upload('/api/gedcom/import', formData);
        importResult.className = 'result-message show success';
        importResult.textContent = result.message;
        showToast('Импорт завершён!');
        loadTreeSelect();
    } catch (err) {
        importResult.className = 'result-message show error';
        importResult.textContent = 'Ошибка импорта: ' + err.message;
    }

    importBtn.disabled = false;
    importBtn.textContent = 'Импортировать';
});

document.getElementById('exportBtn').addEventListener('click', () => {
    window.location.href = '/api/gedcom/export';
    showToast('Экспорт начат');
});

document.getElementById('clearAllBtn').addEventListener('click', async () => {
    if (!confirm('Вы уверены? Все данные будут безвозвратно удалены!')) return;
    if (!confirm('Точно удалить ВСЕ данные?')) return;
    try {
        await API.del('/api/clear');
        showToast('Все данные удалены');
        loadPersons();
        loadFamilies();
        loadTreeSelect();
    } catch (err) {
        showToast('Ошибка: ' + err.message);
    }
});

// --- Init ---
loadTreeSelect();
