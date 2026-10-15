// Problems: flattening the lesson files into a list, grading an answer,
// and picking the problems for a session. No UI code.
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

// Up to `size` problems in random order, at most one from each deal, so
// that no problem gives away another's answer. `random` is for tests.
export function pickSession(problems, size, random = Math.random) {
  const shuffled = [...problems];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const deals = new Set();
  const picked = [];
  for (const item of shuffled) {
    if (picked.length === size) break;
    if (deals.has(item.deal.id)) continue;
    deals.add(item.deal.id);
    picked.push(item);
  }
  return picked;
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
