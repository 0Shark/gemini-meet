const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://user:password@db:5432/gemini_dashboard',
});

async function migrate() {
  try {
    console.log('Adding ended_at column to meetings table...');
    await pool.query('ALTER TABLE meetings ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP');
    console.log('Column added successfully');
  } catch (err) {
    console.error('Error adding column:', err);
  } finally {
    await pool.end();
  }
}

migrate();
