import { NextResponse } from 'next/server';
import { db } from '@/lib/drizzle';
import { mcpConfigs } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
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
    const result = await db.select()
      .from(mcpConfigs)
      .where(eq(mcpConfigs.userId, userId))
      .orderBy(asc(mcpConfigs.name));
      
    return NextResponse.json(result);
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

    const result = await db.insert(mcpConfigs).values({
      userId,
      name,
      description: description || null,
      command,
      args: args || [],
      env: env || {},
      isDefault: is_default || false,
      enabled: enabled !== false,
    }).returning();

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to create MCP config' }, { status: 500 });
  }
}
