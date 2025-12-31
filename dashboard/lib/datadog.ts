
import fs from 'fs';
import path from 'path';

interface DatadogLog {
  attributes: {
    message: string;
    timestamp: string;
    status: string;
    logger?: { name: string }; // Add logger object structure
    logger_name?: string;      // Add logger_name flat field
    [key: string]: any;        // Allow any type for flexible access
  };
}

export class DatadogClient {
  private apiKey: string;
  private appKey: string;
  private site: string;

  constructor() {
    this.apiKey = process.env.DD_API_KEY || '';
    this.appKey = process.env.DD_APP_KEY || process.env.DD_APPLICATION_KEY || '';
    this.site = process.env.DD_SITE || 'datadoghq.com';

    // Fallback: Try reading .env manually if keys are missing
    if (!this.apiKey || !this.appKey) {
      try {
        // Try current directory first (shouldn't be there anymore)
        let envPath = path.resolve(process.cwd(), '.env');
        
        // If not found or access denied (unlikely if file is gone), try parent
        if (!fs.existsSync(envPath)) {
            envPath = path.resolve(process.cwd(), '../.env');
        }

        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf-8');
            const parseEnv = (key: string) => {
                const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
                return match ? match[1].trim() : '';
            };
            
            if (!this.apiKey) this.apiKey = parseEnv('DD_API_KEY');
            if (!this.appKey) this.appKey = parseEnv('DD_APP_KEY') || parseEnv('DD_APPLICATION_KEY');
            if (this.site === 'datadoghq.com') { // Only override default
                 const s = parseEnv('DD_SITE');
                 if (s) this.site = s;
            }
        }
      } catch (e) {
        console.warn('Failed to manually read .env file:', e);
      }
    }
    
