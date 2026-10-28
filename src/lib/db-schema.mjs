// The schema a hand-written query has to name: the one in DATABASE_URL, the same
// one Prisma qualifies its own queries with. Test and production live in the same
// Supabase database (regular_year and regular_year_prod), so a query that names a
// schema of its own reads the other environment's data.
export function schemaFromUrl(url) {
  if (!url) throw new Error('DATABASE_URL is not set.');
  const schema = new URL(url).searchParams.get('schema') || 'public';
  // It goes into the SQL as an identifier, not as a parameter.
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`Unexpected schema name "${schema}" in DATABASE_URL.`);
  return schema;
}
