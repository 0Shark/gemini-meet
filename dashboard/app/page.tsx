'use client';

import { AppLayout } from '@/components/app-layout';
import { MeetingDashboard } from '@/components/meeting-dashboard';

export default function Home() {
  return (
    <AppLayout>
      <MeetingDashboard />
    </AppLayout>
  );
}
