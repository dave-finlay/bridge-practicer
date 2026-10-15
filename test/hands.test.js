import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCall, formatHolding, hcp, parseHand } from '../js/hands.js';

test('parseHand splits a PBN hand into suits, spades first', () => {
  assert.deepEqual(parseHand('A2.JT54.AQ4.AJT2'), { S: 'A2', H: 'JT54', D: 'AQ4', C: 'AJT2' });
  assert.deepEqual(parseHand('.K8.Q65.KJT98762'), { S: '', H: 'K8', D: 'Q65', C: 'KJT98762' });
  assert.throws(() => parseHand('A2.JT54.AQ4'));
});

test('hcp counts 4-3-2-1 for aces, kings, queens and jacks', () => {
  assert.equal(hcp(parseHand('A2.JT54.AQ4.AJT2')), 16);
  assert.equal(hcp(parseHand('KQ9873.A2.J3.986')), 10);
  assert.equal(hcp(parseHand('.J9854.T2.KJT643')), 5);
});

test('formatHolding spells out the ten and shows a void as a dash', () => {
  assert.equal(formatHolding('AJT2'), 'A J 10 2');
  assert.equal(formatHolding(''), '—');
});

test('formatCall uses suit symbols, NT and Pass', () => {
  assert.equal(formatCall('4H'), '4♥');
  assert.equal(formatCall('1N'), '1NT');
  assert.equal(formatCall('P'), 'Pass');
  assert.equal(formatCall('X'), 'X');
  assert.equal(formatCall('XX'), 'XX');
});
