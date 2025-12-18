const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/gemini_dashboard',
});

async function fix() {
  try {
    console.log('Fixing database schema...');
    
    // Drop tables that depend on the user table to ensure FKs are updated
    // "users" (plural) was the old table, "user" (singular) is the new one.
    // mcp_configs and meetings might be referencing "users".
    
    console.log('Dropping mcp_configs...');
    await pool.query('DROP TABLE IF EXISTS mcp_configs');
    
    console.log('Dropping meetings...');
    await pool.query('DROP TABLE IF EXISTS meetings');
    
    // We should also probably check if we need to migrate data, but for now assuming dev environment reset is fine.
    // Attempt to drop the old "users" table if it exists, to avoid confusion.
    // Use CASCADE to drop any other constraints linking to it.
    console.log('Dropping old users table if exists...');
    await pool.query('DROP TABLE IF EXISTS users CASCADE');

    console.log('Schema cleanup complete. Please run init-db.js to recreate tables.');
  } catch (err) {
    console.error('Error fixing database:', err);
  } finally {
    await pool.end();
  }
}

fix();
