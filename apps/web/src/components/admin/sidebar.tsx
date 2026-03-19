'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, Drama, ClipboardList, BarChart3, Settings } from 'lucide-react';

function LogoMark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="32" height="32" rx="8" fill="currentColor" fillOpacity="0.15" />
      <path
        d="M16 6C10.477 6 6 10.477 6 16s4.477 10 10 10 10-4.477 10-10S21.523 6 16 6zm0 3a3 3 0 110 6 3 3 0 010-6zm0 14.2a7.2 7.2 0 01-6-3.22c.03-1.99 4-3.08 6-3.08s5.97 1.09 6 3.08a7.2 7.2 0 01-6 3.22z"
        fill="currentColor"
        fillOpacity="0.9"
      />
    </svg>
  );
}

const navItems = [
  { href: '/avatars', label: 'Avatars', icon: Users },
  { href: '/personas', label: 'Personas', icon: Drama },
  { href: '/scenarios', label: 'Scenarios', icon: ClipboardList },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

interface AdminSidebarProps {
  onNavigate?: () => void;
}

export default function AdminSidebar({ onNavigate }: AdminSidebarProps) {
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
        <p className="text-[11px] text-muted-foreground">Tenant: Acme Corp</p>
        <p className="text-[11px] text-muted-foreground/60 mt-0.5">v1.0.0</p>
      </div>
    </nav>
  );
}
