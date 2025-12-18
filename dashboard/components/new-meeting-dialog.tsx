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
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

const LANGUAGES = [
  { value: 'en', label: 'English' },
  // Future: Add more languages here
];

const STT_PROVIDERS = [
  { value: 'google', label: 'Google' },
  { value: 'deepgram', label: 'Deepgram' },
  { value: 'whisper', label: 'Whisper (Local)' },
];

const TTS_PROVIDERS = [
  { value: 'google', label: 'Google' },
  { value: 'elevenlabs', label: 'ElevenLabs' },
];

const ELEVENLABS_VOICES = [
  { value: 'Dslrhjl3ZpzrctukrQSN', label: 'Brad (English)' },
  { value: 'kdmDKE6EkgrWrrykO9Qt', label: 'Alexandra (English)' },
  { value: 'MFZUKuGQUsGJPQjTS4wC', label: 'Jon (English)' },
  { value: 'h2sm0NbeIZXHBzJOMYcQ', label: 'Natasha (English)' },
];

const GOOGLE_VOICES = [
  { value: 'Puck', label: 'Puck (Upbeat)' },
  { value: 'Zephyr', label: 'Zephyr (Bright)' },
  { value: 'Kore', label: 'Kore (Firm)' },
  { value: 'Fenrir', label: 'Fenrir (Deep)' },
  { value: 'Leda', label: 'Leda (Calm)' },
];

export function NewMeetingDialog({ open, onOpenChange, onSuccess }: NewMeetingDialogProps) {
  const [url, setUrl] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [mcpConfigs, setMcpConfigs] = useState<McpConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(true);

  // New Settings State
  const [language, setLanguage] = useState('en');
  const [sttProvider, setSttProvider] = useState('google');
  const [ttsProvider, setTtsProvider] = useState('elevenlabs');
  const [ttsVoice, setTtsVoice] = useState('Dslrhjl3ZpzrctukrQSN');

  useEffect(() => {
    if (open) {
      fetchConfigs();
      // Reset defaults when opening
      setLanguage('en');
      setSttProvider('google');
      setTtsProvider('elevenlabs');
      setTtsVoice('Dslrhjl3ZpzrctukrQSN');
    }
  }, [open]);

  // Update default voice when provider changes
  useEffect(() => {
    if (ttsProvider === 'google') {
        setTtsVoice('Puck');
    } else if (ttsProvider === 'elevenlabs') {
        setTtsVoice('Dslrhjl3ZpzrctukrQSN');
    }
  }, [ttsProvider]);

  const fetchConfigs = async () => {
    setConfigsLoading(true);
    try {
      const res = await fetch('/api/mcp-configs');
      if (res.ok) {
        const configs: McpConfig[] = await res.json();
        setMcpConfigs(configs.filter(c => c.enabled));
        const defaults = configs.filter(c => c.is_default && c.enabled).map(c => c.id);
        setSelectedTools(defaults);
      } else if (res.status === 401) {
        console.error('Session expired or unauthorized');
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
        body: JSON.stringify({ 
            url, 
            mcpConfigIds: selectedTools,
            language,
            sttProvider,
            ttsProvider,
            ttsVoice
        }),
      });

      if (res.ok) {
        setUrl('');
        setSelectedTools([]);
        onOpenChange(false);
        onSuccess();
      } else {
        if (res.status === 401) {
          console.error('Session expired or unauthorized');
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
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Spawn New Agent</DialogTitle>
            <DialogDescription>
              Configure your agent settings and tools.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            
            {/* Main Settings */}
            <div className="grid gap-4 border-b pb-4">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="url" className="text-right">Meeting URL</Label>
                    <Input
                        id="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://meet.google.com/..."
                        className="col-span-3"
                        required
                    />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Language</Label>
                    <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger className="col-span-3">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {LANGUAGES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Audio Settings */}
            <div className="grid gap-4 border-b pb-4">
                <h3 className="font-semibold text-sm">Audio Configuration</h3>
                
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">STT Provider</Label>
                    <Select value={sttProvider} onValueChange={setSttProvider}>
                        <SelectTrigger className="col-span-3">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {STT_PROVIDERS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">TTS Provider</Label>
                    <Select value={ttsProvider} onValueChange={setTtsProvider}>
                        <SelectTrigger className="col-span-3">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {TTS_PROVIDERS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Voice</Label>
                    <Select value={ttsVoice} onValueChange={setTtsVoice}>
                        <SelectTrigger className="col-span-3">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {(ttsProvider === 'elevenlabs' ? ELEVENLABS_VOICES : GOOGLE_VOICES).map(v => (
                                <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            
            {/* Tools */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Enable Tools (MCP)</Label>
                <Link href="/settings" className="text-xs text-muted-foreground hover:underline">
                  Manage tools
                </Link>
              </div>
              <div className="border rounded-md p-4 space-y-3 max-h-[150px] overflow-y-auto">
                {configsLoading ? (
                  <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading tools...
                  </div>
                ) : mcpConfigs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No MCP tools configured.{' '}
                    <Link href="/settings" className="text-primary hover:underline">
                      Add some in settings
                    </Link>
                  </p>
                ) : (
                  mcpConfigs.map((config) => (
                    <div 
                      key={config.id} 
                      className={`flex items-start space-x-3 p-2 rounded-md transition-colors ${
                        selectedTools.includes(config.id) ? 'bg-primary/5' : ''
                      }`}
                    >
                      <Checkbox 
                        id={`tool-${config.id}`} 
                        checked={selectedTools.includes(config.id)}
                        onCheckedChange={() => toggleTool(config.id)}
                        disabled={hasEmptyEnvVars(config.env)}
                        className="mt-0.5"
                      />
                      <div className="grid gap-1.5 leading-none flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Label
                            htmlFor={`tool-${config.id}`}
                            className={`text-sm font-medium leading-none cursor-pointer ${hasEmptyEnvVars(config.env) ? 'text-muted-foreground' : ''}`}
                          >
                            {config.name}
                          </Label>
                          {config.is_default && (
                            <Badge variant="secondary" className="text-xs">Default</Badge>
                          )}
                          {hasEmptyEnvVars(config.env) && (
                            <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">Needs API key</Badge>
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
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="gap-2 min-w-[120px]">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Spawning...
                </>
              ) : (
                'Start Agent'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
