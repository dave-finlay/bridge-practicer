import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BIDS,
  boardAfter,
  boardBefore,
  completeAuction,
  contract,
  dealerForBoard,
  isComplete,
  isVulnerable,
  legalCalls,
  nextToAct,
  SEATS,
  vulnerabilityForBoard,
} from '../js/auction.js';

// Splits a space-separated auction, e.g. '1C P 1H P', into calls.
const calls = (text) => (text ? text.split(' ') : []);

// The legal calls as a sorted array, for easy comparison.
const legal = (dealer, text) => [...legalCalls(dealer, calls(text))].sort();

test('dealer rotates N E S W by board number', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 16, 17].map(dealerForBoard),
    ['N', 'E', 'S', 'W', 'N', 'W', 'N']);
});

test('vulnerability follows the standard 16-board cycle', () => {
  const boards = Array.from({ length: 16 }, (_, i) => i + 1);
  assert.deepEqual(boards.map(vulnerabilityForBoard), [
    'None', 'NS', 'EW', 'All', 'NS', 'EW', 'All', 'None',
    'EW', 'All', 'None', 'NS', 'All', 'None', 'NS', 'EW',
  ]);
  assert.equal(vulnerabilityForBoard(17), 'None');
  assert.equal(vulnerabilityForBoard(20), 'All');
  assert.equal(vulnerabilityForBoard(36), 'All');
});

test('boards 17-24 repeat the cycle, as in a 24-board game', () => {
  // As in a club hand record for a 24-board game.
  const boards = [17, 18, 19, 20, 21, 22, 23, 24];
  assert.deepEqual(boards.map(dealerForBoard),
    ['N', 'E', 'S', 'W', 'N', 'E', 'S', 'W']);
  assert.deepEqual(boards.map(vulnerabilityForBoard),
    ['None', 'NS', 'EW', 'All', 'NS', 'EW', 'All', 'None']);
});

test('boardAfter counts up, wrapping after the last board', () => {
  assert.equal(boardAfter(13, 18), 14);
  assert.equal(boardAfter(18, 18), 1);
  assert.equal(boardAfter(24, 24), 1);
  // Without a board count there is no wrapping.
  assert.equal(boardAfter(18, null), 19);
});

test('boardBefore counts down, wrapping before board 1', () => {
  assert.equal(boardBefore(14, 18), 13);
  assert.equal(boardBefore(1, 21), 21);
  assert.equal(boardBefore(1, null), 1);
});

test('isVulnerable', () => {
  assert.equal(isVulnerable('N', 'NS'), true);
  assert.equal(isVulnerable('E', 'NS'), false);
  assert.equal(isVulnerable('W', 'All'), true);
  assert.equal(isVulnerable('S', 'None'), false);
});

test('nextToAct goes clockwise from the dealer', () => {
  assert.equal(nextToAct('W', []), 'W');
  assert.equal(nextToAct('W', calls('P')), 'N');
  assert.equal(nextToAct('S', calls('1C P P')), 'E');
});

test('opening: every bid and pass, but no double or redouble', () => {
  assert.deepEqual(legal('N', ''), [...BIDS, 'P'].sort());
});

test('bids must be higher than the last bid', () => {
  const after = legalCalls('N', calls('1H P'));
  assert.equal(after.has('1H'), false);
  assert.equal(after.has('1D'), false);
  assert.equal(after.has('1S'), true);
  assert.equal(after.has('2C'), true);
});

test('nothing beats 7NT', () => {
  assert.deepEqual(legal('N', '7N'), ['P', 'X']);
});

test('double is allowed only over an opponent\'s bid', () => {
  // N opens 1C: E (opponent) may double, then S (partner of N) may not.
  assert.equal(legalCalls('N', calls('1C')).has('X'), true);
  assert.equal(legalCalls('N', calls('1C P')).has('X'), false);
  // W may double in the balancing seat.
  assert.equal(legalCalls('N', calls('1C P P')).has('X'), true);
});

test('no double of a call that is already doubled', () => {
  assert.equal(legalCalls('N', calls('1C X')).has('X'), false);
  assert.equal(legalCalls('N', calls('1C X P P')).has('X'), false);
});

