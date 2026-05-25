const pool = require('./pool');
const bcrypt = require('bcryptjs');

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('client', 'executor', 'dispatcher')),
        phone VARCHAR(20),
        avatar TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address VARCHAR(500),
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS transport_requests (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL REFERENCES users(id),
        receiver_id INTEGER REFERENCES users(id),
        executor_id INTEGER REFERENCES users(id),
        dispatcher_id INTEGER REFERENCES users(id),
        cargo_description TEXT NOT NULL,
        weight DECIMAL(10,2),
        pickup_location VARCHAR(255) NOT NULL,
        delivery_location VARCHAR(255) NOT NULL,
        priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
        status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'assigned', 'in_progress', 'delivered', 'confirmed', 'rejected')),
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS status_history (
        id SERIAL PRIMARY KEY,
        request_id INTEGER NOT NULL REFERENCES transport_requests(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL,
        changed_by INTEGER NOT NULL REFERENCES users(id),
        comment TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_requests_status ON transport_requests(status);
      CREATE INDEX IF NOT EXISTS idx_requests_sender ON transport_requests(sender_id);
      CREATE INDEX IF NOT EXISTS idx_requests_receiver ON transport_requests(receiver_id);
      CREATE INDEX IF NOT EXISTS idx_requests_executor ON transport_requests(executor_id);
      CREATE INDEX IF NOT EXISTS idx_history_request ON status_history(request_id);
    `);

    const existing = await client.query("SELECT id FROM users WHERE username = 'dispatcher1'");
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash('password123', 10);
      await client.query(`
        INSERT INTO users (username, password_hash, full_name, role, phone) VALUES
        ('dispatcher1', $1, 'Иванов Иван Иванович', 'dispatcher', '+7-900-111-1111'),
        ('client1', $1, 'Петров Петр Петрович', 'client', '+7-900-222-2222'),
        ('client2', $1, 'Сидоров Сидор Сидорович', 'client', '+7-900-333-3333'),
        ('executor1', $1, 'Козлов Алексей Михайлович', 'executor', '+7-900-444-4444'),
        ('executor2', $1, 'Волков Дмитрий Сергеевич', 'executor', '+7-900-555-5555')
      `, [hash]);

      const dispatcherRow = await client.query("SELECT id FROM users WHERE username = 'dispatcher1'");
      const dispId = dispatcherRow.rows[0].id;
      await client.query(`
        INSERT INTO locations (name, address, created_by) VALUES
        ('Склад А', 'Корпус 1, этаж 1', $1),
        ('Склад Б', 'Корпус 2, этаж 1', $1),
        ('Цех №1', 'Корпус 3, этаж 2', $1),
        ('Цех №2', 'Корпус 3, этаж 3', $1),
        ('Погрузочная зона', 'Территория, ворота 5', $1),
        ('Офис', 'Корпус 1, этаж 3', $1)
      `, [dispId]);

      console.log('Demo users and locations created (password: password123)');
    }

    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

initDB();
