import { NextResponse } from 'next/server';
import { query } from '@/lib/db'; // Using raw query as in original file
import { datadog } from '@/lib/datadog';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { db } from '@/lib/drizzle';
import { meetings } from '@/db/schema';
import { eq } from 'drizzle-orm';

// New GET Endpoint for fetching transcript (from DB or Datadog)
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

    // Always reconstruct from Datadog (User Preference)
    const transcript = await datadog.getTranscript(id);
    return NextResponse.json({ transcript });

  } catch (error) {
    console.error('Transcript fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch transcript' }, { status: 500 });
  }
}

// Existing POST Endpoint (Legacy/Agent Reporting)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  // Note: This endpoint is called by the Agent running in Docker.
  
  try {
    const body = await req.json();
    const { transcript, summary } = body;

    if (typeof transcript !== 'string') {
        return NextResponse.json({ error: 'Invalid transcript' }, { status: 400 });
    }

    // Update the meeting with summary only (transcript handled by Datadog)
    // Also mark as stopped if not already (though the agent is likely stopping)
    await query(
      "UPDATE meetings SET summary = $1, status = 'stopped' WHERE id = $2",
      [summary || null, id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Transcript upload error:', error);
    return NextResponse.json({ error: 'Failed to save transcript' }, { status: 500 });
  }
}
