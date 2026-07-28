import { Mic, AudioLines, FileText, BarChart3, Building2, Settings, Route, Wallet, CheckCircle2, Trophy, UserRound, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** v2 IA — see docs/PRODUCT-V2.md §1. */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Train',
    items: [
      { href: '/journey', label: 'My Journey', icon: Route },
      { href: '/scenarios', label: 'Scenarios', icon: Mic },
      { href: '/live', label: 'Live Room', icon: AudioLines },
    ],
  },
  {
    title: 'Review',
    items: [
      { href: '/completed', label: 'Completed', icon: CheckCircle2 },
      { href: '/reports', label: 'Reports', icon: FileText },
      { href: '/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'Team',
    items: [
      { href: '/teams', label: 'Teams', icon: Building2 },
      { href: '/competition', label: 'Competition', icon: Trophy },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/wallet', label: 'Balance', icon: Wallet },
      { href: '/settings', label: 'Settings', icon: Settings },
      { href: '/profile', label: 'My Profile', icon: UserRound },
    ],
  },
];
