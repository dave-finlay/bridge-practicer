// Problems: flattening the problem files into a list, grading an answer,
// keeping progress, and picking the problems for a session. No UI code.
//
// Each problem file holds deals, and each deal holds problems. See
// PLAN.md for the format.

import { SEATS, contract, seatAfter, seatOfCall } from './auction.js';
import { RANKS } from './hands.js';

// Where the deals come from, in the order the home screen lists them, and
// the files the app loads from each: problems/<origin>/<file>.json.
export const ORIGINS = {
  lessons: {
    name: 'Lessons',
    files: ['stayman', 'texas', 'negative-doubles', 'nmf', 'jacoby-2nt', 'rkcb', 'control-bids', 'jacoby'],
  },
  club: { name: 'Club', files: ['alpine-2026-10-27', 'alpine-2026-11-03', 'doubleton-2026-11-04'] },
  teachers: { name: 'Teachers', files: ['too-strong', 'cuebids', 'opening-leads', 'defense'] },
};

// Every problem file's path, with its origin.
export const problemFiles = () => Object.entries(ORIGINS).flatMap(([origin, { files }]) =>
  files.map((file) => ({ origin, path: `problems/${origin}/${file}.json` })));

// The names of the topics that problems are tagged with, in the order the
// home screen lists them: the lessons' conventions, then agreements
// practiced from other deals, then general bidding for the rest.
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
  'level-of-fit': 'Level of fit',
  general: 'General bidding',
  'leads-nt': 'Leads vs notrump',
  'leads-suit': 'Leads vs suits',
  signals: 'Attitude signals',
  'second-third': 'Second and third hand',
  'mid-hand': 'Leading mid-hand',
};

export const topicName = (tag) => TOPICS[tag] ?? tag;

// The board a deal is. A club board can be in the problems twice, bid two
// ways; both versions share a `source` and count as one board, since one
// version's auction would give away the other's answers.
export const boardOf = (deal) => deal.source ?? deal.id;

// A deal with all four hands. A lead problem from a handout may give
// only the leader's hand.
export const isFullDeal = (deal) => SEATS.every((seat) => deal.hands[seat]);

// The player who makes the opening lead: declarer's left-hand opponent.
export const leaderOf = (deal) => seatAfter(contract(deal.dealer, deal.auction).declarer);

// A play position: a moment in the play from a handout, with the contract,
// dummy's and your cards (perhaps in one suit only) and the trick so far,
// but no auction. Its problems (`play: true`) ask for your card.
export const isPosition = (deal) => Array.isArray(deal.trick);
export const dummyOf = (deal) => seatAfter(deal.declarer, 2);
// Who played each card of the trick so far, and who plays next.
export const trickSeats = (deal) => deal.trick.map((_, i) => seatAfter(deal.leader, i));
export const toPlay = (deal) => seatAfter(deal.leader, deal.trick.length);

// A position can show the tricks played before it (`earlier`, each
// `{ leader, cards }`): who played each card, and who won the trick: the
// highest trump, or else the highest card of the suit led.
export const earlierSeats = (trick) => trick.cards.map((_, i) => seatAfter(trick.leader, i));
export function trickWinner(trick, trump) {
  const led = trick.cards[0][0];
  const rank = (card) => (card[0] === trump ? 0 : card[0] === led ? 20 : 40) + RANKS.indexOf(card[1]);
  const best = trick.cards.reduce((a, b) => (rank(b) < rank(a) ? b : a));
  return earlierSeats(trick)[trick.cards.indexOf(best)];
}

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
        // An opening lead problem (`lead: true`) asks the leader for a card,
        // and a play problem the next to play; the others ask for the call
        // at `at`.
        seat: problem.play ? toPlay(deal) : problem.lead ? leaderOf(deal) : seatOfCall(deal.dealer, problem.at),
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

// The problems from any of `origins` ('lessons', 'club', 'teachers'), or
// all of them if `origins` is empty.
export function fromOrigins(problems, origins) {
  if (!origins.length) return problems;
  return problems.filter((item) => origins.includes(item.origin));
}

// How many deals the problems come from: the most a session can hold.
export function dealCount(problems) {
  return new Set(problems.map((item) => boardOf(item.deal))).size;
}
