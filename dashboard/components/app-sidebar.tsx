'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Settings, Box, Database, LogOut, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useSession, signOut } from '@/lib/auth-client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const sidebarItems = [
  {
    title: 'Dashboard',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    title: 'MCP Library',
    href: '/settings',
    icon: Database,
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push('/auth/login');
        },
      },
    });
  };

  return (
    <div className="w-64 border-r bg-card h-screen flex-col hidden md:flex sticky top-0">
      <div className="px-4 border-b h-16 flex items-center">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Box className="h-5 w-5" />
          </div>
          Gemini Meet
        </Link>
      </div>
      <div className="flex-1 py-6 px-4 flex flex-col gap-2">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? 'secondary' : 'ghost'}
                className={cn(
                  'w-full justify-start gap-2 shadow-none hover:shadow-none',
                  isActive && 'bg-accent text-accent-foreground font-medium'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.title}
              </Button>
            </Link>
          );
        })}
      </div>
      <div className="px-4 py-4 border-t">
        {session ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-2 px-4 h-auto py-2 text-left shadow-none hover:shadow-none hover:bg-accent/50">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                  {session.user.image ? (
                    <img src={session.user.image} alt={session.user.name} className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </div>
                <div className="flex flex-col items-start min-w-0">
                  <span className="font-medium text-sm truncate w-full">{session.user.name}</span>
                  <span className="text-[10px] text-muted-foreground break-all leading-tight">{session.user.email}</span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
           <div className="bg-muted/50 rounded-lg p-4 text-xs text-muted-foreground">
             <p className="font-semibold mb-1">Gemini Meet Agent</p>
             <p>Version 1.0.0</p>
           </div>
        )}
      </div>
    </div>
  );
}