test('redouble is allowed only over an opponent\'s double', () => {
  // N 1C, E X: S (N's partner) and N may redouble, W (E's partner) may not.
  assert.equal(legalCalls('N', calls('1C X')).has('XX'), true);
  assert.equal(legalCalls('N', calls('1C X P')).has('XX'), false);
  assert.equal(legalCalls('N', calls('1C X P P')).has('XX'), true);
  // Nothing to double or redouble after a redouble.
  assert.equal(legal('N', '1C X XX').includes('X'), false);
  assert.equal(legal('N', '1C X XX').includes('XX'), false);
});

test('a new bid clears a double', () => {
  // N 1C, E X, S 1H: W may double 1H.
  assert.equal(legalCalls('N', calls('1C X 1H')).has('X'), true);
  assert.equal(legalCalls('N', calls('1C X 1H')).has('XX'), false);
});

test('auction ends after three passes following a call', () => {
  assert.equal(isComplete(calls('1C P P')), false);
  assert.equal(isComplete(calls('1C P P P')), true);
  assert.equal(isComplete(calls('P 1C P P P')), true);
  assert.equal(isComplete(calls('1C X P P P')), true);
});

test('a passed-out auction takes four passes', () => {
  assert.equal(isComplete(calls('P P P')), false);
  assert.equal(isComplete(calls('P P P P')), true);
});

test('no calls are legal once the auction is over', () => {
  assert.equal(legalCalls('N', calls('1C P P P')).size, 0);
  assert.equal(legalCalls('N', calls('P P P P')).size, 0);
});

test('completeAuction adds the closing passes', () => {
  assert.deepEqual(completeAuction(calls('1C P 1H')), calls('1C P 1H P P P'));
  assert.deepEqual(completeAuction(calls('1C P P')), calls('1C P P P'));
  assert.deepEqual(completeAuction(calls('4S X')), calls('4S X P P P'));
});

test('completeAuction passes out an auction with no bids', () => {
  assert.deepEqual(completeAuction(calls('P')), calls('P P P P'));
  assert.deepEqual(completeAuction(calls('P P P')), calls('P P P P'));
  assert.deepEqual(completeAuction([]), calls('P P P P'));
});

test('completeAuction leaves a complete auction alone', () => {
  assert.deepEqual(completeAuction(calls('1N P P P')), calls('1N P P P'));
});

test('contract: none when nobody bids', () => {
  assert.equal(contract('N', calls('P P P P')), null);
  assert.equal(contract('N', []), null);
});

test('contract: declarer is the first of the side to bid the strain', () => {
  // N 1H, S raises to 4H: N declares.
  assert.deepEqual(contract('N', calls('1H P 4H P P P')),
    { level: 4, strain: 'H', doubled: '', declarer: 'N' });
  // N 1C, S 1H, N 2H, S 4H: S bid hearts first, so S declares.
  assert.deepEqual(contract('N', calls('1C P 1H P 2H P 4H P P P')),
    { level: 4, strain: 'H', doubled: '', declarer: 'S' });
});

test('contract: the opponents\' earlier bid in the strain does not count', () => {
  // E opens 1S, S cue-bids 2S, N jumps to 4S: S declares, not E.
  assert.deepEqual(contract('E', calls('1S 2S P 4S P P P')),
    { level: 4, strain: 'S', doubled: '', declarer: 'S' });
});

test('contract: doubled and redoubled', () => {
  assert.equal(contract('N', calls('1H X P P P')).doubled, 'X');
  assert.equal(contract('N', calls('1H X XX P P P')).doubled, 'XX');
  // A double of an earlier bid does not carry over.
  assert.equal(contract('N', calls('1H X 2H P P P')).doubled, '');
});

test('legal calls do not depend on who dealt', () => {
  // Sides alternate around the table, so whether two calls were made by
  // opponents depends only on their positions in the auction. Changing
  // the board number or dealer therefore never makes an auction illegal.
  for (const auction of ['', '1C', '1C X', '1C X P P', '1C P P', '2H X XX', '1N P 2C']) {
    const expected = legal('N', auction);
    for (const dealer of SEATS) assert.deepEqual(legal(dealer, auction), expected);
  }
});
