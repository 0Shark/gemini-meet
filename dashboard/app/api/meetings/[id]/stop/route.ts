import { NextResponse } from 'next/server';
import { docker } from '@/lib/docker';
import { query } from '@/lib/db';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const result = await query('SELECT container_id FROM meetings WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const containerId = result.rows[0].container_id;
    if (containerId) {
      try {
        const container = docker.getContainer(containerId);
        await container.stop();
        // Container might auto-remove if we set AutoRemove: true
      } catch (dockerErr) {
        console.warn('Container stop error (maybe already stopped):', dockerErr);
      }
    }

    await query("UPDATE meetings SET status = 'stopped' WHERE id = $1", [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Stop error:', error);
    return NextResponse.json({ error: 'Failed to stop agent' }, { status: 500 });
  }
}
