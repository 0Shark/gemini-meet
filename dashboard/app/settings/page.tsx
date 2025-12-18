'use client';

import { useState, useEffect } from 'react';
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
import { Box, Plus, Trash2, Edit2, Shield, Settings, CheckCircle2, Download } from 'lucide-react';

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

export default function SettingsPage() {
  const [configs, setConfigs] = useState<McpConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingConfig, setEditingConfig] = useState<McpConfig | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    command: '',
    args: '',
    env: '',
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
         window.location.href = '/auth/login';
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

  const openCreateDialog = () => {
    setIsCreating(true);
    setEditingConfig(null);
    setFormData({
      name: '',
      description: '',
      command: 'npx',
      args: '["-y", "@modelcontextprotocol/server-"]',
      env: '{}',
      is_default: false,
      enabled: true,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (config: McpConfig) => {
    setIsCreating(false);
    setEditingConfig(config);
    setFormData({
      name: config.name,
      description: config.description || '',
      command: config.command,
      args: JSON.stringify(config.args, null, 2),
      env: JSON.stringify(config.env, null, 2),
      is_default: config.is_default,
      enabled: config.enabled,
    });
    setIsDialogOpen(true);
  };

  const installOfficial = (server: OfficialMcpServer) => {
    setIsCreating(true);
    setEditingConfig(null);
    
    // Construct initial env with empty values or placeholders
    const envInit: Record<string, string> = {};
    if (server.envSchema) {
      Object.keys(server.envSchema).forEach(key => {
        envInit[key] = ''; // Leave empty for user to fill
      });
    }

    setFormData({
      name: server.name,
      description: server.description,
      command: server.command,
      args: JSON.stringify(server.args, null, 2),
      env: JSON.stringify(envInit, null, 2),
      is_default: false,
      enabled: true,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const payload = {
        name: formData.name,
        description: formData.description || null,
        command: formData.command,
        args: JSON.parse(formData.args),
        env: JSON.parse(formData.env),
        is_default: formData.is_default,
        enabled: formData.enabled,
      };

      const url = isCreating ? '/api/mcp-configs' : `/api/mcp-configs/${editingConfig?.id}`;
      const method = isCreating ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsDialogOpen(false);
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
    if (!confirm('Are you sure you want to delete this MCP configuration?')) return;

    try {
      const res = await fetch(`/api/mcp-configs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchConfigs();
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const toggleEnabled = async (config: McpConfig) => {
    try {
      const res = await fetch(`/api/mcp-configs/${config.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !config.enabled }),
      });
      if (res.ok) {
        fetchConfigs();
      }
    } catch (error) {
      console.error('Toggle error:', error);
    }
  };

  const toggleDefault = async (config: McpConfig) => {
    try {
      const res = await fetch(`/api/mcp-configs/${config.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: !config.is_default }),
      });
      if (res.ok) {
        fetchConfigs();
      }
    } catch (error) {
      console.error('Toggle error:', error);
    }
  };

  const getEnvKeys = (env: Record<string, string>) => {
    return Object.keys(env).filter(k => env[k] === '');
  };

  const isInstalled = (officialId: string) => {
    // Simple heuristic: check if any config name matches the official name
    return configs.some(c => c.name === OFFICIAL_MCP_SERVERS.find(o => o.id === officialId)?.name);
  };

  if (loading) {
    return (
      <div className="container mx-auto p-8 flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">MCP Library</h1>
          <p className="text-muted-foreground mt-1">Manage and discover tools for your Gemini agents</p>
        </div>
        <div className="flex gap-2">
          <Link href="/">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
          <Button onClick={openCreateDialog} className="gap-2">
            <Plus className="h-4 w-4" /> Custom Server
          </Button>
        </div>
      </div>

      {/* Installed Section */}
      <section className="mb-12">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Installed Servers</h2>
        </div>
        
        {configs.length === 0 ? (
          <div className="bg-muted/30 border-dashed border-2 rounded-lg p-12 text-center">
            <p className="text-muted-foreground">No servers installed yet. Explore the library below or add a custom one.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {configs.map((config) => (
              <Card key={config.id} className={`flex flex-col ${!config.enabled ? 'opacity-60 bg-muted/50' : ''}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-md">
                        <Box className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          {config.name}
                          {config.is_default && (
                            <Badge variant="secondary" className="text-xs">Default</Badge>
                          )}
                        </CardTitle>
                      </div>
                    </div>
                    <Switch
                      checked={config.enabled}
                      onCheckedChange={() => toggleEnabled(config)}
                    />
                  </div>
                  {config.description && (
                    <CardDescription className="mt-2 line-clamp-2 text-xs">
                      {config.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex-1 text-sm">
                   <div className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded truncate mb-2">
                     {config.command} {config.args[1] || config.args[0]} ...
                   </div>
                   {getEnvKeys(config.env).length > 0 && (
                      <div className="text-xs text-orange-600 flex items-center gap-1">
                        <Shield className="h-3 w-3" />
                        Missing keys: {getEnvKeys(config.env).join(', ')}
                      </div>
                   )}
                </CardContent>
                <CardFooter className="pt-2 border-t gap-2 justify-end">
                    <Button variant="ghost" size="icon" onClick={() => toggleDefault(config)} title={config.is_default ? "Unset Default" : "Set Default"}>
                        <CheckCircle2 className={`h-4 w-4 ${config.is_default ? 'text-green-600' : 'text-muted-foreground'}`} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(config)}>
                        <Edit2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(config.id)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Official Library Section */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5 text-blue-600" />
          <h2 className="text-xl font-semibold">Official MCP Servers</h2>
          <Badge variant="secondary" className="ml-2">Secure & Verified</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {OFFICIAL_MCP_SERVERS.map((server) => {
             const installed = isInstalled(server.id);
             return (
              <Card key={server.id} className="group hover:border-primary/50 transition-colors">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                        <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <CardTitle className="text-base font-semibold">{server.name}</CardTitle>
                    </div>
                    {installed && <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Installed</Badge>}
                  </div>
                  <CardDescription className="mt-2 text-sm">
                    {server.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-xs text-muted-foreground mt-2">
                        <span className="font-semibold text-foreground">Package:</span> {server.packageName}
                    </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    className="w-full gap-2" 
                    variant={installed ? "outline" : "default"}
                    onClick={() => installOfficial(server)}
                  >
                    {installed ? (
                        <>
                            <Settings className="h-4 w-4" /> Configure Another
                        </>
                    ) : (
                        <>
                            <Download className="h-4 w-4" /> Install
                        </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
             );
          })}
        </div>
      </section>

      {/* Dialog for Add/Edit */}
      {isDialogOpen && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{isCreating ? 'Install MCP Server' : 'Edit MCP Server'}</DialogTitle>
              <DialogDescription>
                Configure the server settings. {getEnvKeys(JSON.parse(formData.env || '{}')).length > 0 && "Don't forget to add your API keys!"}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="col-span-3"
                  placeholder="My MCP Server"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="description" className="text-right">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="col-span-3"
                  placeholder="What does this server do?"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="command" className="text-right">Command</Label>
                <Input
                  id="command"
                  value={formData.command}
                  onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                  className="col-span-3 font-mono"
                  placeholder="npx"
                />
              </div>

              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="args" className="text-right pt-2">Arguments</Label>
                <Textarea
                  id="args"
                  value={formData.args}
                  onChange={(e) => setFormData({ ...formData, args: e.target.value })}
                  className="col-span-3 font-mono text-sm"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="env" className="text-right pt-2">
                  Environment
                  <span className="block text-xs text-muted-foreground font-normal">JSON format</span>
                </Label>
                <Textarea
                  id="env"
                  value={formData.env}
                  onChange={(e) => setFormData({ ...formData, env: e.target.value })}
                  className="col-span-3 font-mono text-sm"
                  rows={4}
                  placeholder='{"API_KEY": "..."}'
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Options</Label>
                <div className="col-span-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                      <Switch
                      checked={formData.is_default}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
                      />
                      <span className="text-sm">Enabled by default for new meetings</span>
                  </div>
                  <div className="flex items-center gap-2">
                      <Switch
                      checked={formData.enabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                      />
                      <span className="text-sm">Enabled in library</span>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                {isCreating ? 'Install Server' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
