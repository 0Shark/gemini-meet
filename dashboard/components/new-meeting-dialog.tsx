'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface McpConfig {
  id: string;
  name: string;
  description: string | null;
  command: string;
  args: string[];
  env: Record<string, string>;
  is_default: boolean;
  enabled: boolean;
}

interface NewMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function NewMeetingDialog({ open, onOpenChange, onSuccess }: NewMeetingDialogProps) {
  const [url, setUrl] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [mcpConfigs, setMcpConfigs] = useState<McpConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(true);
  const router = useRouter();

  // Fetch MCP configs when dialog opens
  useEffect(() => {
    if (open) {
      fetchConfigs();
    }
  }, [open]);

  const fetchConfigs = async () => {
    setConfigsLoading(true);
    try {
      const res = await fetch('/api/mcp-configs');
      if (res.ok) {
        const configs: McpConfig[] = await res.json();
        setMcpConfigs(configs.filter(c => c.enabled));
        // Pre-select default tools
        const defaults = configs.filter(c => c.is_default && c.enabled).map(c => c.id);
        setSelectedTools(defaults);
      } else if (res.status === 401) {
          router.push('/auth/login');
      }
    } catch (error) {
      console.error('Failed to fetch MCP configs:', error);
    } finally {
      setConfigsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, mcpConfigIds: selectedTools }),
      });

      if (res.ok) {
        setUrl('');
        setSelectedTools([]);
        onOpenChange(false);
        onSuccess();
      } else {
        if (res.status === 401) {
            router.push('/auth/login');
            return;
        }
        const err = await res.json();
        alert(err.error || 'Failed to start agent');
      }
    } catch (error) {
      console.error(error);
      alert('Network error');
    } finally {
      setLoading(false);
    }
  };

  const toggleTool = (id: string) => {
    setSelectedTools((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const hasEmptyEnvVars = (env: Record<string, string>) => {
    return Object.values(env).some(v => v === '');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Spawn New Agent</DialogTitle>
            <DialogDescription>
              Enter the meeting URL and select the tools you want the agent to use.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="url" className="text-right">
                Meeting URL
              </Label>
              <Input
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://meet.google.com/..."
                className="col-span-3"
                required
              />
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Enable Tools (MCP)</Label>
                <Link href="/settings" className="text-xs text-muted-foreground hover:underline">
                  Manage tools
                </Link>
              </div>
              <div className="border rounded-md p-4 space-y-3 max-h-[200px] overflow-y-auto">
                {configsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading tools...</p>
                ) : mcpConfigs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No MCP tools configured.{' '}
                    <Link href="/settings" className="text-primary hover:underline">
                      Add some in settings
                    </Link>
                  </p>
                ) : (
                  mcpConfigs.map((config) => (
                    <div key={config.id} className="flex items-start space-x-2">
                      <Checkbox 
                        id={`tool-${config.id}`} 
                        checked={selectedTools.includes(config.id)}
                        onCheckedChange={() => toggleTool(config.id)}
                        disabled={hasEmptyEnvVars(config.env)}
                      />
                      <div className="grid gap-1.5 leading-none flex-1">
                        <div className="flex items-center gap-2">
                          <Label
                            htmlFor={`tool-${config.id}`}
                            className={`text-sm font-medium leading-none ${hasEmptyEnvVars(config.env) ? 'text-muted-foreground' : ''}`}
                          >
                            {config.name}
                          </Label>
                          {config.is_default && (
                            <Badge variant="secondary" className="text-xs">Default</Badge>
                          )}
                          {hasEmptyEnvVars(config.env) && (
                            <Badge variant="outline" className="text-xs text-orange-600">Needs API key</Badge>
                          )}
                        </div>
                        {config.description && (
                          <p className="text-xs text-muted-foreground">
                            {config.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Spawning...' : 'Start Agent'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
