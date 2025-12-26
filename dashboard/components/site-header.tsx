'use client';

import { UserNav } from '@/components/user-nav';
import { ModeToggle } from '@/components/mode-toggle';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="border-b bg-card h-16 sticky top-0 z-10 flex items-center px-6 justify-between">
      <div className="flex items-center gap-4 md:hidden">
        <Button variant="ghost" size="icon">
          <Menu className="h-5 w-5" />
        </Button>
        <span className="font-semibold">Gemini Meet</span>
      </div>
      
      <div className="flex-1" /> {/* Spacer */}

      <div className="flex items-center gap-4">
        <ModeToggle />
        <UserNav />
      </div>
    </header>
  );
}
