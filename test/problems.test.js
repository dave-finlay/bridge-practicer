import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flatten, grade, pickSession } from '../js/problems.js';

const texas = JSON.parse(readFileSync(new URL('../problems/texas.json', import.meta.url)));
const problems = flatten([texas]);

// A repeatable stand-in for Math.random.
function seeded(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

test('flatten lists every problem with its deal, lesson and seat', () => {
  assert.equal(problems.length, 16);
  const first = problems.find((p) => p.id === 'texas-1a');
  assert.equal(first.lesson, 'texas');
  assert.equal(first.deal.id, 'texas-1');
  assert.equal(first.seat, 'S');
  assert.equal(problems.find((p) => p.id === 'texas-6c').seat, 'E');
});

test('grade: the answer is best, listed alternatives acceptable, the rest wrong', () => {
  const problem = problems.find((p) => p.id === 'texas-6c').problem;
  assert.equal(grade(problem, '4N'), 'best');
  assert.equal(grade(problem, '6S'), 'acceptable');
  assert.equal(grade(problem, 'P'), 'wrong');
  assert.equal(grade(problems[0].problem, '4S'), 'wrong');
});

test('pickSession takes at most one problem per deal', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const session = pickSession(problems, 10, seeded(seed));
    assert.equal(session.length, 8); // only 8 deals
    assert.equal(new Set(session.map((p) => p.deal.id)).size, 8);
  }
});

test('pickSession stops at the size asked for, and varies the problems', () => {
  assert.equal(pickSession(problems, 3, seeded(7)).length, 3);
  const firsts = new Set();
  for (let seed = 1; seed <= 20; seed++) firsts.add(pickSession(problems, 8, seeded(seed))[0].id);
  assert.ok(firsts.size > 3);
});
