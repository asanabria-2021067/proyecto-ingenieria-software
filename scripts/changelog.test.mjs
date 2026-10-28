import test from 'node:test';
import assert from 'node:assert/strict';
import { sprintOf, tipoOf, OTROS } from './changelog.mjs';

test('limites de sprint', () => {
  assert.equal(sprintOf('2026-03-29'), 'Sprint 1');
  assert.equal(sprintOf('2026-04-08'), 'Sprint 1');
  assert.equal(sprintOf('2026-04-09'), 'Sprint 2'); // hueco -> siguiente
  assert.equal(sprintOf('2026-06-15'), 'Sprint 5');
  assert.equal(sprintOf('2026-10-13'), 'Sprint 9');
  assert.equal(sprintOf('2026-10-14'), 'Sprint 10');
  assert.equal(sprintOf('2026-10-27'), 'Sprint 10');
  assert.equal(sprintOf('2026-11-30'), 'Sprint 10'); // posterior al ultimo
  assert.equal(sprintOf('2026-01-19'), OTROS);
  assert.equal(sprintOf('2026-03-28'), OTROS);
});

test('tipo de commit', () => {
  assert.equal(tipoOf('feat(x): algo'), 'feat');
  assert.equal(tipoOf('Fix!: algo'), 'fix');
  assert.equal(tipoOf('Add files via upload'), 'Otros');
});
