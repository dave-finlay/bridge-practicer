// Problems: flattening the lesson files into a list, grading an answer,
// keeping progress, and picking the problems for a session. No UI code.
//
// Each lesson file (problems/<lesson>.json) holds deals, and each deal
// holds problems. See PLAN.md for the format.

import { seatOfCall } from './auction.js';

// The lesson files the app loads, in problems/.
export const LESSONS = ['texas'];

// The names of the conventions that problems are tagged with, in the
// order the home screen lists them.
export const CONVENTIONS = {
  stayman: 'Stayman',
  jacoby: 'Jacoby transfers',
  texas: 'Texas transfers',
  'minor-transfers': 'Minor suit transfers',
  nmf: 'New minor forcing',
  'negative-double': 'Negative doubles',
  'jacoby-2nt': 'Jacoby 2NT',
  rkcb: 'RKCB',
  'control-bids': 'Control bids',
};

export const conventionName = (tag) => CONVENTIONS[tag] ?? tag;

// Every problem in the lessons, each with its deal and the seat that calls.
export function flatten(lessons) {
  return lessons.flatMap((lesson) =>
    lesson.deals.flatMap((deal) =>
      deal.problems.map((problem) => ({
        id: problem.id,
        lesson: lesson.lesson,
        deal,
        problem,
        seat: seatOfCall(deal.dealer, problem.at),
      })),
    ),
  );
}

// 'best', 'acceptable' or 'wrong'.
export function grade(problem, call) {
  if (call === problem.answer) return 'best';
  if (problem.acceptable && call in problem.acceptable) return 'acceptable';
  return 'wrong';
}

// Progress: each problem's record is { id, level, seen, lastAt, lastGrade }.
// A wrong answer sets the level to 0 and a right or acceptable one raises
// it, and the level sets how long until the problem is due again.
const DAY_MS = 24 * 60 * 60 * 1000;
export const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30];

// The problem's record after answering with `result` at time `now`.
export function updateProgress(record, id, result, now) {
  const level = result === 'wrong' ? 0 : Math.min((record?.level ?? 0) + 1, INTERVAL_DAYS.length - 1);
  return { id, level, seen: (record?.seen ?? 0) + 1, lastAt: now, lastGrade: result };
}

// When the problem is next due: some time after it was last answered,
// longer the higher its level.
export function dueAt(record) {
  return record.lastAt + INTERVAL_DAYS[record.level] * DAY_MS;
}

// Up to `size` problems in random order, at most one from each deal, so
// that no problem gives away another's answer. With `progress` (records
// by problem id), problems never seen come first, then those answered
// wrong last time, then those due soonest, at random among equals.
// `random` and `now` are for tests.
export function pickSession(problems, size, { progress = {}, random = Math.random, now = Date.now() } = {}) {
  const shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  const rank = ({ id }) => {
    const record = progress[id];
    if (!record) return [0, 0];
    if (record.lastGrade === 'wrong') return [1, 0];
    return [2, dueAt(record)];
  };
  // Sorting is stable, so the shuffle decides among equals.
  const ordered = shuffle([...problems])
    .map((item) => ({ item, key: rank(item) }))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1])
    .map(({ item }) => item);

  const deals = new Set();
  const picked = [];
  for (const item of ordered) {
    if (picked.length === size) break;
    if (deals.has(item.deal.id)) continue;
    deals.add(item.deal.id);
    picked.push(item);
  }
  // Shuffled again, so the new problems aren't always first.
  return shuffle(picked);
}

// How the problems have gone so far: how many have been answered, how
// many were right (or acceptable) the last time, and when the latest was.
export function progressSummary(problems, progress) {
  const records = problems.map(({ id }) => progress[id]).filter(Boolean);
  return {
    seen: records.length,
    right: records.filter((record) => record.lastGrade !== 'wrong').length,
    lastAt: records.length ? Math.max(...records.map((record) => record.lastAt)) : null,
  };
}

// The conventions the problems test, in CONVENTIONS order with any others
// after, each with how many problems test it: [{ tag, name, count }].
export function conventionsIn(problems) {
  const counts = new Map();
  for (const { problem } of problems) {
    for (const tag of problem.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  const order = Object.keys(CONVENTIONS);
  const rank = (tag) => (order.includes(tag) ? order.indexOf(tag) : order.length);
  return [...counts.keys()]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((tag) => ({ tag, name: conventionName(tag), count: counts.get(tag) }));
}

// The problems that test any of `tags`, or all of them if `tags` is empty.
export function withTags(problems, tags) {
  if (!tags.length) return problems;
  return problems.filter(({ problem }) => problem.tags.some((tag) => tags.includes(tag)));
}

// How many deals the problems come from: the most a session can hold.
export function dealCount(problems) {
  return new Set(problems.map((item) => item.deal.id)).size;
}
