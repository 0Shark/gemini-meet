import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, ArrowDown } from 'lucide-react';
import { Button } from "@/components/ui/button";

interface LogViewerProps {
  logs: string;
}

interface LogEntry {
  id: number;
  raw: string;
  timestamp?: string;
  level?: string;
  logger?: string;
  message: string;
}

export function LogViewer({ logs }: LogViewerProps) {
  const [filter, setFilter] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Parse logs
  const parsedLogs = useMemo(() => {
    if (!logs) return [];
    
    return logs.split('\n').filter(Boolean).map((line, index) => {
      // Format from Datadog: TIMESTAMP [STATUS] [LOGGER ]MESSAGE
      // Example: 2025-12-19T00:05:12.695Z [INFO] gemini_meet.controllers.speech.default Spoken (1/2): "Hello"
      // Or with colon in message: 2025-12-19T00:05:12.695Z [INFO] gemini_meet_client.agent speak_text: text="Hello"
      
      // Try parsing with logger name (has a colon or space before message content)
      const matchWithLogger = line.match(/^(\S+)\s+\[(\w+)\]\s+(\S+)\s+(.*)$/);
      
      if (matchWithLogger) {
        const timestamp = matchWithLogger[1];
        const level = matchWithLogger[2];
        const logger = matchWithLogger[3];
        const message = matchWithLogger[4];
        
        // Format timestamp for display
        let displayTime = timestamp;
        try {
          const date = new Date(timestamp);
          displayTime = date.toISOString().replace('T', ' ').replace('Z', '');
        } catch {
          // Keep original if parsing fails
        }
        
        return {
          id: index,
          raw: line,
          timestamp: displayTime,
          level: level.toUpperCase(),
          logger,
          message
        };
      }
      
      // Simpler format: TIMESTAMP [STATUS] MESSAGE (no logger)
      const matchSimple = line.match(/^(\S+)\s+\[(\w+)\]\s+(.*)$/);
      
      if (matchSimple) {
        const timestamp = matchSimple[1];
        const level = matchSimple[2];
        const message = matchSimple[3];
        
        let displayTime = timestamp;
        try {
          const date = new Date(timestamp);
          displayTime = date.toISOString().replace('T', ' ').replace('Z', '');
        } catch {
          // Keep original if parsing fails
        }
        
        return {
          id: index,
          raw: line,
          timestamp: displayTime,
          level: level.toUpperCase(),
          message
        };
      }
      
      // Fallback for lines that don't match (e.g. stack traces, plain text)
      return {
        id: index,
        raw: line,
        message: line
      };
    });
  }, [logs]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    if (!filter) return parsedLogs;
    const lowerFilter = filter.toLowerCase();
    return parsedLogs.filter(log => 
      log.message.toLowerCase().includes(lowerFilter) || 
      log.logger?.toLowerCase().includes(lowerFilter) ||
      log.level?.toLowerCase().includes(lowerFilter)
    );
  }, [parsedLogs, filter]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
        const scrollableNode = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (scrollableNode) {
            scrollableNode.scrollTop = scrollableNode.scrollHeight;
        }
    }
  }, [filteredLogs, autoScroll]);

  // Handle scroll events to disable auto-scroll if user scrolls up
  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
     // implementation depends on getting ref to viewport, simplified for now
  };

  const getLevelColor = (level?: string) => {
    switch (level?.toUpperCase()) {
      case 'INFO': return 'text-blue-400';
      case 'WARNING': 
      case 'WARN': return 'text-yellow-400';
      case 'ERROR': return 'text-red-400';
      case 'DEBUG': return 'text-gray-400';
      default: return 'text-gray-300';
    }
  };

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Filter logs..." 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            className="pl-8 h-9 font-mono text-xs"
          />
        </div>
        <Button 
            variant="outline" 
            size="sm" 
            className={`h-9 ${autoScroll ? 'bg-primary/10' : ''}`}
            onClick={() => setAutoScroll(!autoScroll)}
        >
            <ArrowDown className="h-4 w-4 mr-2" />
            {autoScroll ? 'Auto-scrolling' : 'Scroll to Bottom'}
        </Button>
      </div>

      <div className="rounded-md border bg-black/90 font-mono text-xs overflow-hidden flex-1 relative">
        <ScrollArea className="h-full w-full p-4" ref={scrollRef}>
          <div className="space-y-1">
            {filteredLogs.map((log) => (
              <div key={log.id} className="flex gap-2 hover:bg-white/5 p-0.5 rounded -mx-2 px-2">
                {log.timestamp ? (
                    <>
                        <span className="text-gray-500 shrink-0 w-[140px]">{log.timestamp}</span>
                        <span className={`shrink-0 w-[60px] font-bold ${getLevelColor(log.level)}`}>
                            {log.level}
                        </span>
                        <span className="text-purple-400 shrink-0 w-[200px] truncate" title={log.logger}>
                            {log.logger}
                        </span>
                        <span className="text-gray-300 break-all whitespace-pre-wrap flex-1">
                            {log.message}
                        </span>
                    </>
                ) : (
                    <span className="text-gray-400 break-all whitespace-pre-wrap flex-1 pl-[416px]">
                        {log.message}
                    </span>
                )}
              </div>
            ))}
            {filteredLogs.length === 0 && (
                <div className="text-center text-gray-500 mt-10">No logs found.</div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
