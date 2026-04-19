'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users, Drama, ClipboardList, BarChart3, Settings, LayoutDashboard,
  GraduationCap, ClipboardCheck, Sparkles,
} from 'lucide-react';
import { LogoMark } from '@/components/ui/logo-mark';

/**
 * Each nav entry carries its own accent (used for the left indicator bar
 * when active) — it ties the sidebar to the domain gradient on the page.
 */
interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  accent: string; // tailwind text-* class for the icon tint when active
  ring: string;   // tailwind bg-* class for the left indicator bar
}

const MAIN_ITEMS: NavItem[] = [
  { href: '/overview',    label: 'Dashboard', icon: LayoutDashboard, accent: 'text-indigo-300', ring: 'bg-indigo-400' },
  { href: '/learners',    label: 'Learners',  icon: GraduationCap,   accent: 'text-emerald-300', ring: 'bg-emerald-400' },
  { href: '/analytics',   label: 'Analytics', icon: BarChart3,       accent: 'text-sky-300',     ring: 'bg-sky-400' },
];

const MANAGE_ITEMS: NavItem[] = [
  { href: '/avatars',     label: 'Avatars',     icon: Users,           accent: 'text-blue-300',   ring: 'bg-blue-400' },
  { href: '/personas',    label: 'Personas',    icon: Drama,           accent: 'text-violet-300', ring: 'bg-violet-400' },
  { href: '/scenarios',   label: 'Scenarios',   icon: ClipboardList,   accent: 'text-amber-300',  ring: 'bg-amber-400' },
  { href: '/assignments', label: 'Assignments', icon: ClipboardCheck,  accent: 'text-rose-300',   ring: 'bg-rose-400' },
];

const SYSTEM_ITEMS: NavItem[] = [
  { href: '/settings', label: 'Settings', icon: Settings, accent: 'text-slate-200', ring: 'bg-slate-300' },
];

interface AdminSidebarProps {
  onNavigate?: () => void;
  tenantName?: string;
}

export default function AdminSidebar({ onNavigate, tenantName }: AdminSidebarProps) {
  const pathname = usePathname();

  const renderItem = (item: NavItem) => {
    const isActive = pathname.startsWith(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-label={item.label}
        className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ${
          isActive
            ? 'bg-slate-800/80 text-white font-medium'
            : 'text-slate-400 hover:bg-slate-800/60 hover:text-white hover:translate-x-0.5'
        }`}
      >
        {/* Active indicator bar on the left */}
        <span
          className={`absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-r-full transition-all ${
            isActive ? `${item.ring} h-6` : 'bg-transparent h-0'
          }`}
        />
        <Icon
          className={`shrink-0 transition-colors ${isActive ? item.accent : 'text-slate-500 group-hover:text-slate-300'}`}
          style={{ width: 18, height: 18 }}
          strokeWidth={2.2}
        />
        <span className="flex-1 truncate">{item.label}</span>
      </Link>
    );
  };

  const renderSection = (label: string, items: NavItem[]) => (
    <div>
      <p className="px-5 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        {label}
      </p>
      <div className="space-y-0.5 px-3">{items.map(renderItem)}</div>
    </div>
  );

  return (
    <nav className="flex flex-col h-full bg-slate-900 py-5">
      {/* Logo */}
      <div className="px-5 mb-7">
        <Link href="/overview" className="flex items-center gap-3 group" aria-label="Home">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/20">
            <LogoMark className="h-5 w-5 text-white" />
            <div className="absolute inset-0 rounded-xl ring-1 ring-white/15" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight text-white truncate">
              Avatar Platform
            </p>
            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" /> Admin console
            </p>
          </div>
        </Link>
      </div>

      {/* Navigation groups */}
      <div className="flex-1 space-y-6 overflow-y-auto thin-scroll">
        {renderSection('Main', MAIN_ITEMS)}
        {renderSection('Manage', MANAGE_ITEMS)}
        {renderSection('System', SYSTEM_ITEMS)}
      </div>

      {/* Footer */}
      <div className="mx-3 mt-4 rounded-lg bg-slate-800/40 border border-slate-700/50 px-4 py-3">
        {tenantName && (
          <p className="text-[11px] font-medium text-slate-200 truncate">{tenantName}</p>
        )}
        <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">v1.0 · production</p>
      </div>
    </nav>
  );
}
