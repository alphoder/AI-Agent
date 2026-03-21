'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, Drama, ClipboardList, BarChart3, Settings, LayoutDashboard } from 'lucide-react';
import { LogoMark } from '@/components/ui/logo-mark';

const navItems = [
  { href: '/overview', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/avatars', label: 'Avatars', icon: Users },
  { href: '/personas', label: 'Personas', icon: Drama },
  { href: '/scenarios', label: 'Scenarios', icon: ClipboardList },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

interface AdminSidebarProps {
  onNavigate?: () => void;
  tenantName?: string;
}

export default function AdminSidebar({ onNavigate, tenantName }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col h-full py-6">
      {/* Logo */}
      <div className="px-5 mb-8">
        <Link href="/avatars" className="flex items-center gap-2.5" aria-label="Home">
          <LogoMark className="h-8 w-8 text-primary" />
          <div>
            <p className="text-sm font-semibold tracking-tight text-foreground">
              Avatar Platform
            </p>
            <p className="text-[11px] text-muted-foreground">Admin Console</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <div className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-label={item.label}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Bottom section */}
      <div className="px-5 pt-4 mt-2 border-t border-border">
        {tenantName && (
          <p className="text-[11px] text-muted-foreground truncate">
            Tenant: {tenantName}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground/60 mt-0.5">v1.0.0</p>
      </div>
    </nav>
  );
}
