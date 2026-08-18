const STAFF_ITEMS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Menus', href: '/menus' },
  { label: 'Requests', href: '/requests' },
];

const ADMIN_ITEMS = [
  ...STAFF_ITEMS,
  { label: 'Users', href: '/admin/users' },
  { label: 'Inbox', href: '/admin/requests' },
];

export function navItemsFor(admin) {
  return admin ? ADMIN_ITEMS : STAFF_ITEMS;
}
