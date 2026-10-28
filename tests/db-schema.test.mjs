import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schemaFromUrl } from '../src/lib/db-schema.mjs';

const base = 'postgresql://user:pass@host:6543/postgres?pgbouncer=true';

test('the schema comes from the connection string', () => {
  assert.equal(schemaFromUrl(`${base}&schema=regular_year`), 'regular_year');
  assert.equal(schemaFromUrl(`${base}&schema=regular_year_prod`), 'regular_year_prod');
});

test('without one it is public, as Prisma does', () => {
  assert.equal(schemaFromUrl(base), 'public');
});

test('a name that is not a plain identifier is refused', () => {
  assert.throws(() => schemaFromUrl(`${base}&schema=x";drop`));
  assert.throws(() => schemaFromUrl(undefined));
});
