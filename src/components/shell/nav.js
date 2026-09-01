import {
  BellRing,
  Bug,
  Building2,
  CalendarOff,
  CalendarDays,
  CalendarRange,
  FileText,
  Inbox,
  UtensilsCrossed,
  Users,
} from 'lucide-react';
import { canSeeMonitoring } from '@/lib/monitoring-access';

// One source of truth for navigation. `primary` items stay on the phone's
// bottom bar and on the desktop bar at every width; the rest live in More.
const STAFF_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: CalendarDays, primary: true },
  { key: 'menus', label: 'Menus', href: '/menus', icon: UtensilsCrossed, primary: true },
  { key: 'requests', label: 'Requests', href: '/requests', icon: Inbox, primary: true },
];

const ADMIN_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: CalendarDays, primary: true },
  { key: 'sites', label: 'Sites', href: '/admin/sites', icon: Building2, primary: true },
  { key: 'calendar', label: 'Calendar', href: '/admin/calendar', icon: CalendarRange, primary: true },
  { key: 'reports', label: 'Reports', href: '/admin/reports', icon: FileText, primary: true },
  { key: 'inbox', label: 'Requests', href: '/admin/requests', icon: Inbox, primary: false },
  { key: 'users', label: 'Users', href: '/admin/users', icon: Users, primary: false },
  { key: 'menus', label: 'Menus', href: '/menus', icon: UtensilsCrossed, primary: false },
  { key: 'holidays', label: 'Holidays', href: '/admin/holidays', icon: CalendarOff, primary: false },
  { key: 'reminders', label: 'Reminders', href: '/admin/reminders', icon: BellRing, primary: false },
  { key: 'monitoring', label: 'Client errors', href: '/admin/monitoring', icon: Bug, primary: false },
];

export function navItemsFor(admin, user) {
  if (!admin) return STAFF_ITEMS;
  // Client errors is a developer entry: everyone else never sees it exists.
  return canSeeMonitoring(user) ? ADMIN_ITEMS : ADMIN_ITEMS.filter((item) => item.key !== 'monitoring');
}

// Which nav entry owns a given pathname, so the active state survives deep
// links (/admin/sites/<name> still lights up Sites).
export function activeKeyForPath(pathname = '') {
  if (pathname.startsWith('/admin/sites')) return 'sites';
  if (pathname.startsWith('/admin/calendar')) return 'calendar';
  if (pathname.startsWith('/admin/reports')) return 'reports';
  if (pathname.startsWith('/admin/requests')) return 'inbox';
  if (pathname.startsWith('/admin/users')) return 'users';
  if (pathname.startsWith('/admin/holidays')) return 'holidays';
  if (pathname.startsWith('/admin/reminders')) return 'reminders';
  if (pathname.startsWith('/admin/monitoring')) return 'monitoring';
  if (pathname.startsWith('/menus')) return 'menus';
  if (pathname.startsWith('/requests')) return 'requests';
  if (pathname.startsWith('/counts') || pathname.startsWith('/meal-count') || pathname.startsWith('/dashboard')) {
    return 'dashboard';
  }
  return '';
}
