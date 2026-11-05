// Checks every problem file in problems/<origin>/ and reports anything
// wrong.
// Usage: node scripts/check.mjs

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SEATS, contract, dealerForBoard, isComplete, legalCalls, seatOfCall, sideOf, vulnerabilityForBoard,
} from '../js/auction.js';
import { RANKS, SUITS, cardsOf, hcp, parseHand } from '../js/hands.js';
import {
  ORIGINS, dummyOf, earlierSeats, isFullDeal, isPosition, leaderOf, problemFiles, toPlay, trickSeats, trickWinner,
} from '../js/problems.js';

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

    if (isPosition(deal)) {
      checkPosition(deal, fail);
      continue;
    }

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
    // The opponents' conventional calls, which the deal alerts itself.
    for (const [i, text] of Object.entries(deal.alerts ?? {})) {
      if (!(Number(i) >= 0 && Number(i) < deal.auction.length) || !text) fail(`alert "${i}" isn't a call in the auction`);
    }

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

// A play position: the contract, dummy's and the player's cards before
// this trick (only the `shown` suits, if given), and the trick so far.
// Every card played must follow suit when the player can.
function checkPosition(deal, fail) {
  if (!/^[1-7][CDHSN]$/.test(deal.contract)) fail(`bad contract ${deal.contract}`);
  if (!SEATS.includes(deal.declarer)) fail(`bad declarer ${deal.declarer}`);
  if (!SEATS.includes(deal.leader)) fail(`bad leader ${deal.leader}`);
  if (deal.trick.length > 3) fail('the trick is already complete');
  const you = toPlay(deal);
  const dummy = dummyOf(deal);
  if (you === deal.declarer || you === dummy) fail(`${you} plays next, but isn't a defender`);
  const given = Object.keys(deal.hands).sort().join('');
  if (given !== [dummy, you].sort().join('')) fail(`hands should be given for dummy (${dummy}) and ${you} only`);
  const shown = deal.shown ?? SUITS.join('');

  const seen = new Set();
  const holdings = {};
  for (const [seat, text] of Object.entries(deal.hands)) {
    const hand = parseHand(text);
    holdings[seat] = cardsOf(hand);
    for (const suit of SUITS) {
      if (hand[suit] && !shown.includes(suit)) fail(`${seat} has ${suit}, which isn't shown`);
      const order = [...hand[suit]].map((rank) => RANKS.indexOf(rank));
      if (order.some((i) => i < 0)) fail(`${seat} ${suit} "${hand[suit]}" has a bad rank`);
      if (order.some((i, k) => k > 0 && i <= order[k - 1])) fail(`${seat} ${suit} "${hand[suit]}" is not in rank order`);
    }
    for (const card of holdings[seat]) {
      if (seen.has(card)) fail(`${card} appears twice`);
      seen.add(card);
    }
  }
  // A card can be played only if it follows suit, or the player (whose
  // whole hand is known) has none of the suit led.
  const led = deal.trick[0]?.[0];
  const follows = (seat, card) => {
    if (!led || card[0] === led) return true;
    if (!holdings[seat]) return true;
    return shown.length === 4 && !holdings[seat].some((c) => c[0] === led);
  };
  deal.trick.forEach((card, i) => {
    const seat = trickSeats(deal)[i];
    if (!/^[SHDC][AKQJT98765432]$/.test(card)) fail(`bad card ${card}`);
    if (holdings[seat] && !holdings[seat].includes(card)) fail(`${seat} plays ${card}, which isn't in their hand`);
    if (!holdings[seat] && seen.has(card)) fail(`${card} appears twice`);
    seen.add(card);
    if (!follows(seat, card)) fail(`${seat} plays ${card} without following suit`);
  });

  // Earlier tricks: four cards each, none still held, following suit when
  // the hand shows the player had none left. The last one's winner leads now.
  const trump = deal.contract[1] === 'N' ? null : deal.contract[1];
  for (const [k, earlier] of (deal.earlier ?? []).entries()) {
    if (!SEATS.includes(earlier.leader)) fail(`earlier trick ${k + 1}: bad leader ${earlier.leader}`);
    if (earlier.cards?.length !== 4) fail(`earlier trick ${k + 1} should have four cards`);
    const suitLed = earlier.cards[0][0];
    earlier.cards.forEach((card, i) => {
      const seat = earlierSeats(earlier)[i];
      if (!/^[SHDC][AKQJT98765432]$/.test(card)) fail(`earlier trick ${k + 1}: bad card ${card}`);
      if (seen.has(card)) fail(`earlier trick ${k + 1}: ${card} appears twice`);
      seen.add(card);
      if (card[0] !== suitLed && holdings[seat] && shown.length === 4 && holdings[seat].some((c) => c[0] === suitLed)) {
        fail(`earlier trick ${k + 1}: ${seat} plays ${card} but still holds ${suitLed}`);
      }
    });
  }
  const last = deal.earlier?.at(-1);
  if (last && trickWinner(last, trump) !== deal.leader) fail(`${trickWinner(last, trump)} won the last earlier trick, but ${deal.leader} leads`);
  if (deal.earlier && deal.trick.length) fail('show earlier tricks only when you lead to the next one');
  if (shown.length === 4 && holdings[dummy].length !== holdings[you].length) {
    fail(`dummy holds ${holdings[dummy].length} cards and ${you} ${holdings[you].length}`);
  }

  for (const problem of deal.problems) {
    problemCount++;
    const problemFail = (message) => fail(`${problem.id}: ${message}`);
    if (problemIds.has(problem.id)) problemFail('duplicate problem id');
    problemIds.add(problem.id);
    if (!problem.id.startsWith(deal.id)) problemFail("id doesn't match the deal");
    if (!problem.play) problemFail('a position\'s problems must be play problems');
    if (!problem.explanation) problemFail('no explanation');
    if (!problem.tags?.length) problemFail('no tags');
    for (const card of [problem.answer, ...Object.keys(problem.whyNot ?? {}), ...Object.keys(problem.acceptable ?? {})]) {
      if (!holdings[you]?.includes(card)) problemFail(`${card} isn't in ${you}'s hand`);
      else if (!follows(you, card)) problemFail(`${card} doesn't follow suit`);
    }
    for (const card of [...Object.keys(problem.whyNot ?? {}), ...Object.keys(problem.acceptable ?? {})]) {
      if (card === problem.answer) problemFail(`${card} is also the answer`);
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

// Progress on the phones is kept by problem id, so renaming or deleting
// an id quietly loses its history. problems/ids.txt lists every id ever
// checked; one that has gone is an error, and new ones are added to it
// once everything passes. (Setting a deal aside keeps its ids.)
const idsFile = join(dir, 'ids.txt');
const known = existsSync(idsFile) ? readFileSync(idsFile, 'utf8').split('\n').filter(Boolean) : [];
for (const id of known) {
  if (!problemIds.has(id)) {
    errors.push(`${id} has gone, and progress on it is lost. If it was never published, or is meant to go, remove it from problems/ids.txt`);
  }
}
const added = [...problemIds].filter((id) => !known.includes(id));
if (added.length && !errors.length) {
  writeFileSync(idsFile, `${[...known, ...added].sort().join('\n')}\n`);
  console.log(`Added ${added.length} new problem ids to problems/ids.txt`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`OK: ${dealCount} deals, ${problemCount} problems`);
