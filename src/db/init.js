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
        role VARCHAR(20) NOT NULL CHECK (role IN ('sender', 'receiver', 'dispatcher', 'transporter')),
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS transport_requests (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL REFERENCES users(id),
        receiver_id INTEGER REFERENCES users(id),
        dispatcher_id INTEGER REFERENCES users(id),
        transporter_id INTEGER REFERENCES users(id),
        cargo_description TEXT NOT NULL,
        weight DECIMAL(10,2),
        pickup_location VARCHAR(255) NOT NULL,
        delivery_location VARCHAR(255) NOT NULL,
        priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
        status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'assigned', 'in_progress', 'delivered', 'confirmed', 'rejected')),
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
      CREATE INDEX IF NOT EXISTS idx_requests_transporter ON transport_requests(transporter_id);
      CREATE INDEX IF NOT EXISTS idx_history_request ON status_history(request_id);
    `);

    const existing = await client.query("SELECT id FROM users WHERE username = 'dispatcher1'");
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash('password123', 10);
      await client.query(`
        INSERT INTO users (username, password_hash, full_name, role, phone) VALUES
        ('dispatcher1', $1, 'Иванов Иван Иванович', 'dispatcher', '+7-900-111-1111'),
        ('sender1', $1, 'Петров Петр Петрович', 'sender', '+7-900-222-2222'),
        ('receiver1', $1, 'Сидоров Сидор Сидорович', 'receiver', '+7-900-333-3333'),
        ('transporter1', $1, 'Козлов Алексей Михайлович', 'transporter', '+7-900-444-4444'),
        ('transporter2', $1, 'Волков Дмитрий Сергеевич', 'transporter', '+7-900-555-5555')
      `, [hash]);
      console.log('Demo users created (password: password123)');
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
