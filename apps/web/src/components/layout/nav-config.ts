import { Mic, AudioLines, FileText, Settings, LifeBuoy, type LucideIcon } from 'lucide-react';

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

/** Lean IA for the insurance sales-training focus — practice, review, done.
 *  No dashboards or vanity sections. */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Train',
    items: [
      { href: '/scenarios', label: 'Practice', icon: Mic },
      { href: '/live', label: 'Live Room', icon: AudioLines },
    ],
  },
  {
    title: 'Review',
    items: [
      { href: '/reports', label: 'Reports', icon: FileText },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/settings', label: 'Settings', icon: Settings },
      { href: '/help', label: 'Help', icon: LifeBuoy },
    ],
  },
];
