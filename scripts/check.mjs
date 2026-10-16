// Checks every problem file in problems/ and reports anything wrong.
// Usage: node scripts/check.mjs

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SEATS, dealerForBoard, isComplete, legalCalls, seatOfCall, sideOf, vulnerabilityForBoard,
} from '../js/auction.js';
import { RANKS, SUITS, hcp, parseHand } from '../js/hands.js';
import { LESSONS } from '../js/problems.js';

const VULNERABILITIES = ['None', 'NS', 'EW', 'All'];
const isLegal = (dealer, calls, call) => legalCalls(dealer, calls).has(call);

const dir = new URL('../problems/', import.meta.url).pathname;
const errors = [];
const problemIds = new Set();
let dealCount = 0;
let problemCount = 0;

// Double dummy results, from scripts/dd.mjs.
const dd = JSON.parse(readFileSync(join(dir, 'dd.json'), 'utf8'));

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'dd.json').sort()) {
  const lesson = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  for (const deal of lesson.deals) {
    dealCount++;
    const where = `${file} ${deal.id}`;
    const fail = (message) => errors.push(`${where}: ${message}`);

    if (!SEATS.includes(deal.dealer)) fail(`bad dealer ${deal.dealer}`);
    if (!VULNERABILITIES.includes(deal.vul)) fail(`bad vulnerability ${deal.vul}`);
    const usual = { dealer: dealerForBoard(deal.board), vul: vulnerabilityForBoard(deal.board) };
    // `unusualSetup` explains a handout that doesn't follow the usual rotation.
    if ((usual.dealer !== deal.dealer || usual.vul !== deal.vul) && !deal.unusualSetup) {
      fail(`board ${deal.board} is usually dealer ${usual.dealer}, ${usual.vul} vul`);
    }

    // Four hands of 13 cards, ranks in order, making one full deck.
    const seen = new Set();
    for (const seat of SEATS) {
      const hand = parseHand(deal.hands[seat]);
      let cards = 0;
      for (const suit of SUITS) {
        const holding = hand[suit];
        const order = [...holding].map((rank) => RANKS.indexOf(rank));
        if (order.some((i) => i < 0)) fail(`${seat} ${suit} "${holding}" has a bad rank`);
        if (order.some((i, k) => k > 0 && i <= order[k - 1])) {
          fail(`${seat} ${suit} "${holding}" is not in rank order`);
        }
        for (const rank of holding) {
          const card = suit + rank;
          if (seen.has(card)) fail(`${card} appears twice`);
          seen.add(card);
        }
        cards += holding.length;
      }
      if (cards !== 13) fail(`${seat} has ${cards} cards`);
    }
    if (seen.size !== 52) fail(`the deal has ${seen.size} different cards`);
    if (dd[deal.id]?.hands !== `N:${SEATS.map((seat) => deal.hands[seat]).join(' ')}`) {
      fail('double dummy results are missing or out of date: run npm run dd');
    }

    deal.auction.forEach((call, i) => {
      if (!isLegal(deal.dealer, deal.auction.slice(0, i), call)) fail(`call ${i + 1} (${call}) is not legal`);
    });
    if (!isComplete(deal.auction)) fail('the auction does not end with three passes');

    for (const problem of deal.problems) {
      problemCount++;
      const at = `${where} ${problem.id}`;
      if (problemIds.has(problem.id)) errors.push(`${at}: duplicate problem id`);
      problemIds.add(problem.id);
      if (!problem.id.startsWith(`${deal.id}`)) errors.push(`${at}: id doesn't match the deal`);
      if (!(problem.at >= 0 && problem.at < deal.auction.length)) {
        errors.push(`${at}: "at" is outside the auction`);
        continue;
      }
      const before = deal.auction.slice(0, problem.at);
      if (!isLegal(deal.dealer, before, problem.answer)) errors.push(`${at}: answer ${problem.answer} is not legal`);
      // A pass from a side that hasn't bid usually means the problem is at
      // the wrong call (one off): the answer matches, but the hand is wrong.
      const side = sideOf(seatOfCall(deal.dealer, problem.at));
      if (problem.answer === 'P' && !before.some((c, i) => c !== 'P' && sideOf(seatOfCall(deal.dealer, i)) === side)) {
        errors.push(`${at}: asks a player whose side hasn't bid yet to pass; is "at" right?`);
      }
      if (problem.answer !== deal.auction[problem.at] && !problem.answerNote) {
        errors.push(`${at}: answer differs from the auction's ${deal.auction[problem.at]} without an answerNote`);
      }
      for (const call of [...Object.keys(problem.whyNot ?? {}), ...Object.keys(problem.acceptable ?? {})]) {
        if (!isLegal(deal.dealer, before, call)) errors.push(`${at}: ${call} is not legal at this point`);
        if (call === problem.answer) errors.push(`${at}: ${call} is also the answer`);
      }
      if (!problem.explanation) errors.push(`${at}: no explanation`);
      if (!problem.tags?.length) errors.push(`${at}: no tags`);
      const seat = seatOfCall(deal.dealer, problem.at);
      problem.seat = seat;
      problem.hcp = hcp(parseHand(deal.hands[seat]));
    }
  }
}

// The service worker keeps every file the app loads for offline use.
const root = new URL('../', import.meta.url).pathname;
const swFiles = new Set(readFileSync(join(root, 'sw.js'), 'utf8').match(/^const FILES = \[([^\]]*)\]/m)[1]
  .match(/'[^']*'/g).map((quoted) => quoted.slice(1, -1)));
const needed = [
  ...readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`),
  ...LESSONS.map((lesson) => `problems/${lesson}.json`),
  'problems/dd.json',
];
for (const file of needed) {
  if (!swFiles.has(file)) errors.push(`sw.js: ${file} is missing from FILES`);
}
for (const file of swFiles) {
  if (file !== './' && !existsSync(join(root, file))) errors.push(`sw.js: ${file} in FILES doesn't exist`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`OK: ${dealCount} deals, ${problemCount} problems`);
