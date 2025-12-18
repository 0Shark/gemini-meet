import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { docker } from '@/lib/docker';
import { query } from '@/lib/db';
import { auth } from '@/lib/auth';
import fs from 'fs/promises';
import path from 'path';
import { headers } from 'next/headers';

// Removed VertexAI imports and usage - logic moved to Agent.

export async function GET() {
  try {
    const session = await auth.api.getSession({
        headers: await headers()
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Fetch active meetings to check for stopped containers
    const runningMeetings = await query(
      'SELECT * FROM meetings WHERE created_by = $1 AND status = $2',
      [userId, 'running']
    );

    for (const meeting of runningMeetings.rows) {
      let isRunning = false;
      if (meeting.container_id) {
        try {
          const container = docker.getContainer(meeting.container_id);
          const data = await container.inspect();
          isRunning = data.State.Running;
        } catch (e) {
          // Container likely gone (AutoRemove)
          isRunning = false;
        }
      }

      if (!isRunning) {
        // Meeting finished, but we do NOT process logs here anymore.
        // The Agent is responsible for sending the summary/transcript before exiting.
        // However, if the Agent crashed or failed to send, we might want to just mark it as stopped.
        // We won't try to read logs or call Vertex here.
        
        console.log(`Meeting ${meeting.id} stopped (detected by poll).`);
        
        await query(
          "UPDATE meetings SET status = 'stopped' WHERE id = $1",
          [meeting.id]
        );
      }
    }

    // Return all meetings
    const result = await query(
        'SELECT * FROM meetings WHERE created_by = $1 ORDER BY created_at DESC', 
        [userId]
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch meetings' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({
        headers: await headers()
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { url, mcpConfigIds } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const meetingId = uuidv4();
    const userId = session.user.id;

    // 1. Fetch MCP configs from database
    const mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }> = {};
    
    if (mcpConfigIds && Array.isArray(mcpConfigIds) && mcpConfigIds.length > 0) {
      const placeholders = mcpConfigIds.map((_, i) => `$${i + 1}`).join(',');
      // Ensure we only fetch configs belonging to the user
      const result = await query(
        `SELECT * FROM mcp_configs WHERE id IN (${placeholders}) AND user_id = $${mcpConfigIds.length + 1}`,
        [...mcpConfigIds, userId]
      );

      for (const config of result.rows) {
        // Only include configs that have all required env vars filled
        const env = typeof config.env === 'string' ? JSON.parse(config.env) : config.env;
        const args = typeof config.args === 'string' ? JSON.parse(config.args) : config.args;
        
        const hasEmptyEnvVars = Object.values(env).some(v => v === '');
        if (!hasEmptyEnvVars) {
          mcpServers[config.name.toLowerCase().replace(/\s+/g, '-')] = {
            command: config.command,
            args: args,
            ...(Object.keys(env).length > 0 && { env }),
          };
        }
      }
    }

    const config = { mcpServers };
    
    // 2. Write Config File - use OS temp directory for cross-platform compatibility
    const tempDir = process.env.TEMP || process.env.TMP || '/tmp';
    const configDir = path.join(tempDir, 'gemini_meetings', meetingId);
    const dataDir = path.join(configDir, 'data'); // New data dir for logs
    
    await fs.mkdir(configDir, { recursive: true });
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(configDir, 'config_meet.json'), JSON.stringify(config, null, 2));

    // Get the project root .env file path (one level up from dashboard)
    const projectRoot = path.resolve(process.cwd(), '..');
    const envFilePath = path.join(projectRoot, '.env');
    const credentialsFilePath = path.join(projectRoot, 'vertex_credentials.json');

    // Convert Windows paths to Docker-compatible paths
    const toDockerPath = (p: string) => p.replace(/\\/g, '/').replace(/^([A-Z]):/, (_, drive) => `/${drive.toLowerCase()}`);
    
    // 3. Spawn Docker Container
    const args = [
      '--env-file', '.env',
      '--tts', 'elevenlabs',
      '--tts-arg', 'voice_id=UhJprPJ8HnBN44Xbkjim',
      '--config', 'config_meet.json',
      url
    ];

    const configFilePath = path.join(configDir, 'config_meet.json');

    const binds = [
      `${toDockerPath(envFilePath)}:/app/.env`,
      `${toDockerPath(configFilePath)}:/app/config_meet.json`,
      `${toDockerPath(dataDir)}:/app/data`
    ];

    try {
      await fs.access(credentialsFilePath);
      binds.push(`${toDockerPath(credentialsFilePath)}:/app/vertex_credentials.json`);
    } catch {
      console.log('vertex_credentials.json not found, skipping mount');
    }

    const containerConfig = {
      Image: 'gemini-meet-with-node:latest',
      Cmd: args,
      Env: [
        `GEMINI_MEET_NAME=GeminiAgent`,
        `MEETING_ID=${meetingId}`,
        `DASHBOARD_URL=http://host.docker.internal:3000` // Assuming default Next.js port
      ],
      HostConfig: {
        Binds: binds,
        AutoRemove: true
      }
    };

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
