import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  conventionsIn, dealCount, dueAt, flatten, grade, nextDue, pickSession, progressSummary, readyNow,
  updateProgress, withTags,
} from '../js/problems.js';

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

test('flatten leaves out deals set aside', () => {
  const lesson = { lesson: 'texas', deals: [{ ...texas.deals[0], setAside: 'to rethink' }, texas.deals[1]] };
  assert.deepEqual(flatten([lesson]).map((p) => p.deal.id), flatten([{ ...texas, deals: [texas.deals[1]] }]).map((p) => p.deal.id));
  assert.ok(flatten([lesson]).every((p) => p.deal.id !== texas.deals[0].id));
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
    const session = pickSession(problems, 10, { random: seeded(seed) });
    assert.equal(session.length, 8); // only 8 deals
    assert.equal(new Set(session.map((p) => p.deal.id)).size, 8);
  }
});

test('pickSession stops at the size asked for, and varies the problems', () => {
  assert.equal(pickSession(problems, 3, { random: seeded(7) }).length, 3);
  const firsts = new Set();
  for (let seed = 1; seed <= 20; seed++) firsts.add(pickSession(problems, 8, { random: seeded(seed) })[0].id);
  assert.ok(firsts.size > 3);
});

test('conventionsIn lists the tags in the usual order, with counts and names', () => {
  assert.deepEqual(conventionsIn(problems), [
    { tag: 'jacoby', name: 'Jacoby transfers', count: 2 },
    { tag: 'texas', name: 'Texas transfers', count: 15 },
    { tag: 'rkcb', name: 'RKCB', count: 2 },
  ]);
});

test('withTags keeps problems with any of the tags, or all for none', () => {
  assert.equal(withTags(problems, []).length, 16);
  assert.deepEqual(withTags(problems, ['rkcb']).map((p) => p.id), ['texas-6c', 'texas-6d']);
  assert.equal(withTags(problems, ['rkcb', 'jacoby']).length, 4);
});

test('dealCount counts the deals the problems come from', () => {
  assert.equal(dealCount(problems), 8);
  assert.equal(dealCount(withTags(problems, ['rkcb', 'jacoby'])), 1);
});

test('two versions of a club board count as one board', () => {
  const club = JSON.parse(readFileSync(new URL('../problems/club.json', import.meta.url)));
  const both = flatten([club]).filter((p) => p.deal.source === 'Alpine Club 2026-10-27, board 13');
  assert.equal(new Set(both.map((p) => p.deal.id)).size, 2);
  assert.equal(dealCount(both), 1);
  for (let seed = 1; seed <= 10; seed++) {
    assert.equal(pickSession(both, 10, { random: seeded(seed) }).length, 1);
  }
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 15);

test('updateProgress raises the level when right and resets it when wrong', () => {
  let record = updateProgress(undefined, 'texas-1a', 'best', NOW);
  assert.deepEqual(record, { id: 'texas-1a', level: 1, seen: 1, lastAt: NOW, lastGrade: 'best' });
  record = updateProgress(record, 'texas-1a', 'acceptable', NOW + DAY);
  assert.equal(record.level, 2);
  assert.equal(record.seen, 2);
  record = updateProgress(record, 'texas-1a', 'wrong', NOW + 2 * DAY);
  assert.equal(record.level, 0);
  assert.equal(record.lastGrade, 'wrong');
  for (let i = 0; i < 10; i++) record = updateProgress(record, 'texas-1a', 'best', NOW);
  assert.equal(record.level, 5); // the top level
  assert.equal(dueAt(record), NOW + 30 * DAY);
});

// Progress where every problem but `except` was answered right on day 0.
function allSeen(except = []) {
  return Object.fromEntries(problems
    .filter(({ id }) => !except.includes(id))
    .map(({ id }) => [id, updateProgress(undefined, id, 'best', NOW)]));
}

test('pickSession puts problems never seen first', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const ids = pickSession(problems, 2, { progress: allSeen(['texas-3a', 'texas-7b']), random: seeded(seed), now: NOW + DAY })
      .map(({ id }) => id);
    assert.deepEqual(ids.sort(), ['texas-3a', 'texas-7b']);
  }
});

test('pickSession puts problems answered wrong next, then those due longest', () => {
  const progress = allSeen(['texas-8a']); // 8a is new
  progress['texas-2a'] = updateProgress(progress['texas-2a'], 'texas-2a', 'wrong', NOW);
  // Deal 3's problems were answered a day later, so they're due a day
  // after the others.
  for (const id of ['texas-3a', 'texas-3b']) progress[id] = updateProgress(undefined, id, 'best', NOW + DAY);
  for (let seed = 1; seed <= 10; seed++) {
    const pick = (size) => pickSession(problems, size, { progress, random: seeded(seed), now: NOW + 3 * DAY })
      .map(({ id }) => id).sort();
    assert.deepEqual(pick(2), ['texas-2a', 'texas-8a']);
    assert.ok(pick(7).every((id) => !id.startsWith('texas-3')));
    assert.equal(pick(8).filter((id) => id.startsWith('texas-3')).length, 1);
  }
});

test('pickSession leaves out problems not due yet, so a set can be short', () => {
  const progress = allSeen(['texas-8a']); // 8a is new
  progress['texas-2a'] = updateProgress(progress['texas-2a'], 'texas-2a', 'wrong', NOW);
  // Deal 5's problems have been right twice, so they're not due for 3 days.
  for (const id of ['texas-5a', 'texas-5b']) progress[id] = updateProgress(progress[id], id, 'best', NOW);
  // A day on, the rest are due again; deal 5 isn't.
  for (let seed = 1; seed <= 10; seed++) {
    const ids = pickSession(problems, 10, { progress, random: seeded(seed), now: NOW + DAY }).map(({ id }) => id);
    assert.equal(ids.length, 7);
    assert.ok(ids.every((id) => !id.startsWith('texas-5')));
  }
  // The same day, only the new and the missed ones are ready.
  const sameDay = pickSession(problems, 10, { progress, random: seeded(1), now: NOW }).map(({ id }) => id).sort();
  assert.deepEqual(sameDay, ['texas-2a', 'texas-8a']);
});

test('readyNow and nextDue: what can be practised now, and when more can', () => {
  const progress = allSeen();
  assert.equal(readyNow(problems, progress, NOW).length, 0);
  assert.equal(nextDue(problems, progress, NOW), NOW + DAY);
  assert.equal(readyNow(problems, progress, NOW + DAY).length, 16);
  assert.equal(nextDue(problems, progress, NOW + DAY), null);
  assert.equal(readyNow(problems, {}, NOW).length, 16);
  assert.equal(pickSession(problems, 10, { progress, now: NOW }).length, 0);
});

test('progressSummary counts problems seen and right last time', () => {
  const progress = allSeen(problems.slice(4).map(({ id }) => id)); // the first 4 seen
  progress['texas-1a'] = updateProgress(progress['texas-1a'], 'texas-1a', 'wrong', NOW + DAY);
  assert.deepEqual(progressSummary(problems, progress), { seen: 4, right: 3, lastAt: NOW + DAY });
  assert.deepEqual(progressSummary(problems, {}), { seen: 0, right: 0, lastAt: null });
});
