-- Shop floor piece-by-piece tracking schema

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(16) NOT NULL CHECK (role IN ('worker', 'foreman', 'master')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nomenclatures (
    id SERIAL PRIMARY KEY,
    code VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operations (
    id SERIAL PRIMARY KEY,
    nomenclature_id INTEGER NOT NULL REFERENCES nomenclatures(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    UNIQUE (nomenclature_id, seq)
);

-- status: 'created' (not yet launched), 'in_progress', 'completed', 'scrapped'
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    nomenclature_id INTEGER NOT NULL REFERENCES nomenclatures(id),
    serial_number VARCHAR(64) NOT NULL,
    barcode VARCHAR(128) UNIQUE NOT NULL,
    current_operation_id INTEGER REFERENCES operations(id),
    status VARCHAR(16) NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'in_progress', 'completed', 'scrapped')),
    scrap_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (nomenclature_id, serial_number)
);

CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);

-- action: 'launch' | 'advance' | 'rollback' | 'scrap' | 'return_from_scrap' | 'complete'
CREATE TABLE IF NOT EXISTS movements (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    action VARCHAR(32) NOT NULL,
    from_operation_id INTEGER REFERENCES operations(id),
    to_operation_id INTEGER REFERENCES operations(id),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movements_item ON movements(item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS brigades (
    id SERIAL PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    foreman_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brigade_members (
    brigade_id INTEGER NOT NULL REFERENCES brigades(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (brigade_id, user_id),
    UNIQUE (user_id)  -- worker belongs to at most one brigade
);