    // Debug logging (Masked)
    const mask = (s: string) => s ? `${s.substring(0, 4)}...${s.substring(s.length - 4)}` : 'MISSING';
    console.log(`[DatadogClient] Initialized. Site: ${this.site}, API Key: ${mask(this.apiKey)}, App Key: ${mask(this.appKey)}`);
  }

  async fetchLogs(meetingId: string, limit = 1000): Promise<string> {
    if (!this.apiKey || !this.appKey) {
      return 'Datadog API Key or Application Key is missing in environment variables.';
    }

    const url = `https://api.${this.site}/api/v2/logs/events/search`;
    
    // Look for logs from either service (python or client) tagged with the meeting ID
    const query = `meeting_id:${meetingId}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': this.apiKey,
          'DD-APPLICATION-KEY': this.appKey,
        },
          body: JSON.stringify({
          filter: {
            query: query,
            from: 'now-7d', // Look back 7 days max (increased from 4h)
            to: 'now',
          },
          sort: 'timestamp',
          page: {
            limit: limit,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Datadog API Error:', error);
        return `Error fetching logs from Datadog: ${response.status} ${response.statusText}`;
      }

      const data = await response.json();
      
      if (!data.data || !Array.isArray(data.data)) {
          return "No logs found or invalid response from Datadog.";
      }

      // Format logs: Timestamp [Status] [Logger] Message
      return data.data
        .map((log: DatadogLog) => {
            const time = new Date(log.attributes.timestamp).toISOString();
            const status = log.attributes.status || 'INFO';
            // Try to find logger name in common attributes
            const loggerName = log.attributes['logger.name'] || log.attributes.logger_name || log.attributes.logger?.name || '';
            const msg = log.attributes.message || '';
            // If loggerName is already in message, don't prepend it
            const prefix = loggerName && !msg.startsWith(loggerName) ? `${loggerName} ` : '';
            return `${time} [${status}] ${prefix}${msg}`;
        })
        .join('\n');

    } catch (error) {
      console.error('Datadog Fetch Error:', error);
      return `Failed to connect to Datadog: ${error}`;
    }
  }

  async getMeetingDetails(meetingId: string): Promise<{ transcript: any[], toolUsage: Record<string, number> }> {
      const logs = await this.fetchLogs(meetingId, 2000); // Increased limit for stats
      
      const lines = logs.split('\n');
      const transcript: any[] = [];
      const toolUsage: Record<string, number> = {};

      lines.forEach(line => {
          // 1. Parse Log Line
          const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+\[.*?\]\s+(.*)$/);
          if (!match) return;

          const timestamp = new Date(match[1]).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
          const message = match[2];

          // 2. Extract Tool Usage
          // We look for patterns like "ToolName: arg1=..." or "ToolName: arg1='...'"
          // This captures both standard tools and MCP tools (which might be namespaced like brave-search_...)
          
          let toolCallFound = false;
          
          // Method A: Check for specific logger "gemini_meet_client.agent"
          if (message.includes('gemini_meet_client.agent')) {
              const parts = message.split('gemini_meet_client.agent');
              if (parts.length > 1) {
                  const content = parts[1].trim();
                  // Matches "tool_name: args" - supporting hyphens and underscores
                  const toolMatch = content.match(/^([a-zA-Z0-9_-]+):/);
                  
                  if (toolMatch) {
                      const toolName = toolMatch[1];
                      // Filter out known result logs
                      const isResult = /^(Sent message\.|Finished speaking\.|Joined meeting\.|Left the meeting\.|Interrupted by detected speech|BinaryContent\(|Error calling tool|\[error\]|Title:)/.test(content.substring(toolName.length + 1).trim());
                      
                      if (!isResult) {
                           toolUsage[toolName] = (toolUsage[toolName] || 0) + 1;
                           toolCallFound = true;
                      }
                  }
              }
          }
          
          // Method B: Fallback - Look for "ToolName: arg=" pattern anywhere if not found yet
          // This helps if the logger name isn't perfectly captured or if we missed it
          if (!toolCallFound) {
               // Regex: Start of line or space, followed by (ToolName): argname=
               // This is quite specific to avoid false positives in chat text
               const fallbackMatch = message.match(/(?:^|\s)([a-zA-Z0-9_-]+):\s+[a-zA-Z0-9_]+=/);
               if (fallbackMatch) {
                   const toolName = fallbackMatch[1];
                   // Ensure it's not a common false positive
                   if (!['INFO', 'WARNING', 'ERROR', 'DEBUG'].includes(toolName)) {
                       toolUsage[toolName] = (toolUsage[toolName] || 0) + 1;
                   }
               }
          }


          // 3. Extract Transcript
          
          // Agent Speech
          if (message.includes('gemini_meet_speak_text: text="')) {
              // Ignore "Interrupted by detected speech" messages which are technically results, not speech
              if (message.includes('Interrupted by detected speech')) {
                  return;
              }

              const textMatch = message.match(/gemini_meet_speak_text: text="(.*?)"/);
              if (textMatch) {
                  const content = textMatch[1];
                  
                  // Deduplication Logic
                  // Check if the last message in transcript is identical to this one from the same speaker
                  const lastEntry = transcript[transcript.length - 1];
                  if (lastEntry && lastEntry.type === 'agent' && lastEntry.message === content) {
                      return; // Skip duplicate
                  }

                  transcript.push({
                      timestamp,
                      speaker: 'Gemini',
                      message: content,
                      type: 'agent'
                  });
                  return; 
              }
          }

          // User Speech
          // Pattern: "Logger: Name: "Message"" or "Name: "Message""
          // We look for the ending : "Message" pattern
          const userMatch = message.match(/([^:]+): "([^"]+)"$/);
          if (userMatch && !message.includes('gemini_meet_speak_text')) {
              let name = userMatch[1].trim();
              const text = userMatch[2];
              
              // Handle "LoggerName: Real Name" format
              if (name.includes(':')) {
                  const parts = name.split(':');
                  name = parts[parts.length - 1].trim();
              }
              
              // Filter out known loggers or non-user entities
              const ignoredSpeakers = ['gemini_meet_client', 'Spoken', 'GeminiAgent'];
              const isIgnored = ignoredSpeakers.some(s => name.startsWith(s) || name === s) || name.includes('.');

              if (!isIgnored) {
                  transcript.push({
                      timestamp,
                      speaker: name,
                      message: text,
                      type: 'user'
                  });
              }
          }
      });

      return { transcript, toolUsage };
  }
}

export const datadog = new DatadogClient();
