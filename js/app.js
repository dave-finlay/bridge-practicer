// The app's screens and event handling.
//
// A session is a short list of problems. Each one shows the problem
// screen: your hand, the auction so far and a bidding box. Tapping a call
// selects it, and Bid confirms it, so there's a moment to check. Then the
// feedback screen grades the call and shows the whole deal. After the
// last problem, a summary offers another session.

import { BIDS, STRAINS, contract, isVulnerable, legalCalls, seatAfter } from './auction.js';
import { SUITS, formatHolding, hcp, parseHand } from './hands.js';
import { LESSONS, flatten, grade, pickSession } from './problems.js';

const app = document.getElementById('app');

const SESSION_SIZE = 10;
// Columns of the auction table, as on BBO and in the bid recorder.
const TABLE_ORDER = ['W', 'N', 'E', 'S'];
const SEAT_NAMES = { N: 'North', E: 'East', S: 'South', W: 'West' };
const VUL_NAMES = { None: 'Nobody vulnerable', NS: 'N-S vulnerable', EW: 'E-W vulnerable', All: 'Both vulnerable' };
// U+FE0E asks iOS to draw the suit as text rather than as a color emoji.
const SYMBOLS = { C: '♣︎', D: '♦︎', H: '♥︎', S: '♠︎', N: 'NT' };
const GRADES = {
  best: { title: 'Right', icon: '✓' },
  acceptable: { title: 'Acceptable', icon: '✓' },
  wrong: { title: 'Not this time', icon: '✗' },
};
// Ignore taps on Next this soon after answering, so a double tap on Bid
// doesn't skip the feedback.
const NEXT_DELAY_MS = 500;

let problems = [];
let dd = {}; // double dummy results by deal id, from problems/dd.json
let session = []; // [{ item, call }], call is null until answered
let index = 0;
let screen = 'loading'; // 'problem', 'feedback', 'summary', 'error'
let selected = null; // the call tapped on the problem screen, not yet confirmed
let answeredAt = 0;

// Formatting

function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const isRed = (call) => call[1] === 'H' || call[1] === 'D';

function bidLabel(bid) {
  return `${bid[0]}${SYMBOLS[bid[1]]}`;
}

function callHTML(call) {
  if (call === 'P') return '<span class="pass">Pass</span>';
  if (call === 'X') return '<span class="double">X</span>';
  if (call === 'XX') return '<span class="redouble">XX</span>';
  return `<span class="${isRed(call) ? 'red' : ''}">${bidLabel(call)}</span>`;
}

// Text from the problem files, with suit symbols drawn as text and colored.
function proseHTML(text) {
  return escapeHTML(text).replace(/[♠♥♦♣]/g, (symbol) => {
    const red = symbol === '♥' || symbol === '♦';
    return `<span class="${red ? 'red' : ''}">${symbol}︎</span>`;
  });
}

function holdingHTML(hand, suit) {
  const red = suit === 'H' || suit === 'D';
  return `<div class="holding"><span class="suit${red ? ' red' : ''}">${SYMBOLS[suit]}</span>${formatHolding(hand[suit])}</div>`;
}

function handHTML(handText) {
  const hand = parseHand(handText);
  return SUITS.map((suit) => holdingHTML(hand, suit)).join('');
}

// The auction table. `calls` are shown from the dealer on. If `ask` is
// set, `you` get a blinking "?" after them, or the call you've selected.
// `highlight` marks a call.
function auctionHTML(deal, you, calls, { ask = false, pending = null, highlight = -1 } = {}) {
  const partner = seatAfter(you, 2);
  const seats = TABLE_ORDER.map((seat) => {
    const classes = ['seat'];
    if (isVulnerable(seat, deal.vul)) classes.push('vul');
    const tags = [];
    if (seat === you) tags.push('you');
    if (seat === partner) tags.push('partner');
    if (seat === deal.dealer) tags.push('dealer');
    return `<div class="${classes.join(' ')}">${seat}<small>${tags.join(' · ')}</small></div>`;
  }).join('');

  const cells = [];
  for (let i = 0; i < TABLE_ORDER.indexOf(deal.dealer); i++) cells.push('<div></div>');
  calls.forEach((call, i) => cells.push(`<div${i === highlight ? ' class="asked"' : ''}>${callHTML(call)}</div>`));
  if (ask) cells.push(pending ? `<div class="pending">${callHTML(pending)}</div>` : '<div class="cursor">?</div>');

  return `<div class="seats">${seats}</div>
    <div class="calls">${cells.join('')}</div>
    <div class="more-above" hidden>↑ earlier calls</div>`;
}

// Scrolls the auction so its last row, where you call, is in view, and
// shows the "earlier calls" tag while rows are hidden above.
function scrollAuction() {
  const calls = app.querySelector('.calls');
  const tag = app.querySelector('.more-above');
  if (!calls || !tag) return;
  const update = () => { tag.hidden = calls.scrollTop < 4; };
  calls.scrollTop = calls.scrollHeight;
  calls.addEventListener('scroll', update, { passive: true });
  update();
}

