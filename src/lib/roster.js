// Next roster number for a site, computed inside the caller's transaction.
export async function nextRosterNumber(tx, siteId) {
  const max = await tx.student.aggregate({ where: { siteId }, _max: { number: true } });
  return (max._max.number ?? 0) + 1;
}
