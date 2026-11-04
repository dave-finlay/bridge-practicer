// Problems: flattening the problem files into a list, grading an answer,
// keeping progress, and picking the problems for a session. No UI code.
//
// Each problem file holds deals, and each deal holds problems. See
// PLAN.md for the format.

import { seatOfCall } from './auction.js';

// Where the deals come from, in the order the home screen lists them, and
// the files the app loads from each: problems/<origin>/<file>.json.
export const ORIGINS = {
  lessons: {
    name: 'Lessons',
    files: ['stayman', 'texas', 'negative-doubles', 'nmf', 'jacoby-2nt', 'rkcb', 'control-bids', 'jacoby'],
  },
  club: { name: 'Club', files: ['alpine-2026-10-27'] },
  teachers: { name: 'Teachers', files: ['too-strong', 'cuebids'] },
};

// Every problem file's path, with its origin.
export const problemFiles = () => Object.entries(ORIGINS).flatMap(([origin, { files }]) =>
  files.map((file) => ({ origin, path: `problems/${origin}/${file}.json` })));

// The names of the topics that problems are tagged with, in the order the
// home screen lists them: the lessons' conventions, then agreements
// practised from other deals, then general bidding for the rest.
export const TOPICS = {
  stayman: 'Stayman',
  jacoby: 'Jacoby transfers',
  texas: 'Texas transfers',
  'minor-transfers': 'Minor suit transfers',
  nmf: 'New minor forcing',
  'negative-double': 'Negative doubles',
  'jacoby-2nt': 'Jacoby 2NT',
  rkcb: 'RKCB',
  'control-bids': 'Control bids',
  'too-strong': 'Too strong to overcall',
  cuebids: 'Cuebids',
  general: 'General bidding',
};

export const topicName = (tag) => TOPICS[tag] ?? tag;

// The board a deal is. A club board can be in the problems twice, bid two
// ways; both versions share a `source` and count as one board, since one
// version's auction would give away the other's answers.
export const boardOf = (deal) => deal.source ?? deal.id;

// Every problem in the files, each with its deal, its file's origin and
// title, and the seat that calls. Each file is as loaded, plus `origin`.
export function flatten(files) {
  return files.flatMap((file) =>
    file.deals.filter((deal) => !deal.setAside).flatMap((deal) =>
      deal.problems.map((problem) => ({
        id: problem.id,
        origin: file.origin,
        title: file.title,
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

// The problems ready at `now`: those never seen, those answered wrong
// last time, and those due again. The rest were answered right recently
// and wait until they're due.
export function readyNow(problems, progress, now = Date.now()) {
  return problems.filter(({ id }) => !progress[id] || dueAt(progress[id]) <= now);
}

// When the next of the problems not ready is due, or null if none is
// waiting.
export function nextDue(problems, progress, now = Date.now()) {
  const times = problems.map(({ id }) => progress[id]).filter(Boolean).map(dueAt).filter((time) => time > now);
  return times.length ? Math.min(...times) : null;
}

// Up to `size` of the problems ready now, in random order, at most one
// from each deal, so that no problem gives away another's answer. With
// `progress` (records by problem id), problems never seen come first,
// then those answered wrong last time, then those due longest, at random
// among equals. A set can be short: problems not due yet are left out.
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
  const ordered = shuffle(readyNow(problems, progress, now))
    .map((item) => ({ item, key: rank(item) }))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1])
    .map(({ item }) => item);

  const deals = new Set();
  const picked = [];
  for (const item of ordered) {
    if (picked.length === size) break;
    if (deals.has(boardOf(item.deal))) continue;
    deals.add(boardOf(item.deal));
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

// The topics the problems test, in TOPICS order with any others
// after, each with how many problems test it: [{ tag, name, count }].
export function topicsIn(problems) {
  const counts = new Map();
  for (const { problem } of problems) {
    for (const tag of problem.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  const order = Object.keys(TOPICS);
  const rank = (tag) => (order.includes(tag) ? order.indexOf(tag) : order.length);
  return [...counts.keys()]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((tag) => ({ tag, name: topicName(tag), count: counts.get(tag) }));
}

// The problems that test any of `tags`, or all of them if `tags` is empty.
export function withTags(problems, tags) {
  if (!tags.length) return problems;
  return problems.filter(({ problem }) => problem.tags.some((tag) => tags.includes(tag)));
}

// The problems from `origin` ('lessons', 'club' or 'teachers'), or all of
// them if `origin` is empty.
export function fromOrigin(problems, origin) {
  return origin ? problems.filter((item) => item.origin === origin) : problems;
}

// How many deals the problems come from: the most a session can hold.
export function dealCount(problems) {
  return new Set(problems.map((item) => boardOf(item.deal))).size;
}
