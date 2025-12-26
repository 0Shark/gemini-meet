import { NextResponse } from 'next/server';
import { datadog } from '@/lib/datadog';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { db } from '@/lib/drizzle';
import { meetings } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({
        headers: await headers()
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Check ownership
    const [meeting] = await db.select().from(meetings).where(
        eq(meetings.id, id)
    );

    if (!meeting || meeting.createdBy !== session.user.id) {
        return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    // Fetch from Datadog
    const logs = await datadog.fetchLogs(id);
    
    return NextResponse.json({ logs });

  } catch (error) {
    console.error('Logs error:', error);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}
