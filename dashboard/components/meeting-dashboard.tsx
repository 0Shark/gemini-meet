'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, StopCircle, Settings, LogOut, User as UserIcon, FileText } from 'lucide-react';
import { NewMeetingDialog } from './new-meeting-dialog';
import Link from 'next/link';
import { useSession, signOut } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Meeting {
  id: string;
  url: string;
  status: string;
  created_at: string;
  summary?: string;
  transcript?: string;
}

export function MeetingDashboard() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewMeetingOpen, setIsNewMeetingOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const { data: session } = useSession();
  const router = useRouter();

  const fetchMeetings = async () => {
    try {
      const res = await fetch('/api/meetings');
      if (res.ok) {
        const data = await res.json();
        setMeetings(data);
      } else if (res.status === 401) {
          router.push('/auth/login');
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

  const handleSignOut = async () => {
      await signOut({
          fetchOptions: {
              onSuccess: () => {
                  router.push('/auth/login');
              }
          }
      });
  };

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gemini Meet Agents</h1>
          <p className="text-muted-foreground mt-2">Manage your autonomous meeting agents.</p>
        </div>
        <div className="flex gap-2 items-center">
            {session && (
                 <DropdownMenu>
                 <DropdownMenuTrigger asChild>
                   <Button variant="ghost" className="gap-2">
                       <UserIcon className="h-4 w-4" />
                       {session.user.name || session.user.email}
                   </Button>
                 </DropdownMenuTrigger>
                 <DropdownMenuContent align="end">
                   <DropdownMenuLabel>My Account</DropdownMenuLabel>
                   <DropdownMenuSeparator />
                   <DropdownMenuItem onClick={handleSignOut}>
                     <LogOut className="mr-2 h-4 w-4" />
                     Sign Out
                   </DropdownMenuItem>
                 </DropdownMenuContent>
               </DropdownMenu>
            )}
          <Link href="/settings">
            <Button variant="outline">
              <Settings className="mr-2 h-4 w-4" /> Settings
            </Button>
          </Link>
          <Button onClick={() => setIsNewMeetingOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Agent
          </Button>
        </div>
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
                      <div className="flex justify-end gap-2">
                        {meeting.summary && (
                          <Button variant="outline" size="sm" onClick={() => setSelectedMeeting(meeting)}>
                            <FileText className="mr-2 h-4 w-4" /> Summary
                          </Button>
                        )}
                        {meeting.status === 'running' && (
                          <Button variant="destructive" size="sm" onClick={() => handleStop(meeting.id)}>
                            <StopCircle className="mr-2 h-4 w-4" /> Stop
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {isNewMeetingOpen && (
        <NewMeetingDialog 
          open={isNewMeetingOpen} 
          onOpenChange={setIsNewMeetingOpen} 
          onSuccess={fetchMeetings} 
        />
      )}

      {selectedMeeting && (
        <Dialog open={!!selectedMeeting} onOpenChange={(open) => !open && setSelectedMeeting(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Meeting Summary</DialogTitle>
              <DialogDescription>
                {new Date(selectedMeeting.created_at).toLocaleString()} - {selectedMeeting.url}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Summary</h3>
                <div className="bg-muted p-4 rounded-md text-sm whitespace-pre-wrap">
                  {selectedMeeting.summary || "No summary generated."}
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Transcript / Logs</h3>
                <div className="bg-muted p-4 rounded-md text-xs font-mono whitespace-pre-wrap h-48 overflow-y-auto">
                  {selectedMeeting.transcript || "No transcript available."}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
