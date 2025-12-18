'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';
import { OFFICIAL_MCP_SERVERS, OfficialMcpServer } from '@/lib/mcp-registry';
import { Box, Plus, Trash2, Edit2, Shield, CheckCircle2, Download, Key, Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface McpConfig {
  id: string;
  name: string;
  description: string | null;
  command: string;
  args: string[];
  env: Record<string, string>;
  is_default: boolean;
  enabled: boolean;
  created_at: string;
}

type DialogMode = 'closed' | 'install-official' | 'custom' | 'edit';

const ITEMS_PER_PAGE = 12;

export default function SettingsPage() {
  const [configs, setConfigs] = useState<McpConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogMode, setDialogMode] = useState<DialogMode>('closed');
  const [editingConfig, setEditingConfig] = useState<McpConfig | null>(null);
  const [selectedServer, setSelectedServer] = useState<OfficialMcpServer | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  // Simple form for official servers (just API keys)
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [formOptions, setFormOptions] = useState({ is_default: false, enabled: true });
  
  // Advanced form for custom servers
  const [customForm, setCustomForm] = useState({
    name: '',
    description: '',
    command: 'npx',
    args: '',
    env: '{}',
    is_default: false,
    enabled: true,
  });

  const fetchConfigs = async () => {
    try {
      const res = await fetch('/api/mcp-configs');
      if (res.ok) {
        const data = await res.json();
        setConfigs(data);
      } else if (res.status === 401) {
        console.error('Session expired or unauthorized');
      }
    } catch (error) {
      console.error('Failed to fetch configs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const openInstallDialog = (server: OfficialMcpServer) => {
    setSelectedServer(server);
    setEnvValues(
      server.envSchema 
        ? Object.keys(server.envSchema).reduce((acc, key) => ({ ...acc, [key]: '' }), {})
        : {}
    );
    setFormOptions({ is_default: false, enabled: true });
    setDialogMode('install-official');
  };

  const openCustomDialog = () => {
    setCustomForm({
      name: '',
      description: '',
      command: 'npx',
      args: '[]',
      env: '{}',
      is_default: false,
      enabled: true,
    });
    setDialogMode('custom');
  };

  const openEditDialog = (config: McpConfig) => {
    setEditingConfig(config);
    setCustomForm({
      name: config.name,
      description: config.description || '',
      command: config.command,
      args: JSON.stringify(config.args, null, 2),
      env: JSON.stringify(config.env, null, 2),
      is_default: config.is_default,
      enabled: config.enabled,
    });
    setDialogMode('edit');
  };

  const handleInstallOfficial = async () => {
    if (!selectedServer) return;
    
    try {
      const payload = {
        name: selectedServer.name,
        description: selectedServer.description,
        command: selectedServer.command,
        args: selectedServer.args,
        env: envValues,
        is_default: formOptions.is_default,
        enabled: formOptions.enabled,
      };

      const res = await fetch('/api/mcp-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setDialogMode('closed');
        fetchConfigs();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to install');
      }
    } catch (error) {
      console.error('Install error:', error);
      alert('Failed to install server');
    }
  };

  const handleSaveCustom = async () => {
    try {
      const payload = {
        name: customForm.name,
        description: customForm.description || null,
        command: customForm.command,
        args: JSON.parse(customForm.args),
        env: JSON.parse(customForm.env),
        is_default: customForm.is_default,
        enabled: customForm.enabled,
      };

      const url = dialogMode === 'edit' ? `/api/mcp-configs/${editingConfig?.id}` : '/api/mcp-configs';
      const method = dialogMode === 'edit' ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setDialogMode('closed');
        fetchConfigs();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save');
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('Invalid JSON in args or env fields');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this MCP server?')) return;
    try {
      const res = await fetch(`/api/mcp-configs/${id}`, { method: 'DELETE' });
      if (res.ok) fetchConfigs();
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const toggleEnabled = async (config: McpConfig) => {
    // Optimistic update
    const updatedConfigs = configs.map(c => 
      c.id === config.id ? { ...c, enabled: !config.enabled } : c
    );
    setConfigs(updatedConfigs);

    try {
      await fetch(`/api/mcp-configs/${config.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !config.enabled }),
      });
      // No need to fetchConfigs if successful, already updated optimistically
    } catch (error) {
      console.error('Toggle error:', error);
      // Revert on error
      fetchConfigs();
    }
  };

  const toggleDefault = async (config: McpConfig) => {
    // Optimistic update
    const updatedConfigs = configs.map(c => 
      c.id === config.id ? { ...c, is_default: !config.is_default } : c
    );
    setConfigs(updatedConfigs);

    try {
      await fetch(`/api/mcp-configs/${config.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: !config.is_default }),
      });
    } catch (error) {
      console.error('Toggle error:', error);
      fetchConfigs();
    }
  };

  const getMissingEnvKeys = (env: Record<string, string>) => {
    return Object.keys(env).filter(k => env[k] === '');
  };

  const isInstalled = (serverId: string) => {
    const server = OFFICIAL_MCP_SERVERS.find(s => s.id === serverId);
    return server ? configs.some(c => c.name === server.name) : false;
  };

  // Filter available servers
  const availableServers = useMemo(() => {
    let filtered = OFFICIAL_MCP_SERVERS.filter(server => !isInstalled(server.id));
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(server => 
        server.name.toLowerCase().includes(query) || 
        server.description.toLowerCase().includes(query)
      );
    }
    return filtered;
  }, [configs, searchQuery]);

  // Pagination logic
  const totalPages = Math.ceil(availableServers.length / ITEMS_PER_PAGE);
  const paginatedServers = availableServers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">MCP Library</h1>
          <p className="text-muted-foreground mt-1">Manage and discover tools for your Gemini agents</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={openCustomDialog} className="gap-2 shadow-sm hover:shadow transition-all">
            <Plus className="h-4 w-4" /> Custom Server
          </Button>
        </div>
      </div>

      {/* Installed Servers */}
      {configs.length > 0 && (
        <section className="mb-12">
          <h2 className="text-lg font-semibold mb-4">Installed</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {configs.map((config) => (
              <Card key={config.id} className={`transition-all duration-200 hover:shadow-md ${!config.enabled ? 'opacity-75 bg-muted/30' : ''}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                        <Box className="h-4 w-4" />
                      </div>
                      <div className="space-y-0.5">
                        <CardTitle className="text-sm font-medium">{config.name}</CardTitle>
                        {config.is_default && <Badge variant="secondary" className="text-[10px] h-4">Default</Badge>}
                      </div>
                    </div>
                    <Switch checked={config.enabled} onCheckedChange={() => toggleEnabled(config)} />
                  </div>
                </CardHeader>
                <CardContent className="pb-2 min-h-[40px]">
                  {config.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                      {config.description}
                    </p>
                  )}
                  {getMissingEnvKeys(config.env).length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 dark:bg-orange-950/30 p-1.5 rounded-md">
                      <Key className="h-3 w-3" />
                      <span>Missing keys: {getMissingEnvKeys(config.env).length}</span>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="pt-2 border-t justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted" onClick={() => toggleDefault(config)} title="Set as default">
                    <CheckCircle2 className={`h-4 w-4 ${config.is_default ? 'text-green-600' : 'text-muted-foreground'}`} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted" onClick={() => openEditDialog(config)}>
                    <Edit2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDelete(config.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Available Servers */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Available Servers</h2>
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search servers..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="pl-8 h-9"
            />
          </div>
        </div>
        
        {paginatedServers.length === 0 ? (
          <div className="text-center py-12 bg-muted/20 rounded-lg border border-dashed">
            <p className="text-muted-foreground">No servers found matching &quot;{searchQuery}&quot;</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedServers.map((server) => (
              <Card key={server.id} className="group hover:border-primary/50 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{server.name}</CardTitle>
                  </div>
                  <CardDescription className="text-xs line-clamp-2 h-8">{server.description}</CardDescription>
                </CardHeader>
                <CardFooter className="pt-2">
                  <Button 
                    size="sm" 
                    className="w-full gap-2 transition-all active:scale-95"
                    onClick={() => openInstallDialog(server)}
                  >
                    <Download className="h-3 w-3" />
                    Install
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </section>

      {/* Install Dialog */}
      <Dialog open={dialogMode === 'install-official'} onOpenChange={(open) => !open && setDialogMode('closed')}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Install {selectedServer?.name}</DialogTitle>
            <DialogDescription>{selectedServer?.description}</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {selectedServer?.envSchema && Object.entries(selectedServer.envSchema).length > 0 ? (
              Object.entries(selectedServer.envSchema).map(([key, schema]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>{schema.description}</Label>
                  <Input
                    id={key}
                    type="password"
                    value={envValues[key] || ''}
                    onChange={(e) => setEnvValues({ ...envValues, [key]: e.target.value })}
                    placeholder={`Enter ${schema.description.toLowerCase()}`}
                  />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No configuration required.</p>
            )}

            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label htmlFor="default" className="text-sm">Enable by default for new meetings</Label>
                <Switch
                  id="default"
                  checked={formOptions.is_default}
                  onCheckedChange={(checked) => setFormOptions({ ...formOptions, is_default: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="enabled" className="text-sm">Enabled</Label>
                <Switch
                  id="enabled"
                  checked={formOptions.enabled}
                  onCheckedChange={(checked) => setFormOptions({ ...formOptions, enabled: checked })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode('closed')}>Cancel</Button>
            <Button onClick={handleInstallOfficial}>Install</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom/Edit Dialog */}
      <Dialog open={dialogMode === 'custom' || dialogMode === 'edit'} onOpenChange={(open) => !open && setDialogMode('closed')}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialogMode === 'edit' ? 'Edit Server' : 'Custom MCP Server'}</DialogTitle>
            <DialogDescription>Configure server settings manually</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={customForm.name}
                onChange={(e) => setCustomForm({ ...customForm, name: e.target.value })}
                placeholder="My Server"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="command">Command</Label>
              <Input
                id="command"
                value={customForm.command}
                onChange={(e) => setCustomForm({ ...customForm, command: e.target.value })}
                placeholder="npx"
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="args">Arguments (JSON array)</Label>
              <Textarea
                id="args"
                value={customForm.args}
                onChange={(e) => setCustomForm({ ...customForm, args: e.target.value })}
                placeholder='["-y", "@package/name"]'
                className="font-mono text-sm"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="env">Environment Variables (JSON)</Label>
              <Textarea
                id="env"
                value={customForm.env}
                onChange={(e) => setCustomForm({ ...customForm, env: e.target.value })}
                placeholder='{"API_KEY": "..."}'
                className="font-mono text-sm"
                rows={2}
              />
            </div>

            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Enable by default</Label>
                <Switch
                  checked={customForm.is_default}
                  onCheckedChange={(checked) => setCustomForm({ ...customForm, is_default: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Enabled</Label>
                <Switch
                  checked={customForm.enabled}
                  onCheckedChange={(checked) => setCustomForm({ ...customForm, enabled: checked })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode('closed')}>Cancel</Button>
            <Button onClick={handleSaveCustom}>{dialogMode === 'edit' ? 'Save' : 'Add Server'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
