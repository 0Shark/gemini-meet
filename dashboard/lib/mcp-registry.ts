export interface OfficialMcpServer {
  id: string;
  name: string;
  description: string;
  packageName: string;
  command: string;
  args: string[];
  envSchema?: Record<string, {
    description: string;
    required: boolean;
  }>;
}

export const OFFICIAL_MCP_SERVERS: OfficialMcpServer[] = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Read and write files on the local filesystem',
    packageName: '@modelcontextprotocol/server-filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/dir'],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Interact with GitHub repositories, issues, and pull requests',
    packageName: '@modelcontextprotocol/server-github',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    envSchema: {
      GITHUB_PERSONAL_ACCESS_TOKEN: {
        description: 'GitHub Personal Access Token',
        required: true,
      },
    },
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Send messages and interact with Slack workspaces',
    packageName: '@modelcontextprotocol/server-slack',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    envSchema: {
      SLACK_BOT_TOKEN: {
        description: 'Slack Bot Token',
        required: true,
      },
      SLACK_TEAM_ID: {
        description: 'Slack Team ID',
        required: true,
      },
    },
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Access and manage files in Google Drive',
    packageName: '@modelcontextprotocol/server-gdrive',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gdrive'],
    envSchema: {
      GDRIVE_CREDENTIALS: {
        description: 'Google Drive OAuth credentials JSON',
        required: true,
      },
    },
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Query and manage PostgreSQL databases',
    packageName: '@modelcontextprotocol/server-postgres',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    envSchema: {
      POSTGRES_CONNECTION_STRING: {
        description: 'PostgreSQL connection string',
        required: true,
      },
    },
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Store and retrieve information in a knowledge graph',
    packageName: '@modelcontextprotocol/server-memory',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Search the web using Brave Search API',
    packageName: '@modelcontextprotocol/server-brave-search',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    envSchema: {
      BRAVE_API_KEY: {
        description: 'Brave Search API Key',
        required: true,
      },
    },
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: 'Browser automation and web scraping',
    packageName: '@modelcontextprotocol/server-puppeteer',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    description: 'Advanced reasoning and problem decomposition',
    packageName: '@modelcontextprotocol/server-sequential-thinking',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'Query and manage SQLite databases',
    packageName: '@modelcontextprotocol/server-sqlite',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite'],
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Manage issues and projects in Linear',
    packageName: '@modelcontextprotocol/server-linear',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-linear'],
    envSchema: {
      LINEAR_API_KEY: {
        description: 'Linear API Key',
        required: true,
      },
    },
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'Interact with GitLab repositories and issues',
    packageName: '@modelcontextprotocol/server-gitlab',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gitlab'],
    envSchema: {
      GITLAB_PERSONAL_ACCESS_TOKEN: {
        description: 'GitLab Personal Access Token',
        required: true,
      },
    },
  },
  {
    id: 'sentry',
    name: 'Sentry',
    description: 'Retrieve error reports from Sentry',
    packageName: '@modelcontextprotocol/server-sentry',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sentry'],
    envSchema: {
      SENTRY_AUTH_TOKEN: {
        description: 'Sentry Auth Token',
        required: true,
      },
    },
  },
  {
    id: 'aws',
    name: 'AWS',
    description: 'Manage AWS resources and services',
    packageName: '@modelcontextprotocol/server-aws',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-aws'],
  },
  {
    id: 'azure',
    name: 'Azure',
    description: 'Manage Azure resources',
    packageName: '@modelcontextprotocol/server-azure',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-azure'],
  },
  {
    id: 'docker',
    name: 'Docker',
    description: 'Manage Docker containers and images',
    packageName: '@modelcontextprotocol/server-docker',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-docker'],
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes',
    description: 'Manage Kubernetes clusters',
    packageName: '@modelcontextprotocol/server-k8s',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-k8s'],
  },
  {
    id: 'redis',
    name: 'Redis',
    description: 'Interact with Redis databases',
    packageName: '@modelcontextprotocol/server-redis',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-redis'],
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    description: 'Query MongoDB databases',
    packageName: '@modelcontextprotocol/server-mongodb',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-mongodb'],
  },
  {
    id: 'mysql',
    name: 'MySQL',
    description: 'Query MySQL databases',
    packageName: '@modelcontextprotocol/server-mysql',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-mysql'],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Access Stripe payments and subscriptions',
    packageName: '@modelcontextprotocol/server-stripe',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-stripe'],
  },
  {
    id: 'twilio',
    name: 'Twilio',
    description: 'Send SMS and manage calls via Twilio',
    packageName: '@modelcontextprotocol/server-twilio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-twilio'],
  },
  {
    id: 'sendgrid',
    name: 'SendGrid',
    description: 'Send emails via SendGrid',
    packageName: '@modelcontextprotocol/server-sendgrid',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sendgrid'],
  },
  {
    id: 'figma',
    name: 'Figma',
    description: 'Access Figma designs and comments',
    packageName: '@modelcontextprotocol/server-figma',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-figma'],
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Read and write Notion pages',
    packageName: '@modelcontextprotocol/server-notion',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-notion'],
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Interact with Discord servers',
    packageName: '@modelcontextprotocol/server-discord',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-discord'],
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Send messages via Telegram bot',
    packageName: '@modelcontextprotocol/server-telegram',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-telegram'],
  },
  {
    id: 'zoom',
    name: 'Zoom',
    description: 'Manage Zoom meetings',
    packageName: '@modelcontextprotocol/server-zoom',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-zoom'],
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Manage calendar events',
    packageName: '@modelcontextprotocol/server-gcalendar',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gcalendar'],
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    description: 'Access Salesforce CRM data',
    packageName: '@modelcontextprotocol/server-salesforce',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-salesforce'],
  },
  {
    id: 'zendesk',
    name: 'Zendesk',
    description: 'Manage support tickets',
    packageName: '@modelcontextprotocol/server-zendesk',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-zendesk'],
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Manage Jira issues',
    packageName: '@modelcontextprotocol/server-jira',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-jira'],
  },
];
