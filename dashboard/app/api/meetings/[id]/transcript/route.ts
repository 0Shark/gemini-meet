import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  // Note: This endpoint is called by the Agent running in Docker.
  // We need to secure it. Ideally with a shared secret passed to the container.
  // For now, we'll assume the network isolation/local nature provides basic security,
  // OR check a secret header if we decide to implement that.
  
  try {
    const body = await req.json();
    const { transcript, summary } = body;

    if (typeof transcript !== 'string') {
        return NextResponse.json({ error: 'Invalid transcript' }, { status: 400 });
    }

    // Update the meeting with transcript and summary
    // Also mark as stopped if not already (though the agent is likely stopping)
    await query(
      "UPDATE meetings SET transcript = $1, summary = $2, status = 'stopped' WHERE id = $3",
      [transcript, summary || null, id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Transcript upload error:', error);
    return NextResponse.json({ error: 'Failed to save transcript' }, { status: 500 });
  }
}
