import { NextResponse } from 'next/server';
import { db } from '@/lib/drizzle';
import { mcpConfigs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

// GET a single MCP config
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const result = await db.select()
      .from(mcpConfigs)
      .where(and(eq(mcpConfigs.id, id), eq(mcpConfigs.userId, userId)));

    if (result.length === 0) {
      return NextResponse.json({ error: 'MCP config not found' }, { status: 404 });
    }

    return NextResponse.json(result[0]);
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
    const session = await auth.api.getSession({
      headers: await headers()
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await req.json();
    const { name, description, command, args, env, is_default, enabled } = body;

    const result = await db.update(mcpConfigs)
      .set({
        name: name ?? undefined,
        description: description ?? undefined,
        command: command ?? undefined,
        args: args ?? undefined,
        env: env ?? undefined,
        isDefault: is_default ?? undefined,
        enabled: enabled ?? undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(mcpConfigs.id, id), eq(mcpConfigs.userId, userId)))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: 'MCP config not found' }, { status: 404 });
    }

    return NextResponse.json(result[0]);
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
    const session = await auth.api.getSession({
      headers: await headers()
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const result = await db.delete(mcpConfigs)
      .where(and(eq(mcpConfigs.id, id), eq(mcpConfigs.userId, userId)))
      .returning({ id: mcpConfigs.id });

    if (result.length === 0) {
      return NextResponse.json({ error: 'MCP config not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to delete MCP config' }, { status: 500 });
  }
}
