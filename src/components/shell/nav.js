import {
  Building2,
  CalendarDays,
  CalendarRange,
  FileText,
  Inbox,
  UtensilsCrossed,
  Users,
} from 'lucide-react';

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
];

export function navItemsFor(admin) {
  return admin ? ADMIN_ITEMS : STAFF_ITEMS;
}

// Which nav entry owns a given pathname, so the active state survives deep
// links (/admin/sites/<name> still lights up Sites).
export function activeKeyForPath(pathname = '') {
  if (pathname.startsWith('/admin/sites')) return 'sites';
  if (pathname.startsWith('/admin/calendar')) return 'calendar';
  if (pathname.startsWith('/admin/reports')) return 'reports';
  if (pathname.startsWith('/admin/requests')) return 'inbox';
  if (pathname.startsWith('/admin/users')) return 'users';
  if (pathname.startsWith('/menus')) return 'menus';
  if (pathname.startsWith('/requests')) return 'requests';
  if (pathname.startsWith('/counts') || pathname.startsWith('/meal-count') || pathname.startsWith('/dashboard')) {
    return 'dashboard';
  }
  return '';
}
