const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/gemini_dashboard',
});

async function migrate() {
  try {
    console.log('Migrating database...');
    
    // Add summary and transcript columns to meetings table
    await pool.query(`
      ALTER TABLE meetings 
      ADD COLUMN IF NOT EXISTS summary TEXT,
      ADD COLUMN IF NOT EXISTS transcript TEXT;
    `);

    console.log('Database migration complete');
  } catch (err) {
    console.error('Error migrating database:', err);
  } finally {
    await pool.end();
  }
}

migrate();
