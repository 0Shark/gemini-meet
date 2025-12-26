const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/gemini_dashboard',
});

const schema = `
  -- Create tables (using "user" singular as required by better-auth default)
  CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE,
    "emailVerified" BOOLEAN,
    image TEXT,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    "expiresAt" TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT REFERENCES "user"(id),
    token TEXT UNIQUE,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS account (
    id TEXT PRIMARY KEY,
    "accountId" TEXT,
    "providerId" TEXT,
    "userId" TEXT REFERENCES "user"(id),
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP,
    "refreshTokenExpiresAt" TIMESTAMP,
    scope TEXT,
    password TEXT,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS verification (
    id TEXT PRIMARY KEY,
    identifier TEXT,
    value TEXT,
    "expiresAt" TIMESTAMP,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS meetings (
    id UUID PRIMARY KEY,
    url TEXT NOT NULL,
    status TEXT NOT NULL,
    container_id TEXT,
    config JSONB,
    created_by TEXT REFERENCES "user"(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP
  );

  -- MCP server configurations (user's configured MCP servers with their API keys)
  CREATE TABLE IF NOT EXISTS mcp_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    command TEXT NOT NULL,
    args JSONB DEFAULT '[]',
    env JSONB DEFAULT '{}',
    is_default BOOLEAN DEFAULT false,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- Create index for faster lookups
  CREATE INDEX IF NOT EXISTS idx_mcp_configs_user_id ON mcp_configs(user_id);
`;

async function init() {
  try {
    console.log('Initializing database...');
    await pool.query(schema);
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    await pool.end();
  }
}

init();
