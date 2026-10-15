// Cards and hands, and how hands and calls are written for people.
// No UI code. Auction rules live in auction.js.
//
// Hands are written PBN style, spades first: 'A2.JT54.AQ4.AJT2', with T
// for the ten and an empty suit for a void.

export const SUITS = ['S', 'H', 'D', 'C'];
export const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const RANKS = 'AKQJT98765432';

const HCP = { A: 4, K: 3, Q: 2, J: 1 };

// 'A2.JT54.AQ4.AJT2' → { S: 'A2', H: 'JT54', D: 'AQ4', C: 'AJT2' }.
export function parseHand(text) {
  const holdings = text.split('.');
  if (holdings.length !== 4) throw new Error(`hand "${text}" needs four suits`);
  return Object.fromEntries(SUITS.map((suit, i) => [suit, holdings[i]]));
}

export function hcp(hand) {
  return SUITS.reduce(
    (total, suit) => total + [...hand[suit]].reduce((sum, rank) => sum + (HCP[rank] ?? 0), 0),
    0,
  );
}

// 'AJT2' → 'A J 10 2', '' → '—'.
export function formatHolding(holding) {
  if (!holding) return '—';
  return [...holding].map((rank) => (rank === 'T' ? '10' : rank)).join(' ');
}

// '1N' → '1NT', '4H' → '4♥', 'P' → 'Pass'.
export function formatCall(call) {
  if (call === 'P') return 'Pass';
  if (call === 'X' || call === 'XX') return call;
  return call[0] + (call[1] === 'N' ? 'NT' : SUIT_SYMBOLS[call[1]]);
}
