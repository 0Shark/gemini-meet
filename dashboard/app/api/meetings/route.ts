import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { docker } from '@/lib/docker';
import { query } from '@/lib/db';
import { AVAILABLE_TOOLS } from '@/lib/tools';
import fs from 'fs/promises';
import path from 'path';

export async function GET() {
  try {
    const result = await query('SELECT * FROM meetings ORDER BY created_at DESC');
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch meetings' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url, toolIds } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const meetingId = uuidv4();
    const userId = 'user-1'; // Mock user

    // 1. Prepare Config
    const mcpServers: Record<string, any> = {};
    if (toolIds && Array.isArray(toolIds)) {
      toolIds.forEach((id: string) => {
        const tool = AVAILABLE_TOOLS.find((t) => t.id === id);
        if (tool) {
          mcpServers[tool.id] = tool.mcpConfig;
        }
      });
    }

    const config = { mcpServers };
    
    // 2. Write Config File
    const configDir = `/tmp/gemini_meetings/${meetingId}`;
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(path.join(configDir, 'config_meet.json'), JSON.stringify(config, null, 2));

    // 3. Spawn Docker Container
    // Args: --client --env-file .env --tts elevenlabs --tts-arg voice_id=UhJprPJ8HnBN44Xbkjim --config config_meet.json <meeting_link>
    const args = [
      '--client',
      '--env-file', '.env',
      '--tts', 'elevenlabs',
      '--tts-arg', 'voice_id=UhJprPJ8HnBN44Xbkjim',
      '--config', 'config_meet.json',
      url
    ];

    const containerConfig = {
      Image: 'ghcr.io/gemini-meet/gemini-meet:latest',
      Cmd: args,
      Env: [
        `GEMINI_MEET_NAME=GeminiAgent`
      ],
      HostConfig: {
        Binds: [
          '/workspaces/gemini-meet/.env:/app/.env',
          `${configDir}/config_meet.json:/app/config_meet.json`
        ],
        AutoRemove: true // Remove container when it exits? Maybe false to see logs.
      }
    };

    // Note: ensure image is pulled. dockerode createContainer doesn't pull automatically usually.
    // For now assuming it exists or handled.
    
    // Creating container
    const container = await docker.createContainer(containerConfig);
    await container.start();

    // 4. Save to DB
    await query(
      'INSERT INTO meetings (id, url, status, container_id, config, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
      [meetingId, url, 'running', container.id, JSON.stringify(config), userId]
    );

    return NextResponse.json({ success: true, meetingId });
  } catch (error) {
    console.error('Spawn error:', error);
    return NextResponse.json({ error: 'Failed to spawn agent' }, { status: 500 });
  }
}
