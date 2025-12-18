import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

// GET all MCP configs for the current user
export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const result = await query(
      'SELECT * FROM mcp_configs WHERE user_id = $1 ORDER BY name ASC',
      [userId]
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch MCP configs' }, { status: 500 });
  }
}

// POST create a new MCP config
export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await req.json();
    const { name, description, command, args, env, is_default, enabled } = body;

    if (!name || !command) {
      return NextResponse.json({ error: 'Name and command are required' }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO mcp_configs (user_id, name, description, command, args, env, is_default, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        userId,
        name,
        description || null,
        command,
        JSON.stringify(args || []),
        JSON.stringify(env || {}),
        is_default || false,
        enabled !== false
      ]
    );

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to create MCP config' }, { status: 500 });
  }
}
