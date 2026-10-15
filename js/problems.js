// Problems: flattening the lesson files into a list, grading an answer,
// and picking the problems for a session. No UI code.
//
// Each lesson file (problems/<lesson>.json) holds deals, and each deal
// holds problems. See PLAN.md for the format.

import { seatOfCall } from './auction.js';

// The lesson files the app loads, in problems/.
export const LESSONS = ['texas'];

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
