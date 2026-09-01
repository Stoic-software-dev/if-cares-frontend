import { ROLES } from '@/constants';
import { dateToYmd } from './dates';

// Maps the v2 Role enum to the numeric codes the existing UI compares against
// (ROLES.Admin === 3202, ROLES.User === 5670 in src/constants).
export function toLegacyRole(role) {
  return role === 'ADMIN' ? ROLES.Admin : ROLES.User;
}

// Rebuilds the legacy `assignedSite` string: 'all' or 'Site A,Site B'.
export function toLegacyAssignedSite(user) {
  if (user.role === 'ADMIN' || user.allSites) return 'all';
  const names = (user.sites || [])
    .map((us) => us.site?.name)
    .filter(Boolean);
  return names.join(',');
}

// The exact user object the UI stores in localStorage['user'].
export function toLegacyUser(user, expiresAt) {
  return {
    // Additive to the legacy shape. Without it the screens cannot tell which row
    // is the signed-in account: /admin/users compared `user.id` against a
    // session object that never had one, so every admin was offered a
    // "Deactivate" button on their own row that the server then refused.
    id: user.id,
    name: user.name,
    lastname: user.lastname,
    email: user.email,
    role: toLegacyRole(user.role),
    assignedSite: toLegacyAssignedSite(user),
    ...(expiresAt ? { expiresAt } : {}),
  };
}

// Legacy roster row for GET /api/students — birthdate must be '' (not null)
// when absent because the UI checks `student.birthdate != ''`.
export function toLegacyStudent(student) {
  return {
    id: student.id,
    name: student.name,
    age: student.age ?? '',
    site: student.site.name,
    spreadsheetId: student.site.legacySpreadsheetId ?? student.site.id,
    birthdate: student.birthdate ? dateToYmd(student.birthdate) : '',
  };
}

export function toLegacySiteListItem(site) {
  return {
    name: site.name,
    spreadsheetId: site.legacySpreadsheetId ?? site.id,
    // Additive: legacy callers ignore it. `state` is the column the backend
    // filters claims by, and the screens used to guess it from the name - which
    // is how a consolidated claim came to promise one set of sites and print
    // another.
    state: site.state ?? '',
  };
}
