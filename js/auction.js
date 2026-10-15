// Bridge auction rules: who deals, who is vulnerable, which calls are
// legal, when the auction is over, and what the final contract is.
//
// A call is 'P' (pass), 'X' (double), 'XX' (redouble) or a bid: a level
// 1-7 followed by a strain C, D, H, S or N (notrump), e.g. '1C' or '3N'.
// An auction is an array of calls, starting with the dealer's.
// This module has no UI code, so it can be unit-tested with Node.

export const SEATS = ['N', 'E', 'S', 'W'];
export const STRAINS = ['C', 'D', 'H', 'S', 'N'];
export const LEVELS = [1, 2, 3, 4, 5, 6, 7];

// All 35 bids, lowest to highest: '1C', '1D', ..., '7N'.
export const BIDS = LEVELS.flatMap((level) =>
  STRAINS.map((strain) => `${level}${strain}`),
);

// Vulnerability for boards 1-16; the cycle repeats from board 17.
const VULNERABILITY = [
  'None', 'NS', 'EW', 'All',
  'NS', 'EW', 'All', 'None',
  'EW', 'All', 'None', 'NS',
  'All', 'None', 'NS', 'EW',
];

export function dealerForBoard(board) {
  return SEATS[(board - 1) % 4];
}

export function vulnerabilityForBoard(board) {
  return VULNERABILITY[(board - 1) % 16];
}

// The board played after `board`. Sessions often start partway through
// (say at board 13 of 18), so with a known board count it wraps to 1.
export function boardAfter(board, boardCount) {
  return boardCount && board >= boardCount ? 1 : board + 1;
}

// The board before `board`, wrapping to the last board when the count is
// known. Without a count there is nothing before board 1.
export function boardBefore(board, boardCount) {
  if (board > 1) return board - 1;
  return boardCount || 1;
}

// The seat `steps` places clockwise from `seat`.
export function seatAfter(seat, steps = 1) {
  return SEATS[(SEATS.indexOf(seat) + steps) % 4];
}

export function sideOf(seat) {
  return seat === 'N' || seat === 'S' ? 'NS' : 'EW';
}

export function isVulnerable(seat, vulnerability) {
  return vulnerability === 'All' || vulnerability === sideOf(seat);
}

export function isBid(call) {
  return BIDS.includes(call);
}

// The seat that makes the call at position `index` in the auction.
export function seatOfCall(dealer, index) {
  return seatAfter(dealer, index);
}

export function nextToAct(dealer, calls) {
  return seatOfCall(dealer, calls.length);
}

// An auction ends with three passes in a row after any bid, double or
// redouble, or with four passes if nobody bids. Either way the last three
// calls are passes and there are at least four calls.
export function isComplete(calls) {
  return calls.length >= 4 && calls.slice(-3).every((call) => call === 'P');
}

// The set of calls the next player may make. Empty once the auction is over.
export function legalCalls(dealer, calls) {
  if (isComplete(calls)) return new Set();

  const legal = new Set(['P']);

  const lastBid = calls.findLastIndex(isBid);
  const lowest = lastBid < 0 ? 0 : BIDS.indexOf(calls[lastBid]) + 1;
  for (const bid of BIDS.slice(lowest)) legal.add(bid);

  // Double and redouble depend on the last call that wasn't a pass, and
  // are only allowed when an opponent made it.
  const lastAction = calls.findLastIndex((call) => call !== 'P');
  if (lastAction >= 0) {
    const byOpponent =
      sideOf(seatOfCall(dealer, lastAction)) !== sideOf(nextToAct(dealer, calls));
    if (byOpponent && isBid(calls[lastAction])) legal.add('X');
    if (byOpponent && calls[lastAction] === 'X') legal.add('XX');
  }

  return legal;
}

// Adds the passes needed to end the auction. Players record only the
// calls they make, and the closing passes are assumed.
export function completeAuction(calls) {
  const completed = [...calls];
  while (!isComplete(completed)) completed.push('P');
  return completed;
}

// The contract reached so far, or null if nobody has bid. The declarer is
// the player on the winning side who first bid the contract's strain.
// Returns { level, strain, doubled: '' | 'X' | 'XX', declarer }.
export function contract(dealer, calls) {
  const last = calls.findLastIndex(isBid);
  if (last < 0) return null;

  const strain = calls[last][1];
  const side = sideOf(seatOfCall(dealer, last));
  const first = calls.findIndex(
    (call, i) =>
      isBid(call) && call[1] === strain && sideOf(seatOfCall(dealer, i)) === side,
  );
  const doubled = calls.slice(last + 1).filter((call) => call !== 'P').at(-1) ?? '';

  return {
    level: Number(calls[last][0]),
    strain,
    doubled,
    declarer: seatOfCall(dealer, first),
  };
}
