// Checks every problem file in problems/<origin>/ and reports anything
// wrong.
// Usage: node scripts/check.mjs

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SEATS, contract, dealerForBoard, isComplete, legalCalls, seatOfCall, sideOf, vulnerabilityForBoard,
} from '../js/auction.js';
import { RANKS, SUITS, cardsOf, hcp, parseHand } from '../js/hands.js';
import { ORIGINS, isFullDeal, leaderOf, problemFiles } from '../js/problems.js';

const VULNERABILITIES = ['None', 'NS', 'EW', 'All'];
const isLegal = (dealer, calls, call) => legalCalls(dealer, calls).has(call);

const dir = new URL('../problems/', import.meta.url).pathname;
const errors = [];
const problemIds = new Set();
let dealCount = 0;
let problemCount = 0;

// Double dummy results, from scripts/dd.mjs.
const dd = JSON.parse(readFileSync(join(dir, 'dd.json'), 'utf8'));

// Every file in an origin's folder must be listed in ORIGINS, or the app
// won't load it.
const root = new URL('../', import.meta.url).pathname;
const files = problemFiles().map(({ path }) => path);
for (const origin of Object.keys(ORIGINS)) {
  if (!existsSync(join(dir, origin))) continue;
  for (const name of readdirSync(join(dir, origin)).filter((f) => f.endsWith('.json'))) {
    const file = `problems/${origin}/${name}`;
    if (!files.includes(file)) errors.push(`${file} isn't listed in ORIGINS in js/problems.js`);
  }
}

for (const file of files) {
  const { deals } = JSON.parse(readFileSync(join(root, file), 'utf8'));
  for (const deal of deals) {
    dealCount++;
    const where = `${file} ${deal.id}`;
    const fail = (message) => errors.push(`${where}: ${message}`);

    if (!SEATS.includes(deal.dealer)) fail(`bad dealer ${deal.dealer}`);
    if (!VULNERABILITIES.includes(deal.vul)) fail(`bad vulnerability ${deal.vul}`);
    // A hand from a handout example may have no board number.
    const usual = { dealer: dealerForBoard(deal.board), vul: vulnerabilityForBoard(deal.board) };
    // `unusualSetup` explains a handout that doesn't follow the usual rotation.
    if (deal.board !== undefined && (usual.dealer !== deal.dealer || usual.vul !== deal.vul) && !deal.unusualSetup) {
      fail(`board ${deal.board} is usually dealer ${usual.dealer}, ${usual.vul} vul`);
    }

    // Four hands of 13 cards, ranks in order, making one full deck. A deal
    // for opening leads only may give just the leader's hand.
    const full = isFullDeal(deal);
    if (!full) {
      const given = Object.keys(deal.hands);
      if (!deal.problems.every((problem) => problem.lead)) fail('only some hands are given, but not every problem is a lead');
      else if (given.length !== 1 || given[0] !== leaderOf(deal)) fail("only the leader's hand should be given");
    }
    const seen = new Set();
    for (const seat of SEATS.filter((s) => deal.hands[s])) {
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
    if (full && seen.size !== 52) fail(`the deal has ${seen.size} different cards`);
    const solved = dd[deal.id];
    const leadsSolved = !deal.problems.some((problem) => problem.lead) || solved?.lead;
    if (full && (solved?.hands !== `N:${SEATS.map((seat) => deal.hands[seat]).join(' ')}` || !leadsSolved)) {
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
      if (!problem.explanation) errors.push(`${at}: no explanation`);
      if (!problem.tags?.length) errors.push(`${at}: no tags`);

      // An opening lead: the answer and alternatives are cards in the
      // leader's hand.
      if (problem.lead) {
        if (!contract(deal.dealer, deal.auction)) {
          errors.push(`${at}: the deal is passed out, so there's no lead`);
          continue;
        }
        const cards = cardsOf(parseHand(deal.hands[leaderOf(deal)]));
        if (!cards.includes(problem.answer)) errors.push(`${at}: answer ${problem.answer} isn't in the leader's hand`);
        for (const card of [...Object.keys(problem.whyNot ?? {}), ...Object.keys(problem.acceptable ?? {})]) {
          if (!cards.includes(card)) errors.push(`${at}: ${card} isn't in the leader's hand`);
          if (card === problem.answer) errors.push(`${at}: ${card} is also the answer`);
        }
        continue;
      }

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
      const seat = seatOfCall(deal.dealer, problem.at);
      problem.seat = seat;
      problem.hcp = hcp(parseHand(deal.hands[seat]));
    }
  }
}

// The service worker keeps every file the app loads for offline use.
const swFiles = new Set(readFileSync(join(root, 'sw.js'), 'utf8').match(/^const FILES = \[([^\]]*)\]/m)[1]
  .match(/'[^']*'/g).map((quoted) => quoted.slice(1, -1)));
const needed = [
  ...readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`),
  ...files,
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
