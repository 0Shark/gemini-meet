import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { docker } from '@/lib/docker';
import { db } from '@/lib/drizzle';
import { meetings, mcpConfigs } from '@/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
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
    const runningMeetings = await db.select().from(meetings).where(
      and(eq(meetings.createdBy, userId), eq(meetings.status, 'running'))
    );

    for (const meeting of runningMeetings) {
      let isRunning = false;
      let exitCode = 0;
      
      if (meeting.containerId) {
        try {
          const container = docker.getContainer(meeting.containerId);
          const data = await container.inspect();
          isRunning = data.State.Running;
          exitCode = data.State.ExitCode;
        } catch (e) {
          // Container likely gone (AutoRemove)
          isRunning = false;
        }
      }

      if (!isRunning) {
        // Determine final status
        let status = 'stopped';
        if (exitCode === 0) status = 'completed';
        else status = 'failed';
        
        console.log(`Meeting ${meeting.id} finished with status ${status} (ExitCode: ${exitCode})`);
        
        await db.update(meetings)
          .set({ status, endedAt: new Date() })
          .where(eq(meetings.id, meeting.id));
      }
    }

    // Return all meetings
    const result = await db.select().from(meetings)
      .where(eq(meetings.createdBy, userId))
      .orderBy(desc(meetings.createdAt));
      
    return NextResponse.json(result);
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
    const { url, mcpConfigIds, sttProvider, ttsProvider, ttsVoice, language } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const meetingId = uuidv4();
    const userId = session.user.id;

    // 1. Fetch MCP configs from database
    const mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }> = {};
    
    if (mcpConfigIds && Array.isArray(mcpConfigIds) && mcpConfigIds.length > 0) {
      // Ensure we only fetch configs belonging to the user
      const result = await db.select().from(mcpConfigs).where(
        and(inArray(mcpConfigs.id, mcpConfigIds), eq(mcpConfigs.userId, userId))
      );

      for (const config of result) {
        // Only include configs that have all required env vars filled
        // Drizzle jsonb is already typed as unknown, so we might need casting or checks
        const env = (config.env as Record<string, string>) || {};
        const args = (config.args as string[]) || [];
        
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
    // We mount the .env file to /app/agent.env to avoid 'ddtrace' confusing '.env' with a python module
    const envFileName = 'agent.env'; 
    
    // Use gemini_meet.main (Server/Core) with --client flag to run in-process MCP server + client
    // This allows the agent to access local tools (browser, etc.) without an external server.
    const args = [
      '/app/.venv/bin/python', '-m', 'gemini_meet.main',
      '--client',
      '--env-file', envFileName,
      '--tts', ttsProvider || 'elevenlabs',
      '--stt', sttProvider || 'google',
      '--config', 'config_meet.json', // gemini_meet.main uses --config, not --mcp-config
    ];

    if (language) {
        args.push('--language', language);
    }

    if (ttsVoice) {
        if (ttsProvider === 'google') {
           args.push('--tts-arg', `voice_name=${ttsVoice}`);
        } else {
           args.push('--tts-arg', `voice_id=${ttsVoice}`);
        }
    }

    // URL must be last
    args.push(url);

    const configFilePath = path.join(configDir, 'config_meet.json');
    const postMeetingScriptPath = path.join(process.cwd(), 'scripts', 'post-meeting.py');
    
    // Mount local source code for development (overrides installed package)
    const geminiMeetSourcePath = path.join(projectRoot, 'gemini_meet');
    const geminiMeetClientSourcePath = path.join(projectRoot, 'client', 'gemini_meet_client');

    const binds = [
      `${toDockerPath(envFilePath)}:/app/${envFileName}`,
      `${toDockerPath(configFilePath)}:/app/config_meet.json`,
      `${toDockerPath(dataDir)}:/app/data`,
      `${toDockerPath(postMeetingScriptPath)}:/app/post-meeting.py`,
      // Mount local source to override installed packages for development
      `${toDockerPath(geminiMeetSourcePath)}:/app/.venv/lib/python3.12/site-packages/gemini_meet`,
      `${toDockerPath(geminiMeetClientSourcePath)}:/app/.venv/lib/python3.12/site-packages/gemini_meet_client`
    ];

    try {
      await fs.access(credentialsFilePath);
      binds.push(`${toDockerPath(credentialsFilePath)}:/app/vertex_credentials.json`);
    } catch {
      console.log('vertex_credentials.json not found, skipping mount');
    }

    const containerConfig = {
      Image: 'gemini-meet-with-node:latest',
      Tty: true,
      Cmd: args,
      Env: [
        `GEMINI_MEET_NAME=GeminiAgent`,
        `MEETING_ID=${meetingId}`,
        `DD_TAGS=meeting_id:${meetingId}`, // Tag for Datadog
        `DD_SERVICE=gemini-meet-agent`, // Explicitly set service to avoid inference crash
        `DASHBOARD_URL=http://host.docker.internal:3000`, // Assuming default Next.js port
        // Pass essential Datadog vars for run-agent.sh startup and early python init
        `DD_API_KEY=${process.env.DD_API_KEY || ''}`,
        `DD_SITE=${process.env.DD_SITE || 'datadoghq.com'}`,
        `DD_ENV=${process.env.DD_ENV || 'production'}`,
        // Pass Google Credentials path if set, so vertexai init works
        `GOOGLE_APPLICATION_CREDENTIALS=/app/vertex_credentials.json` 
      ],
      HostConfig: {
        Binds: binds,
        AutoRemove: false // Keep containers for debugging
      }
    };

    const container = await docker.createContainer(containerConfig);
    await container.start();

    // 4. Save to DB
    await db.insert(meetings).values({
      id: meetingId,
      url,
      status: 'running',
      containerId: container.id,
      config: config,
      createdBy: userId,
    });

    return NextResponse.json({ success: true, meetingId });
  } catch (error) {
    console.error('Spawn error:', error);
    return NextResponse.json({ error: 'Failed to spawn agent' }, { status: 500 });
  }
}
