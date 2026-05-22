require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../db');

(async () => {
    try {
        const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
        await db.query(schema);
        console.log('Schema applied.');
        process.exit(0);
    } catch (err) {
        console.error('Failed to init db:', err.message);
        process.exit(1);
    }
})();
