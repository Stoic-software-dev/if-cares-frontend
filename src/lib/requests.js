// The eight request types of the current app, verbatim. The server validates
// against the same list (src/lib/validation.js).
export const REQUEST_TYPES = [
  'Sporks',
  'Meal Increase',
  'Meal Decrease',
  'Change approved meal service time',
  'Condiments',
  'Special Meals',
  'Dietary Restrictions',
  'Amount of milk on hand',
];

export const TYPE_WITH_TIME = 'Change approved meal service time';

// A request carries either a time (service-time change) or an amount.
export function requestDetail(request) {
  if (request?.time) {
    const [h, m] = request.time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  }
  if (request?.amount != null) return `${request.amount} units`;
  return 'No detail';
}

export function requestDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
