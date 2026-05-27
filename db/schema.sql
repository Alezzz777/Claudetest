CREATE TABLE IF NOT EXISTS equipment (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    inventory_no VARCHAR(100) DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'working'
        CHECK (status IN ('working', 'idle', 'maintenance', 'broken')),
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    position VARCHAR(255) DEFAULT '',
    grade VARCHAR(100) DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'absent'
        CHECK (status IN ('present', 'absent', 'sick', 'vacation')),
    UNIQUE (employee_id, date)
);

CREATE TABLE IF NOT EXISTS output (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    equipment_id INTEGER REFERENCES equipment(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    product VARCHAR(255) NOT NULL,
    qty NUMERIC(12,2) NOT NULL DEFAULT 0,
    unit VARCHAR(20) NOT NULL DEFAULT 'шт',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(20) NOT NULL DEFAULT 'шт',
    plan_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_fact (
    id SERIAL PRIMARY KEY,
    plan_item_id INTEGER NOT NULL REFERENCES plan_items(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    fact_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
    UNIQUE (plan_item_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_output_date ON output(date);
CREATE INDEX IF NOT EXISTS idx_plan_fact_date ON plan_fact(date);
