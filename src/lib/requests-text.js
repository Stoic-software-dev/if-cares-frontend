// A request read as one line, on the server. The client has its own formatter in
// `lib/requests.js`; this is the same idea for messages that leave the app.
export function requestDetailText(request) {
  if (request.time) return `new service time ${request.time.slice(0, 5)}`;
  if (request.amount) return `${request.amount} units`;
  return '';
}
