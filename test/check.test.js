// Runs scripts/check.mjs, so `npm test` also checks every deal and
// problem, and that no problem id has gone.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('every problem file passes the checker', () => {
  const script = new URL('../scripts/check.mjs', import.meta.url).pathname;
  const { status, stdout, stderr } = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(status, 0, stderr || stdout);
});
