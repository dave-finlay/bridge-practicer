// Which calls in an auction are alerted or announced, under ACBL rules
// and the agreements in the lessons (see the ACBL convention card: red is
// Alert, blue is Announce). No UI code.
//
// Each rule looks only at the call and the calls before it, so a call's
// marking is the same whether or not the rest of the auction is shown.
// Calls not covered here aren't marked: Stayman, negative doubles, strong
// 2♣, RKCB, control bids and natural bids. Calls above 3NT from opener's
// second turn on aren't alerted at the table anyway (the alert waits
// until the end of the auction).

import { BIDS, seatOfCall, sideOf } from './auction.js';

const SUIT_NAMES = { C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' };
const rank = (bid) => BIDS.indexOf(bid);
const isPass = (call) => call === 'P';

// For each marked call: index → { kind: 'alert' | 'announce', text }.
export function alertsFor(dealer, calls) {
  const marks = new Map();
  calls.forEach((call, i) => {
    const mark = markFor(dealer, calls, i);
    if (mark) marks.set(i, mark);
  });
  return marks;
}

function markFor(dealer, calls, i) {
  const call = calls[i];
  const seat = seatOfCall(dealer, i);
  const ours = (j) => sideOf(seatOfCall(dealer, j)) === sideOf(seat);
  // The index of the auction's first bid, the opening, or -1.
  const opening = calls.findIndex((c) => !isPass(c) && c !== 'X' && c !== 'XX');
  const before = calls.slice(0, i);
  const allPassedBefore = before.every(isPass);
  // This player's earlier calls, all passes if they haven't bid yet.
  const ownEarlier = before.filter((_, j) => seatOfCall(dealer, j) === seat);

  // A 1NT opening: announce the range.
  if (call === '1N' && allPassedBefore) return { kind: 'announce', text: '15 to 17' };

  // Responder's first call after partner opens 1NT or 2NT, with RHO's call
  // in between.
  const partnerOpenedNT = opening === i - 2 && ['1N', '2N'].includes(calls[opening]);
  if (partnerOpenedNT && ownEarlier.every(isPass)) {
    const nt = calls[opening];
    const rho = calls[i - 1];
    // Jacoby transfers: on over a pass, a double or 2♣.
    const jacoby = nt === '1N' ? ['2D', '2H'] : ['3D', '3H'];
    if (jacoby.includes(call) && (isPass(rho) || rho === 'X' || rho === '2C')) {
      return { kind: 'announce', text: 'Transfer' };
    }
    // Texas: on over a pass, a double or an overcall up to 3♣.
    if (['4D', '4H'].includes(call) && (isPass(rho) || rho === 'X' || rank(rho) <= rank('3C'))) {
      return { kind: 'announce', text: 'Transfer' };
    }
    // Over a 2♣ overcall of 1NT, double is Stayman.
    if (nt === '1N' && rho === '2C' && call === 'X') {
      return { kind: 'alert', text: 'Stayman: asks for a four-card major' };
    }
    // Over another two-level overcall of 1NT, a cue bid is Stayman.
    if (nt === '1N' && /^2[DHS]$/.test(rho) && call === `3${rho[1]}`) {
      return { kind: 'alert', text: 'Stayman: asks for a four-card major, forcing to game' };
    }
  }

  // Opener's jump to three of responder's major after a Jacoby transfer
  // (a super-accept).
  const transfers = { '2D': '3H', '2H': '3S' };
  if (opening === i - 4 && calls[opening] === '1N' && isPass(calls[i - 3]) && isPass(calls[i - 1])
    && transfers[calls[i - 2]] === call) {
    return { kind: 'announce', text: 'Super-accept: four-card support and a good 1NT' };
  }

  // Jacoby 2NT: 2NT over partner's 1♥ or 1♠ with RHO passing, by a player
  // who hasn't passed already.
  const partnerOpenedMajor = opening === i - 2 && ['1H', '1S'].includes(calls[opening]);
  if (call === '2N' && partnerOpenedMajor && isPass(calls[i - 1]) && ownEarlier.length === 0) {
    return { kind: 'alert', text: 'Jacoby 2NT: four or more trumps, forcing to game' };
  }

  // Opener's three-level answer to Jacoby 2NT, with the opponents passing.
  if (opening === i - 4 && ['1H', '1S'].includes(calls[opening]) && calls[i - 2] === '2N'
    && isPass(calls[i - 3]) && isPass(calls[i - 1])) {
    const major = calls[opening][1];
    if (call === '3N') return { kind: 'alert', text: '15–17, no singleton or void' };
    if (call === `3${major}`) return { kind: 'alert', text: '18 or more, no singleton or void' };
    if (/^3[CDHS]$/.test(call)) return { kind: 'alert', text: `Singleton or void in ${SUIT_NAMES[call[1]]}` };
  }

  // New minor forcing: 1x, 1♥/1♠, 1NT, then responder's 2♣ or 2♦ in a
  // minor opener didn't open, with the opponents passing throughout.
  if (opening === i - 6 && ['2C', '2D'].includes(call)
    && ['1H', '1S'].includes(calls[i - 4]) && calls[i - 2] === '1N'
    && calls[opening][0] === '1' && calls[opening][1] !== call[1]
    && before.every((c, j) => ours(j) || isPass(c))) {
    return { kind: 'alert', text: 'New minor forcing: asks about support and strength' };
  }

  return null;
}
