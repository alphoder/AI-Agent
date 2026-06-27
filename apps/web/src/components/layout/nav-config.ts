import {
  LayoutDashboard, Mic, AudioLines, BarChart3, Target, Route, Trophy, Flag,
  BookOpen, FileText, Users, Building2, Settings, CreditCard, LifeBuoy, type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  soon?: boolean; // section is scaffolded ("Coming soon")
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** The full platform IA — breadth on purpose. Real pages where they exist; the
 *  rest render a polished "Coming soon" section so the product reads as broad. */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Workspace',
    items: [
      { href: '/home', label: 'Overview', icon: LayoutDashboard },
      { href: '/scenarios', label: 'Practice', icon: Mic },
      { href: '/live', label: 'Live Room', icon: AudioLines },
    ],
  },
  {
    title: 'Growth',
    items: [
      { href: '/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/skills', label: 'Skills', icon: Target },
      { href: '/journey', label: 'Journey', icon: Route },
      { href: '/achievements', label: 'Achievements', icon: Trophy },
      { href: '/goals', label: 'Goals', icon: Flag },
    ],
  },
  {
    title: 'Content',
    items: [
      { href: '/library', label: 'Library', icon: BookOpen },
      { href: '/reports', label: 'Reports', icon: FileText },
    ],
  },
  {
    title: 'Scale',
    items: [
      { href: '/community', label: 'Community', icon: Users },
      { href: '/teams', label: 'Teams', icon: Building2 },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/settings', label: 'Settings', icon: Settings },
      { href: '/billing', label: 'Billing', icon: CreditCard },
      { href: '/help', label: 'Help', icon: LifeBuoy },
    ],
  },
];
