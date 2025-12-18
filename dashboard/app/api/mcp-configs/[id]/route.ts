import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// GET a single MCP config
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const userId = 'user-1'; // TODO: Get from auth session
    const result = await query(
      'SELECT * FROM mcp_configs WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'MCP config not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch MCP config' }, { status: 500 });
  }
}

// PUT update an MCP config
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const userId = 'user-1'; // TODO: Get from auth session
    const body = await req.json();
    const { name, description, command, args, env, is_default, enabled } = body;

    const result = await query(
      `UPDATE mcp_configs 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           command = COALESCE($3, command),
           args = COALESCE($4, args),
           env = COALESCE($5, env),
           is_default = COALESCE($6, is_default),
           enabled = COALESCE($7, enabled),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND user_id = $9
       RETURNING *`,
      [
        name || null,
        description,
        command || null,
        args ? JSON.stringify(args) : null,
        env ? JSON.stringify(env) : null,
        is_default,
        enabled,
        id,
        userId
      ]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'MCP config not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to update MCP config' }, { status: 500 });
  }
}

// DELETE an MCP config
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const userId = 'user-1'; // TODO: Get from auth session
    const result = await query(
      'DELETE FROM mcp_configs WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'MCP config not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to delete MCP config' }, { status: 500 });
  }
}