// The confirm button: "Bid 4♥", "Pass", "Double" or "Redouble".
function confirmLabel(call) {
  if (!call) return 'Choose a call';
  return { P: 'Pass', X: 'Double', XX: 'Redouble' }[call] ?? `Bid ${callHTML(call)}`;
}

// Screens

function renderProblem() {
  const { item } = session[index];
  const { deal, problem, seat } = item;
  const before = deal.auction.slice(0, problem.at);
  const legal = legalCalls(deal.dealer, before);

  const state = (call) => `${call === selected ? ' selected' : ''}"${legal.has(call) ? '' : ' disabled'}`;
  const bidButton = (bid) =>
    `<button class="${isRed(bid) ? 'red' : ''}${state(bid)} data-call="${bid}">${bidLabel(bid)}</button>`;
  const callButton = (call, label, className) =>
    `<button class="${className}${state(call)} data-call="${call}">${label}</button>`;

  // Levels with no legal bid left are hidden, which gives long auctions
  // the room they need.
  const lowest = BIDS.find((bid) => legal.has(bid));
  const bids = lowest ? BIDS.filter((bid) => bid[0] >= lowest[0]) : [];

  app.className = 'problem-screen';
  app.innerHTML = `
    <header class="bar">
      <span class="progress">${index + 1} of ${session.length}</span>
      <span class="setting">You are ${SEAT_NAMES[seat]} · ${VUL_NAMES[deal.vul]}</span>
    </header>
    <section class="hand" aria-label="Your hand">${handHTML(deal.hands[seat])}</section>
    <section class="auction">${auctionHTML(deal, seat, before, { ask: true, pending: selected })}</section>
    <div class="confirm">
      <button class="secondary" data-action="cancel"${selected ? '' : ' disabled'}>Cancel</button>
      <button class="primary" data-action="confirm"${selected ? '' : ' disabled'}>${confirmLabel(selected)}</button>
    </div>
    <div class="box">${bids.map(bidButton).join('')}</div>
    <div class="specials${selected ? ' chosen' : ''}">
      ${callButton('P', 'Pass', 'pass')}
      ${callButton('X', 'X', 'double')}
      ${callButton('XX', 'XX', 'redouble')}
    </div>`;
  scrollAuction();
}

function dealHTML(deal, you) {
  const hand = (seat) => `
    <div class="deal-hand d-${seat.toLowerCase()}${seat === you ? ' you' : ''}">
      <div class="deal-label">${SEAT_NAMES[seat]}${seat === you ? ' (you)' : ''} · ${hcp(parseHand(deal.hands[seat]))}</div>
      ${handHTML(deal.hands[seat])}
    </div>`;
  return `<div class="deal">${['N', 'W', 'E', 'S'].map(hand).join('')}</div>`;
}

const SIDE_NAMES = { NS: 'N-S', EW: 'E-W' };

// A par contract as DDS writes it, e.g. "6S-N", "4S*-EW-1" (doubled, down
// one) or "4N-W+1", in words.
function parContractHTML(text) {
  const [, level, strain, doubled, side, result] = text.match(/^(\d)([CDHSN])(\*?)-([NESW]{1,2})([+-]\d+)?$/);
  const by = SIDE_NAMES[side] ?? SEAT_NAMES[side];
  const outcome = !result ? '' : result[0] === '-' ? `, down ${result.slice(1)}` : `, making ${Number(level) + Number(result)}`;
  return `${callHTML(level + strain)}${doubled ? ' doubled' : ''} by ${by}${outcome}`;
}

// The tricks each player would take as declarer in each strain, the
// contract the auction reached, and par.
function doubleDummyHTML(deal) {
  const result = dd[deal.id];
  if (!result) return '';
  const final = contract(deal.dealer, deal.auction);

  const head = STRAINS.map((strain) => `<th class="${isRed(`1${strain}`) ? 'red' : ''}">${SYMBOLS[strain]}</th>`).join('');
  const rows = ['N', 'S', 'E', 'W'].map((seat) => {
    const cells = STRAINS.map((strain) => {
      const tricks = result.tricks[seat][strain];
      const classes = [tricks >= 7 ? 'makes' : '', final?.declarer === seat && final.strain === strain ? 'played' : ''];
      return `<td class="${classes.join(' ').trim()}">${tricks}</td>`;
    }).join('');
    return `<tr><th>${SEAT_NAMES[seat]}</th>${cells}</tr>`;
  }).join('');

  let played = '';
  if (final) {
    const tricks = result.tricks[final.declarer][final.strain];
    const over = tricks - final.level - 6;
    const doubled = { X: ' doubled', XX: ' redoubled' }[final.doubled] ?? '';
    const outcome = over < 0 ? `goes down ${-over}`
      : over === 0 ? 'just makes'
      : `makes with ${over} overtrick${over === 1 ? '' : 's'}`;
    played = `<p>${callHTML(`${final.level}${final.strain}`)}${doubled} by ${SEAT_NAMES[final.declarer]} takes ${tricks} tricks: it ${outcome}.</p>`;
  }

  const { score, contracts } = result.par;
  const par = score === 0
    ? 'Par is to pass the deal out.'
    : `Par is ${contracts.map(parContractHTML).join(' or ')}: ${score > 0 ? 'N-S' : 'E-W'} +${Math.abs(score)}.`;

  return `
    <h2>Double dummy</h2>
    <p class="dd-note">Tricks each player would take as declarer, with all four hands seen and perfect play.</p>
    <table class="dd"><tr><th></th>${head}</tr>${rows}</table>
    ${played}
    <p>${par}</p>`;
}

