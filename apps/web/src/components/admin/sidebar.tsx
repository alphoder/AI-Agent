'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, Drama, ClipboardList, BarChart3, Settings, LayoutDashboard, GraduationCap } from 'lucide-react';
import { LogoMark } from '@/components/ui/logo-mark';

const navItems = [
  { href: '/overview', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/learners', label: 'Learners', icon: GraduationCap },
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
    <nav className="flex flex-col h-full bg-slate-900 py-5">
      {/* Logo */}
      <div className="px-5 mb-7">
        <Link href="/overview" className="flex items-center gap-3" aria-label="Home">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 ring-1 ring-indigo-400/30">
            <LogoMark className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight text-white">
              Avatar Platform
            </p>
            <p className="text-[11px] text-slate-400">Admin Console</p>
          </div>
        </Link>
      </div>

      {/* Section label */}
      <div className="px-5 mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Navigation
        </p>
      </div>

      {/* Navigation */}
      <div className="flex-1 space-y-0.5 px-3">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-label={item.label}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150 ${
                isActive
                  ? 'bg-indigo-500/15 text-indigo-300 font-medium ring-1 ring-indigo-500/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon className={`h-4.5 w-4.5 shrink-0 ${isActive ? 'text-indigo-400' : ''}`} style={{ width: '18px', height: '18px' }} />
              {item.label}
              {isActive && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400" />
              )}
            </Link>
          );
        })}
      </div>

      {/* Bottom section */}
      <div className="mx-3 mt-4 rounded-lg border border-slate-700/50 bg-slate-800/50 px-4 py-3">
        {tenantName && (
          <p className="text-[11px] font-medium text-slate-300 truncate">
            {tenantName}
          </p>
        )}
        <p className="text-[11px] text-slate-500 mt-0.5">v1.0.0</p>
      </div>
    </nav>
  );
}
