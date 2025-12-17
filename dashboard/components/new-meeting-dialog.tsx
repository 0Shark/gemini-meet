'use client';

import { useState } from 'react';
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
import { AVAILABLE_TOOLS } from '@/lib/tools';

interface NewMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function NewMeetingDialog({ open, onOpenChange, onSuccess }: NewMeetingDialogProps) {
  const [url, setUrl] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, toolIds: selectedTools }),
      });

      if (res.ok) {
        setUrl('');
        setSelectedTools([]);
        onOpenChange(false);
        onSuccess();
      } else {
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
              <Label>Enable Tools (MCP)</Label>
              <div className="border rounded-md p-4 space-y-3 max-h-[200px] overflow-y-auto">
                {AVAILABLE_TOOLS.map((tool) => (
                  <div key={tool.id} className="flex items-start space-x-2">
                    <Checkbox 
                      id={`tool-${tool.id}`} 
                      checked={selectedTools.includes(tool.id)}
                      onCheckedChange={() => toggleTool(tool.id)}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label
                        htmlFor={`tool-${tool.id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {tool.name}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {tool.description}
                      </p>
                    </div>
                  </div>
                ))}
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
