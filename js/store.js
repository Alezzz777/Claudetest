const Store = {
    _data: null,

    _defaults() {
        return {
            equipment: [],
            employees: [],
            attendance: {},
            output: {},
            plan: {},
        };
    },

    load() {
        try {
            const raw = localStorage.getItem('masterApp');
            this._data = raw ? JSON.parse(raw) : this._defaults();
        } catch {
            this._data = this._defaults();
        }
        return this._data;
    },

    save() {
        localStorage.setItem('masterApp', JSON.stringify(this._data));
    },

    get data() {
        if (!this._data) this.load();
        return this._data;
    },

    genId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    },

    // Equipment
    getEquipment() { return this.data.equipment; },
    addEquipment(item) { item.id = this.genId(); this.data.equipment.push(item); this.save(); return item; },
    updateEquipment(id, updates) {
        const idx = this.data.equipment.findIndex(e => e.id === id);
        if (idx !== -1) { Object.assign(this.data.equipment[idx], updates); this.save(); }
    },
    deleteEquipment(id) {
        this.data.equipment = this.data.equipment.filter(e => e.id !== id);
        this.save();
    },

    // Employees
    getEmployees() { return this.data.employees; },
    addEmployee(emp) { emp.id = this.genId(); this.data.employees.push(emp); this.save(); return emp; },
    updateEmployee(id, updates) {
        const idx = this.data.employees.findIndex(e => e.id === id);
        if (idx !== -1) { Object.assign(this.data.employees[idx], updates); this.save(); }
    },
    deleteEmployee(id) {
        this.data.employees = this.data.employees.filter(e => e.id !== id);
        this.save();
    },

    // Attendance
    getAttendance(date) { return this.data.attendance[date] || {}; },
    setAttendance(date, empId, status) {
        if (!this.data.attendance[date]) this.data.attendance[date] = {};
        this.data.attendance[date][empId] = status;
        this.save();
    },

    // Output
    getOutput(date) { return this.data.output[date] || []; },
    addOutput(date, entry) {
        if (!this.data.output[date]) this.data.output[date] = [];
        entry.id = this.genId();
        this.data.output[date].push(entry);
        this.save();
        return entry;
    },
    updateOutput(date, id, updates) {
        const list = this.data.output[date];
        if (list) {
            const idx = list.findIndex(e => e.id === id);
            if (idx !== -1) { Object.assign(list[idx], updates); this.save(); }
        }
    },
    deleteOutput(date, id) {
        if (this.data.output[date]) {
            this.data.output[date] = this.data.output[date].filter(e => e.id !== id);
            this.save();
        }
    },

    // Plan
    getPlanItems() { return this.data.plan.items || []; },
    addPlanItem(item) {
        if (!this.data.plan.items) this.data.plan.items = [];
        item.id = this.genId();
        this.data.plan.items.push(item);
        this.save();
        return item;
    },
    updatePlanItem(id, updates) {
        const items = this.data.plan.items || [];
        const idx = items.findIndex(e => e.id === id);
        if (idx !== -1) { Object.assign(items[idx], updates); this.save(); }
    },
    deletePlanItem(id) {
        if (this.data.plan.items) {
            this.data.plan.items = this.data.plan.items.filter(e => e.id !== id);
            this.save();
        }
    },

    getPlanFact(date) { return this.data.plan[date] || {}; },
    setPlanFact(date, itemId, fact) {
        if (!this.data.plan[date]) this.data.plan[date] = {};
        this.data.plan[date][itemId] = fact;
        this.save();
    },

    seedDemoData() {
        if (this.data.equipment.length > 0) return;

        this.data.equipment = [
            { id: 'eq1', name: 'Токарный станок ТВ-320', inventoryNo: 'ТВ-001', status: 'working', note: '' },
            { id: 'eq2', name: 'Фрезерный станок 6Р82', inventoryNo: 'ФР-002', status: 'working', note: '' },
            { id: 'eq3', name: 'Сверлильный станок 2Н135', inventoryNo: 'СВ-003', status: 'idle', note: 'Нет заготовок' },
            { id: 'eq4', name: 'Шлифовальный станок 3Б71М', inventoryNo: 'ШЛ-004', status: 'maintenance', note: 'Замена подшипника' },
            { id: 'eq5', name: 'Пресс гидравлический П6330', inventoryNo: 'ПР-005', status: 'working', note: '' },
        ];

        this.data.employees = [
            { id: 'e1', name: 'Иванов И.А.', position: 'Токарь', grade: '5 разряд' },
            { id: 'e2', name: 'Петров С.В.', position: 'Фрезеровщик', grade: '4 разряд' },
            { id: 'e3', name: 'Сидоров К.М.', position: 'Сверловщик', grade: '4 разряд' },
            { id: 'e4', name: 'Козлов Д.Н.', position: 'Шлифовщик', grade: '5 разряд' },
            { id: 'e5', name: 'Новиков А.П.', position: 'Прессовщик', grade: '3 разряд' },
            { id: 'e6', name: 'Морозов В.Г.', position: 'Токарь', grade: '6 разряд' },
        ];

        const today = formatDate(new Date());
        this.data.attendance[today] = {
            'e1': 'present', 'e2': 'present', 'e3': 'absent',
            'e4': 'present', 'e5': 'present', 'e6': 'sick',
        };

        this.data.output[today] = [
            { id: 'o1', employeeId: 'e1', product: 'Вал приводной', qty: 12, unit: 'шт', equipment: 'eq1' },
            { id: 'o2', employeeId: 'e2', product: 'Корпус редуктора', qty: 4, unit: 'шт', equipment: 'eq2' },
            { id: 'o3', employeeId: 'e4', product: 'Втулка направляющая', qty: 24, unit: 'шт', equipment: 'eq4' },
            { id: 'o4', employeeId: 'e5', product: 'Заготовка фланца', qty: 30, unit: 'шт', equipment: 'eq5' },
        ];

        this.data.plan.items = [
            { id: 'p1', name: 'Вал приводной', unit: 'шт', planQty: 20 },
            { id: 'p2', name: 'Корпус редуктора', unit: 'шт', planQty: 8 },
            { id: 'p3', name: 'Втулка направляющая', unit: 'шт', planQty: 50 },
            { id: 'p4', name: 'Заготовка фланца', unit: 'шт', planQty: 40 },
            { id: 'p5', name: 'Шестерня Z=32', unit: 'шт', planQty: 15 },
        ];

        this.data.plan[today] = {
            'p1': 12, 'p2': 4, 'p3': 24, 'p4': 30, 'p5': 0,
        };

        this.save();
    },
};
