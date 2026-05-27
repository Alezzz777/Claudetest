const Store = {
    _cache: {
        equipment: null,
        employees: null,
        planItems: null,
    },

    async _fetch(url, opts) {
        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            ...opts,
        });
        if (res.status === 204) return null;
        return res.json();
    },

    // Equipment
    async getEquipment() {
        if (!this._cache.equipment) {
            this._cache.equipment = await this._fetch('/api/equipment');
        }
        return this._cache.equipment;
    },
    async addEquipment(item) {
        const result = await this._fetch('/api/equipment', { method: 'POST', body: JSON.stringify(item) });
        this._cache.equipment = null;
        return result;
    },
    async updateEquipment(id, updates) {
        await this._fetch(`/api/equipment/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
        this._cache.equipment = null;
    },
    async deleteEquipment(id) {
        await this._fetch(`/api/equipment/${id}`, { method: 'DELETE' });
        this._cache.equipment = null;
    },

    // Employees
    async getEmployees() {
        if (!this._cache.employees) {
            this._cache.employees = await this._fetch('/api/employees');
        }
        return this._cache.employees;
    },
    async addEmployee(emp) {
        const result = await this._fetch('/api/employees', { method: 'POST', body: JSON.stringify(emp) });
        this._cache.employees = null;
        return result;
    },
    async updateEmployee(id, updates) {
        await this._fetch(`/api/employees/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
        this._cache.employees = null;
    },
    async deleteEmployee(id) {
        await this._fetch(`/api/employees/${id}`, { method: 'DELETE' });
        this._cache.employees = null;
    },

    // Attendance
    async getAttendance(date) {
        return this._fetch(`/api/attendance/${date}`);
    },
    async setAttendance(date, empId, status) {
        await this._fetch(`/api/attendance/${date}/${empId}`, { method: 'PUT', body: JSON.stringify({ status }) });
    },

    // Output
    async getOutput(date) {
        return this._fetch(`/api/output/${date}`);
    },
    async addOutput(date, entry) {
        const result = await this._fetch(`/api/output/${date}`, { method: 'POST', body: JSON.stringify(entry) });
        return result;
    },
    async updateOutput(date, id, updates) {
        await this._fetch(`/api/output/${date}/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
    },
    async deleteOutput(date, id) {
        await this._fetch(`/api/output/${date}/${id}`, { method: 'DELETE' });
    },

    // Plan
    async getPlanItems() {
        if (!this._cache.planItems) {
            this._cache.planItems = await this._fetch('/api/plan/items');
        }
        return this._cache.planItems;
    },
    async addPlanItem(item) {
        const result = await this._fetch('/api/plan/items', { method: 'POST', body: JSON.stringify(item) });
        this._cache.planItems = null;
        return result;
    },
    async updatePlanItem(id, updates) {
        await this._fetch(`/api/plan/items/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
        this._cache.planItems = null;
    },
    async deletePlanItem(id) {
        await this._fetch(`/api/plan/items/${id}`, { method: 'DELETE' });
        this._cache.planItems = null;
    },
    async getPlanFact(date) {
        return this._fetch(`/api/plan/fact/${date}`);
    },
    async setPlanFact(date, itemId, fact) {
        await this._fetch(`/api/plan/fact/${date}/${itemId}`, { method: 'PUT', body: JSON.stringify({ factQty: fact }) });
    },

    invalidateAll() {
        this._cache.equipment = null;
        this._cache.employees = null;
        this._cache.planItems = null;
    },
};
