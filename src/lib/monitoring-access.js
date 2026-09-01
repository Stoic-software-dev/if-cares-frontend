// Who gets the client error screen.
//
// Monitoring is a developer tool, not something IF Cares staff should have to
// look at: an admin seeing a list of stack traces learns nothing and worries
// for no reason. The list is NEXT_PUBLIC so the same rule decides the nav entry
// in the browser and the API answer on the server, instead of two copies that
// can drift.
const ALLOWED = (process.env.NEXT_PUBLIC_MONITORING_EMAILS || 'miqueas@stoicsoftware.io')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

export function canSeeMonitoring(user) {
  const email = (typeof user === 'string' ? user : (user?.email ?? '')).trim().toLowerCase();
  return Boolean(email) && ALLOWED.includes(email);
}
