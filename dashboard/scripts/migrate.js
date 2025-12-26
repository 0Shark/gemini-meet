const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { Pool } = require('pg');

async function main() {
  console.log('Running migrations...');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/gemini_dashboard',
  });

  const db = drizzle(pool);

  try {
    // Note: migrationsFolder path is relative to where you run the script
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('Migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error running migrations:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
