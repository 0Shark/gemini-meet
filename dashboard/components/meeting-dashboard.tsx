'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Plus, 
  StopCircle, 
  FileText,
  Activity,
  Clock,
  CheckCircle2,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Terminal,
  AlertCircle
} from 'lucide-react';
import { NewMeetingDialog } from './new-meeting-dialog';
import { useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Meeting {
  id: string;
  url: string;
  status: string;
  created_at: string;
  ended_at?: string;
  summary?: string;
  transcript?: string;
  containerId?: string; // Add containerId if needed, but we fetch by ID
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

function StatCard({ title, value, icon, description, trend }: StatCardProps) {
  return (
    <Card className="relative overflow-hidden transition-all hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-xs text-muted-foreground">{description}</p>
          {trend && (
            <span className={`text-xs font-medium flex items-center gap-0.5 ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
              <TrendingUp className={`h-3 w-3 ${!trend.isPositive && 'rotate-180'}`} />
              {trend.value}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const ITEMS_PER_PAGE = 10;

export function MeetingDashboard() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewMeetingOpen, setIsNewMeetingOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const { data: session } = useSession();
  const router = useRouter();

  // Pagination & Sorting State
  const [currentPage, setCurrentPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Log Viewer State
  const [logViewerMeeting, setLogViewerMeeting] = useState<Meeting | null>(null);
  const [liveLogs, setLiveLogs] = useState<string>('');

  // Poll Logs
  useEffect(() => {
    if (!logViewerMeeting) {
        setLiveLogs('');
        return;
    }
    
    // Initial fetch
    setLiveLogs('Loading logs from Datadog...');
    
    const fetchLogs = async () => {
        try {
            const res = await fetch(`/api/meetings/${logViewerMeeting.id}/logs`);
            if (res.ok) {
                const data = await res.json();
                setLiveLogs(data.logs || 'No logs found in Datadog (yet).');
            }
        } catch (e) {
            console.error(e);
        }
    };
    
    fetchLogs();
    // Poll more frequently for live feeling
    const interval = setInterval(fetchLogs, 5000); // 5s poll for Datadog
    return () => clearInterval(interval);
  }, [logViewerMeeting]);

  // Fetch Transcript for Summary Dialog if missing
  const [fetchedTranscript, setFetchedTranscript] = useState<string>('');
  
  useEffect(() => {
      if (!selectedMeeting) {
          setFetchedTranscript('');
          return;
      }
      
      if (selectedMeeting.transcript) {
          setFetchedTranscript(selectedMeeting.transcript);
          return;
      }

      const fetchTranscript = async () => {
          setFetchedTranscript('Loading transcript from Datadog...');
          try {
              const res = await fetch(`/api/meetings/${selectedMeeting.id}/transcript`);
              if (res.ok) {
                  const data = await res.json();
                  setFetchedTranscript(data.transcript || 'No transcript available.');
              } else {
                  setFetchedTranscript('Failed to load transcript.');
              }
          } catch (e) {
              setFetchedTranscript('Error loading transcript.');
          }
      };
      
      fetchTranscript();
  }, [selectedMeeting]);

  // Calculate statistics (from ALL meetings)
  const stats = useMemo(() => {
    const running = meetings.filter(m => m.status === 'running').length;
    const completed = meetings.filter(m => m.status === 'completed').length;
    const failed = meetings.filter(m => m.status === 'failed').length;
    const total = meetings.length;
    
    const completedMeetings = meetings.filter(m => m.status === 'completed' || m.status === 'stopped');
    const avgDuration = completedMeetings.length > 0 
      ? Math.round(completedMeetings.reduce((acc, m) => {
          const created = new Date(m.created_at);
          const end = m.ended_at ? new Date(m.ended_at) : new Date();
          return acc + (end.getTime() - created.getTime()) / (1000 * 60);
        }, 0) / completedMeetings.length)
      : 0;

    return { running, completed, failed, total, avgDuration };
  }, [meetings]);

  // Filter & Sort Meetings
  const filteredMeetings = useMemo(() => {
    let filtered = [...meetings];

    if (statusFilter !== 'all') {
      filtered = filtered.filter(m => m.status === statusFilter);
    }

    filtered.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    return filtered;
  }, [meetings, statusFilter, sortOrder]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredMeetings.length / ITEMS_PER_PAGE);
  const paginatedMeetings = filteredMeetings.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const fetchMeetings = async () => {
    try {
      const res = await fetch('/api/meetings');
      if (res.ok) {
        const data = await res.json();
        setMeetings(data);
      } else if (res.status === 401) {
        console.error('Session expired or unauthorized');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
    const interval = setInterval(fetchMeetings, 5000);
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
    <>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-2">
            Overview of your autonomous agents.
          </p>
        </div>
        <Button onClick={() => setIsNewMeetingOpen(true)} className="gap-2 shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95">
          <Plus className="h-4 w-4" /> New Agent
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-8">
        <StatCard
          title="Active Agents"
          value={stats.running}
          icon={<Activity className="h-4 w-4" />}
          description="Currently running"
          trend={stats.running > 0 ? { value: 100, isPositive: true } : undefined}
        />
        <StatCard
          title="Completed"
          value={stats.completed}
          icon={<CheckCircle2 className="h-4 w-4" />}
          description="Successfully finished"
        />
        <StatCard
          title="Failed"
          value={stats.failed}
          icon={<AlertCircle className="h-4 w-4" />}
          description="Crashed or failed"
        />
        <StatCard
          title="Total Meetings"
          value={stats.total}
          icon={<FileText className="h-4 w-4" />}
          description="All time"
        />
        <StatCard
          title="Avg. Duration"
          value={`${stats.avgDuration}m`}
          icon={<Clock className="h-4 w-4" />}
          description="Per session"
        />
      </div>

      {/* Agents Table */}
      <Card className="shadow-sm">
        <CardHeader className="border-b bg-muted/10 p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl">Recent Agents</CardTitle>
              <CardDescription>List of running and recent agent sessions.</CardDescription>
            </div>
            
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setCurrentPage(1); }}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue placeholder="Filter Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="stopped">Stopped</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>

              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 gap-2 text-xs"
                onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              >
                <ArrowUpDown className="h-3 w-3" />
                {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center items-center p-12">
              <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredMeetings.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                <Plus className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="text-lg font-medium">No agents found</p>
              <p className="text-sm mt-1">Start your first agent to see it here!</p>
              <div className="mt-4">
                <Button onClick={() => setIsNewMeetingOpen(true)} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" /> Create Agent
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableHead className="font-semibold w-[100px]">Status</TableHead>
                    <TableHead className="font-semibold">Meeting URL</TableHead>
                    <TableHead className="font-semibold">Created</TableHead>
                    <TableHead className="text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence mode="popLayout">
                    {paginatedMeetings.map((meeting) => (
                      <motion.tr
                        key={meeting.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="group hover:bg-muted/30 transition-colors border-b"
                      >
                        <TableCell>
                          <Badge 
                            variant={
                                meeting.status === 'running' ? 'default' : 
                                meeting.status === 'failed' ? 'destructive' : 
                                'secondary'
                            }
                            className="capitalize"
                          >
                            {meeting.status === 'running' && (
                              <span className="relative flex h-2 w-2 mr-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-foreground opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-foreground"></span>
                              </span>
                            )}
                            {meeting.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm max-w-[300px] truncate" title={meeting.url}>
                          {meeting.url}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(meeting.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" onClick={() => setLogViewerMeeting(meeting)} className="gap-1.5 h-8">
                                <Terminal className="h-3.5 w-3.5" /> Logs
                            </Button>
                            {meeting.summary && (
                              <Button variant="outline" size="sm" onClick={() => setSelectedMeeting(meeting)} className="gap-1.5 h-8">
                                <FileText className="h-3.5 w-3.5" /> Summary
                              </Button>
                            )}
                            {meeting.status === 'running' && (
                              <Button variant="destructive" size="sm" onClick={() => handleStop(meeting.id)} className="gap-1.5 h-8">
                                <StopCircle className="h-3.5 w-3.5" /> Stop
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </TableBody>
              </Table>
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-4 border-t">
                  <div className="text-xs text-muted-foreground">
                    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredMeetings.length)} of {filteredMeetings.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs font-medium min-w-[3rem] text-center">
                      {currentPage} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* New Meeting Dialog */}
      <NewMeetingDialog 
        open={isNewMeetingOpen} 
        onOpenChange={setIsNewMeetingOpen} 
        onSuccess={fetchMeetings} 
      />

      {/* Summary Dialog */}
      <Dialog open={!!selectedMeeting} onOpenChange={(open) => { if (!open) setSelectedMeeting(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Meeting Summary</DialogTitle>
            <DialogDescription>
              {selectedMeeting && `${new Date(selectedMeeting.created_at).toLocaleString()} - ${selectedMeeting.url}`}
            </DialogDescription>
          </DialogHeader>
          {selectedMeeting && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Summary</h3>
                <div className="bg-muted p-4 rounded-md text-sm whitespace-pre-wrap leading-relaxed">
                  {selectedMeeting.summary || "No summary generated."}
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Transcript / Logs</h3>
                <div className="bg-muted p-4 rounded-md text-xs font-mono whitespace-pre-wrap h-64 overflow-y-auto">
                  {fetchedTranscript}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Logs Dialog */}
      <Dialog open={!!logViewerMeeting} onOpenChange={(open) => { if (!open) setLogViewerMeeting(null); }}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Live Logs</DialogTitle>
            <DialogDescription>
              {logViewerMeeting && `${new Date(logViewerMeeting.created_at).toLocaleString()} - ${logViewerMeeting.url}`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 bg-black text-green-400 p-4 rounded-md font-mono text-xs overflow-auto whitespace-pre-wrap">
            {liveLogs}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