function renderFeedback() {
  const { item, call } = session[index];
  const { deal, problem, seat } = item;
  const result = grade(problem, call);
  const { title, icon } = GRADES[result];

  const notes = [];
  if (result === 'acceptable') {
    notes.push(`<p>${proseHTML(problem.acceptable[call])}</p>`);
  } else if (result === 'wrong' && problem.whyNot?.[call]) {
    notes.push(`<p><strong>Why not ${callHTML(call)}?</strong> ${proseHTML(problem.whyNot[call])}</p>`);
  }
  const alternatives = Object.entries(problem.acceptable ?? {}).filter(([c]) => c !== call);
  const last = index === session.length - 1;

  app.className = 'feedback-screen';
  app.innerHTML = `
    <div class="feedback">
      <header class="verdict ${result}">
        <span class="verdict-icon" aria-hidden="true">${icon}</span>
        <div>
          <h1>${title}</h1>
          <p>${result === 'best'
            ? `${callHTML(call)} is the answer.`
            : `You bid ${callHTML(call)}. The answer is ${callHTML(problem.answer)}.`}</p>
        </div>
      </header>
      ${notes.join('')}
      <h2>Why ${callHTML(problem.answer)}</h2>
      <p>${proseHTML(problem.explanation)}</p>
      ${alternatives.map(([c, why]) => `<p><strong>Also fine: ${callHTML(c)}.</strong> ${proseHTML(why)}</p>`).join('')}
      <h2>The whole board</h2>
      <section class="auction">${auctionHTML(deal, seat, deal.auction, { highlight: problem.at })}</section>
      ${dealHTML(deal, seat)}
      ${doubleDummyHTML(deal)}
    </div>
    <div class="next-bar">
      <button class="primary" data-action="next">${last ? 'See how you did' : 'Next problem'}</button>
    </div>`;
  window.scrollTo(0, 0);
}

function renderSummary() {
  const right = session.filter(({ item, call }) => grade(item.problem, call) !== 'wrong').length;
  const rows = session.map(({ item, call }) => {
    const result = grade(item.problem, call);
    const answer = result === 'best' ? '' : ` · answer ${callHTML(item.problem.answer)}`;
    return `<li class="${result}"><span class="mark" aria-hidden="true">${GRADES[result].icon}</span>
      <span>You bid ${callHTML(call)}${answer}</span></li>`;
  }).join('');

  app.className = 'summary-screen';
  app.innerHTML = `
    <h1>${right} of ${session.length} right</h1>
    <ul class="results">${rows}</ul>
    <button class="primary" data-action="again">Practise again</button>`;
  window.scrollTo(0, 0);
}

function render() {
  switch (screen) {
    case 'problem': return renderProblem();
    case 'feedback': return renderFeedback();
    case 'summary': return renderSummary();
    case 'error':
      app.className = 'summary-screen';
      app.innerHTML = '<h1>The problems didn’t load</h1><p>Check the connection and reload the page.</p>';
  }
}

// A problem id in the URL (e.g. #texas-6d) puts that problem first, for
// trying out a particular problem.
function startSession() {
  const wanted = problems.find((item) => `#${item.id}` === location.hash);
  const others = problems.filter((item) => item.deal !== wanted?.deal);
  const picked = pickSession(others, wanted ? SESSION_SIZE - 1 : SESSION_SIZE);
  session = (wanted ? [wanted, ...picked] : picked).map((item) => ({ item, call: null }));
  index = 0;
  selected = null;
  screen = 'problem';
  render();
}

// Events

app.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;

  const { call, action } = button.dataset;
  if (call) {
    selected = call;
  } else if (action === 'cancel') {
    selected = null;
  } else if (action === 'confirm') {
    session[index].call = selected;
    selected = null;
    answeredAt = Date.now();
    screen = 'feedback';
  } else if (action === 'next') {
    if (Date.now() - answeredAt < NEXT_DELAY_MS) return;
    index++;
    screen = index < session.length ? 'problem' : 'summary';
  } else if (action === 'again') {
    startSession();
    return;
  }
  render();
});

async function start() {
  try {
    const lessons = await Promise.all(
      LESSONS.map((lesson) => fetch(`problems/${lesson}.json`).then((response) => {
        if (!response.ok) throw new Error(`${lesson}: ${response.status}`);
        return response.json();
      })),
    );
    problems = flatten(lessons);
    // Double dummy results are extra: the app works without them.
    dd = await fetch('problems/dd.json').then((response) => (response.ok ? response.json() : {})).catch(() => ({}));
    startSession();
  } catch (error) {
    console.error(error);
    screen = 'error';
    render();
  }
}

start();
