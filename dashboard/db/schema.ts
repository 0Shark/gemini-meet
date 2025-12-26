import { pgTable, text, timestamp, boolean, uuid, jsonb, index } from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: boolean('emailVerified'),
  image: text('image'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt'),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').references(() => user.id),
  token: text('token').unique(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId'),
  providerId: text('providerId'),
  userId: text('userId').references(() => user.id),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier'),
  value: text('value'),
  expiresAt: timestamp('expiresAt'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});

export const meetings = pgTable('meetings', {
  id: uuid('id').primaryKey(),
  url: text('url').notNull(),
  status: text('status').notNull(),
  containerId: text('container_id'),
  config: jsonb('config'),
  createdBy: text('created_by').references(() => user.id),
  createdAt: timestamp('created_at').defaultNow(),
  endedAt: timestamp('ended_at'),
});

export const mcpConfigs = pgTable('mcp_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  command: text('command').notNull(),
  args: jsonb('args').default([]),
  env: jsonb('env').default({}),
  isDefault: boolean('is_default').default(false),
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => {
  return {
    userIdIdx: index('idx_mcp_configs_user_id').on(table.userId),
  };
});
