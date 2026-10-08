import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSeeMenu, findSameName, menusFor } from '../src/lib/menu-access.mjs';

const files = [{ id: 'old' }, { id: 'tx' }, { id: 'two' }];
const audience = new Map([
  ['tx', new Set(['site-a'])],
  ['two', new Set(['site-b', 'site-c'])],
]);
const site = (...ids) => ({ all: false, siteIds: new Set(ids) });

test('a menu without chosen sites is for every site', () => {
  assert.equal(canSeeMenu('old', audience, site('site-z')), true);
  assert.equal(canSeeMenu('old', audience, site()), true);
});

test('a site sees its own menus and not the ones for other sites', () => {
  assert.deepEqual(menusFor(files, audience, site('site-a')).map((f) => f.id), ['old', 'tx']);
  assert.deepEqual(menusFor(files, audience, site('site-c')).map((f) => f.id), ['old', 'two']);
});

test('an account with several sites sees the menus of any of them', () => {
  assert.deepEqual(menusFor(files, audience, site('site-a', 'site-b')).map((f) => f.id), ['old', 'tx', 'two']);
});

test('an account with no sites sees only the menus for every site', () => {
  assert.deepEqual(menusFor(files, audience, site()).map((f) => f.id), ['old']);
});

test('the office and all-site accounts see every menu', () => {
  assert.equal(menusFor(files, audience, { all: true, siteIds: new Set() }).length, 3);
});

test('a menu name already in use is found regardless of case, spacing or extension', () => {
  const list = [{ id: '1', name: 'October 2026 Menu.pdf' }];
  assert.equal(findSameName(list, 'october  2026 menu.docx')?.id, '1');
  assert.equal(findSameName(list, 'November 2026 Menu.pdf'), null);
});
