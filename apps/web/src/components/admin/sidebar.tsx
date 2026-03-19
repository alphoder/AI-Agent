'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/avatars', label: 'Avatars', icon: '👤' },
  { href: '/personas', label: 'Personas', icon: '🎭' },
  { href: '/scenarios', label: 'Scenarios', icon: '📋' },
  { href: '/analytics', label: 'Analytics', icon: '📊' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col h-full py-4">
      <div className="px-4 mb-6">
        <h2 className="text-lg font-bold tracking-tight">AI Avatar Platform</h2>
        <p className="text-xs text-muted-foreground">Admin Dashboard</p>
      </div>

      <div className="flex-1 space-y-1 px-2">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="px-4 pt-4 border-t">
        <p className="text-xs text-muted-foreground">v1.0.0</p>
      </div>
    </nav>
  );
}
