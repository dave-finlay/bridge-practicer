import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertsFor } from '../js/alerts.js';

// The marks for an auction as { index: 'alert: text' }, for short asserts.
function marks(dealer, calls) {
  return Object.fromEntries([...alertsFor(dealer, calls)].map(([i, m]) => [i, `${m.kind}: ${m.text}`]));
}

test('a 1NT opening is announced, but not a 1NT response or overcall', () => {
  assert.deepEqual(marks('N', ['P', '1N', 'P', 'P', 'P']), { 1: 'announce: 15 to 17' });
  assert.deepEqual(marks('N', ['1C', 'P', '1N', 'P', 'P', 'P']), {});
  assert.deepEqual(marks('N', ['1H', '1N', 'P', 'P', 'P']), {});
});

test('Jacoby transfers are announced over a pass, double or 2♣, and not over other overcalls', () => {
  assert.equal(marks('N', ['1N', 'P', '2D', 'P', '2H', 'P', 'P', 'P'])[2], 'announce: Transfer');
  assert.equal(marks('N', ['1N', 'X', '2H', 'P', '2S', 'P', 'P', 'P'])[2], 'announce: Transfer');
  assert.equal(marks('N', ['1N', '2C', '2D', 'P', '2H', 'P', 'P', 'P'])[2], 'announce: Transfer');
  assert.equal(marks('N', ['1N', '2D', '2H', 'P', 'P', 'P'])[2], undefined);
  // Completing the transfer isn't marked.
  assert.equal(marks('N', ['1N', 'P', '2D', 'P', '2H', 'P', 'P', 'P'])[4], undefined);
  // Not a transfer after a minor opening, or by a player who has bid before.
  assert.deepEqual(marks('N', ['1C', 'P', '2D', 'P', 'P', 'P']), {});
});

test('transfers over 2NT and Texas are announced', () => {
  assert.equal(marks('N', ['P', '2N', 'P', '3H', 'P', '3S', 'P', 'P', 'P'])[3], 'announce: Transfer');
  assert.equal(marks('N', ['1N', 'P', '4H', 'P', '4S', 'P', 'P', 'P'])[2], 'announce: Transfer');
  assert.equal(marks('N', ['1N', '3C', '4H', 'P', '4S', 'P', 'P', 'P'])[2], 'announce: Transfer');
  assert.equal(marks('N', ['1N', '3D', '4H', 'P', 'P', 'P'])[2], undefined);
});

test('a super-accept is announced', () => {
  assert.match(marks('S', ['1N', 'P', '2D', 'P', '3H', 'P', '4H', 'P', 'P', 'P'])[4], /^announce: Super-accept/);
  assert.equal(marks('S', ['1N', 'P', '2D', 'P', '2H', 'P', 'P', 'P'])[4], undefined);
});

test('Stayman over interference is alerted: double of 2♣, cue bid of other overcalls', () => {
  assert.match(marks('N', ['1N', '2C', 'X', 'P', '2H', 'P', 'P', 'P'])[2], /^alert: Stayman/);
  assert.match(marks('W', ['1N', '2H', '3H', 'P', '3S', 'P', '4S', 'P', 'P', 'P'])[2], /^alert: Stayman/);
  // Plain Stayman isn't alerted.
  assert.equal(marks('N', ['1N', 'P', '2C', 'P', '2D', 'P', 'P', 'P'])[2], undefined);
});

test('Jacoby 2NT and opener\'s three-level answers are alerted, four-level answers are not', () => {
  const m = marks('E', ['1S', 'P', '2N', 'P', '3D', 'P', '4S', 'P', 'P', 'P']);
  assert.match(m[2], /^alert: Jacoby 2NT/);
  assert.equal(m[4], 'alert: Singleton or void in diamonds');
  assert.equal(m[6], undefined);
  assert.equal(marks('S', ['1S', 'P', '2N', 'P', '3N', 'P', '4S', 'P', 'P', 'P'])[4], 'alert: 15–17, no singleton or void');
  assert.equal(marks('S', ['1H', 'P', '2N', 'P', '3H', 'P', '4H', 'P', 'P', 'P'])[4], 'alert: 18 or more, no singleton or void');
  assert.equal(marks('W', ['1H', 'P', '2N', 'P', '4D', 'P', '4N', 'P', '5S', 'P', '6H', 'P', 'P', 'P'])[4], undefined);
  // Not Jacoby over interference, or from a passed hand.
  assert.equal(marks('N', ['1H', '2C', '2N', 'P', '3N', 'P', 'P', 'P'])[2], undefined);
  assert.equal(marks('N', ['P', 'P', '1S', 'P', '2N', 'P', 'P', 'P'])[4], undefined);
});

test('new minor forcing is alerted, opener\'s answer is not', () => {
  const m = marks('N', ['P', '1D', 'P', '1H', 'P', '1N', 'P', '2C', 'P', '2H', 'P', '4H', 'P', 'P', 'P']);
  assert.match(m[7], /^alert: New minor forcing/);
  assert.equal(m[9], undefined);
  assert.match(marks('E', ['P', 'P', 'P', '1H', 'P', '1S', 'P', '1N', 'P', '2C', 'P', '3N', 'P', 'P', 'P'])[9], /^alert: New minor/);
  // Rebidding opener's minor isn't new minor forcing.
  assert.equal(marks('N', ['1D', 'P', '1S', 'P', '1N', 'P', '2D', 'P', 'P', 'P'])[6], undefined);
  // Not after interference.
  assert.equal(marks('N', ['1D', '1H', '1S', 'P', '1N', 'P', '2C', 'P', 'P', 'P'])[6], undefined);
});
