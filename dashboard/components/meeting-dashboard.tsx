'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, StopCircle, RefreshCw } from 'lucide-react';
import { NewMeetingDialog } from './new-meeting-dialog';
import { formatDistanceToNow } from 'date-fns';

interface Meeting {
  id: string;
  url: string;
  status: string;
  created_at: string;
}

export function MeetingDashboard() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewMeetingOpen, setIsNewMeetingOpen] = useState(false);

  const fetchMeetings = async () => {
    try {
      const res = await fetch('/api/meetings');
      if (res.ok) {
        const data = await res.json();
        setMeetings(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
    const interval = setInterval(fetchMeetings, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

  const handleStop = async (id: string) => {
    try {
      await fetch(`/api/meetings/${id}/stop`, { method: 'POST' });
      fetchMeetings();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gemini Meet Agents</h1>
          <p className="text-muted-foreground mt-2">Manage your autonomous meeting agents.</p>
        </div>
        <Button onClick={() => setIsNewMeetingOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Agent
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Agents</CardTitle>
          <CardDescription>List of running and recent agent sessions.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-4">Loading...</div>
          ) : meetings.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">No agents found. Start one!</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Meeting URL</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {meetings.map((meeting) => (
                  <TableRow key={meeting.id}>
                    <TableCell>
                      <Badge variant={meeting.status === 'running' ? 'default' : 'secondary'}>
                        {meeting.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm max-w-[300px] truncate" title={meeting.url}>
                      {meeting.url}
                    </TableCell>
                    <TableCell>
                       {new Date(meeting.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {meeting.status === 'running' && (
                        <Button variant="destructive" size="sm" onClick={() => handleStop(meeting.id)}>
                          <StopCircle className="mr-2 h-4 w-4" /> Stop
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <NewMeetingDialog 
        open={isNewMeetingOpen} 
        onOpenChange={setIsNewMeetingOpen} 
        onSuccess={fetchMeetings} 
      />
    </div>
  );
}
