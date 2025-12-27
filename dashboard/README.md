# Gemini Meet Dashboard

The dashboard for managing your autonomous Gemini Meet agents.

## Features

- **Agent Management**: Start, stop, and monitor meeting agents.
- **MCP Library**: Install and configure Model Context Protocol (MCP) servers to give your agents capabilities (GitHub, Slack, Google Drive, etc.).
- **Meeting Summaries**: View summaries and transcripts of completed meetings.
- **Authentication**: Secure login with Email/Password and Google OAuth.

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Docker (for running meeting agents)
- Google OAuth credentials (optional, for Google Sign-In)

### Docker Setup

The dashboard spawns meeting agents in Docker containers. You need to build the agent Docker image first:

```bash
# 1. Build the base gemini-meet image (from project root)
docker build -f docker/Dockerfile -t ghcr.io/gemini-meet:latest .

# 2. Build the agent image (from dashboard directory)
cd dashboard
docker build -f Dockerfile.agent -t gemini-meet-with-node:latest .
```

> **Note:** The agent image must be built from the `dashboard/` directory because it needs access to files in `dashboard/scripts/`.

### Environment Setup

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in the required environment variables:

- `DATABASE_URL`: Connection string for your PostgreSQL database
- `BETTER_AUTH_SECRET`: A random string for session security
- `BETTER_AUTH_URL`: The URL of your dashboard (e.g., http://localhost:3000)
- `GOOGLE_CLIENT_ID`: (Optional) Google OAuth Client ID
- `GOOGLE_CLIENT_SECRET`: (Optional) Google OAuth Client Secret

### Installation

```bash
npm install
```

### Database Initialization

Initialize the database schema:

```bash
npm run init-db
```

### Running the Dashboard

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Project Structure

- `app/`: Next.js App Router pages and API routes
- `components/`: React components (UI, dashboard, dialogs)
- `lib/`: Utility functions, database connection, auth configuration
- `scripts/`: Helper scripts (DB initialization, agent runner, post-meeting summary)

## Agent Configuration

When spawning a meeting agent, you can configure:

- **STT Provider**: `whisper` (local), `google` (Gemini), or `deepgram`
- **TTS Provider**: `kokoro` (local), `google` (Gemini), `elevenlabs`, or `deepgram`
- **Language**: Language code for transcription and speech (e.g., `en`, `de`, `es`)
- **MCP Servers**: Additional tools from configured MCP servers

## Production Deployment

If you want to run the dashboard in production without Dockerizing the dashboard itself (recommended to avoid "Docker-in-Docker" file path issues), follow these steps:

### 1. Prerequisites
- Linux Server (Ubuntu/Debian recommended)
- **Node.js 20+** and `npm`
- **Docker Engine** (installed on the host)
- **PostgreSQL** database (can be local or managed like Supabase/RDS)
- **PM2** process manager: `npm install -g pm2`

### 2. Prepare the Application
```bash
# Install dependencies
npm install

# Build the application
npm run build

# Initialize Database (ensure DATABASE_URL is set in .env)
npm run migrate
```

### 3. Build Agent Images
The dashboard needs the agent images to be present in the host's Docker registry.
```bash
# Build base image
docker build -f ../docker/Dockerfile -t ghcr.io/gemini-meet:latest ..

# Build agent image
docker build -f Dockerfile.agent -t gemini-meet-with-node:latest .
```

### 4. Start with PM2
Create a file named `ecosystem.config.js` in the `dashboard` directory:

```javascript
module.exports = {
  apps: [{
    name: "gemini-dashboard",
    script: "npm",
    args: "start",
    env: {
      NODE_ENV: "production",
      PORT: 3000,
      // Ensure these match your .env
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      BETTER_AUTH_URL: "http://your-domain.com",
      BETTER_AUTH_SECRET: "your-secret",
      // Important: Path where dashboard writes temp configs for agents
      TEMP_DIR: "/tmp/gemini_meet_configs" 
    }
  }]
}
```

Start the application:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Why this is better than Dockerizing the Dashboard?
When the dashboard runs on the host, it shares the same filesystem as the Docker daemon.
1. Dashboard writes config to `/tmp/config.json`.
2. Dashboard tells Docker "Mount host path `/tmp/config.json`".
3. Docker finds the file easily because paths match 1:1.

If the dashboard were inside a container, `/tmp/config.json` would only exist inside that container, and the host Docker daemon wouldn't find it without complex volume mapping.
