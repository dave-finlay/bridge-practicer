// The app's screens and event handling.
//
// The home screen starts a session of 10 problems, optionally for
// chosen conventions only. Each problem shows the problem screen: your
// hand, the auction so far and a bidding box. Tapping a call selects it,
// and Bid confirms it, so there's a moment to check. Then the feedback
// screen grades the call and shows the whole deal. After the last problem
// (or ✕ to stop early), the summary lists the answers, any of which can
// be looked at again, and offers the missed ones as a new session.
//
// Every answer is saved on the phone (js/store.js), and the progress
// decides which problems come up: new ones first, then ones missed, then
// ones due again.

import { alertsFor } from './alerts.js';
import { BIDS, STRAINS, contract, isVulnerable, legalCalls, seatAfter } from './auction.js';
import { SUITS, formatHolding, hcp, parseHand } from './hands.js';
import {
  LESSONS, conventionName, conventionsIn, dealCount, flatten, grade, pickSession, progressSummary,
  updateProgress, withTags,
} from './problems.js';
import { startPreview } from './preview.js';
import { loadProgress, requestPersistence, saveAnswer } from './store.js';

const app = document.getElementById('app');

const SESSION_SIZE = 10;
// Where the home screen's choice of conventions is kept between visits.
const SETTINGS_KEY = 'bridge-practicer-settings';
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
let progress = {}; // progress records by problem id, from js/store.js
let session = []; // [{ item, call }], call is null until answered
let index = 0;
let screen = 'loading'; // 'home', 'problem', 'feedback', 'review', 'summary', 'error'
let selected = null; // the call tapped on the problem screen, not yet confirmed
let answeredAt = 0;
let tags = loadSettings().tags; // conventions chosen on the home screen; none means all

// Settings are a convenience: if storage is unavailable, the defaults do.
function loadSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (Array.isArray(settings?.tags)) return settings;
  } catch {}
  return { tags: [] };
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ tags }));
  } catch {}
}

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
// `highlight` marks a call. Alerted calls get a red box and announced
// ones a blue box; tapping one shows what it means.
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
  const marks = alertsFor(deal.dealer, deal.auction);
  calls.forEach((call, i) => {
    const mark = marks.get(i);
    const label = mark && `${mark.kind === 'alert' ? 'Alert' : 'Announced'}: ${mark.text}`;
    const attributes = [
      i === highlight ? ' class="asked"' : '',
      mark ? ` data-kind="${mark.kind}" data-mark="${escapeHTML(label)}" role="button" aria-label="${escapeHTML(label)}"` : '',
    ].join('');
    cells.push(`<div${attributes}>${callHTML(call)}</div>`);
  });
  if (ask) cells.push(pending ? `<div class="pending">${callHTML(pending)}</div>` : '<div class="cursor">?</div>');

  return `<div class="seats">${seats}</div>
    <div class="calls">${cells.join('')}</div>
    <div class="more-above" hidden>↑ earlier calls</div>
    <div class="mark-note" hidden></div>`;
}

// Shows what a marked call means, at the foot of its auction table, for a
// few seconds, or until the next tap anywhere.
let markTimer = 0;
let markShown = null; // the marked call whose meaning is showing

function hideMark() {
  clearTimeout(markTimer);
  app.querySelectorAll('.mark-note').forEach((note) => { note.hidden = true; });
  markShown = null;
}

function showMark(cell) {
  const note = cell.closest('.auction').querySelector('.mark-note');
  note.textContent = cell.dataset.mark;
  note.dataset.kind = cell.dataset.kind;
  note.hidden = false;
  markShown = cell;
  clearTimeout(markTimer);
  markTimer = setTimeout(hideMark, 4000);
}

// Scrolls the auction so its last row, where you call, is in view, and
// shows the "earlier calls" tag while a row is hidden above. A row only
// clipped at the top is still readable, and the tag would cover it.
function scrollAuction() {
  const calls = app.querySelector('.calls');
  const tag = app.querySelector('.more-above');
  if (!calls || !tag) return;
  const rowHeight = calls.firstElementChild?.offsetHeight ?? 0;
  const update = () => { tag.hidden = calls.scrollTop < rowHeight / 2; };
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
      <button class="quit" data-action="quit" aria-label="Stop these challenges">✕</button>
      <span class="progress">${index + 1} of ${session.length}</span>
      <span class="setting">You are ${SEAT_NAMES[seat]} · ${VUL_NAMES[deal.vul]}</span>
    </header>
    <section class="hand" aria-label="Your hand">
      <div>${handHTML(deal.hands[seat])}</div>
      <div class="points" aria-label="High card points"><strong>${hcp(parseHand(deal.hands[seat]))}</strong>HCP</div>
    </section>
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

// After answering, Next goes on. Looking again from the summary
// (`reviewing`), the button goes back to it.
function renderFeedback(reviewing = false) {
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
      ${reviewing
        ? '<button class="primary" data-action="summary">Back to results</button>'
        : `<button class="primary" data-action="next">${last ? 'See how you did' : 'Next challenge'}</button>`}
    </div>`;
  window.scrollTo(0, 0);
}

function renderSummary() {
  const right = session.filter(({ item, call }) => grade(item.problem, call) !== 'wrong').length;
  const missed = session.filter(({ item, call }) => grade(item.problem, call) === 'wrong').length;
  const rows = session.map(({ item, call }, i) => {
    const result = grade(item.problem, call);
    const answer = result === 'best' ? '' : ` · answer ${callHTML(item.problem.answer)}`;
    return `<li class="${result}"><button data-review="${i}">
      <span class="mark" aria-hidden="true">${GRADES[result].icon}</span>
      <span class="result-text">
        <small>${escapeHTML(conventionName(item.problem.tags[0]))}</small>
        You bid ${callHTML(call)}${answer}
      </span>
      <span class="chevron" aria-hidden="true">›</span>
    </button></li>`;
  }).join('');

  app.className = 'summary-screen';
  app.innerHTML = `
    <h1>${right} of ${session.length} right</h1>
    <p class="hint">Tap a challenge to look at it again.</p>
    <ul class="results">${rows}</ul>
    ${missed ? `<button class="primary" data-action="missed">Practise the ${missed === 1 ? 'one' : `${missed}`} I missed</button>` : ''}
    <button class="${missed ? 'secondary' : 'primary'}" data-action="again">More challenges</button>
    <button class="secondary" data-action="home">Home</button>`;
  window.scrollTo(0, 0);
}

// "today", "yesterday", "3 days ago", or a date such as "3 Oct".
function whenText(time) {
  const startOfDay = (t) => new Date(t).setHours(0, 0, 0, 0);
  const days = Math.round((startOfDay(Date.now()) - startOfDay(time)) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days} days ago`;
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// The home screen: which conventions to practise, progress, and Start.
function renderHome() {
  const chip = (tag, name, count, on) =>
    `<button class="chip${on ? ' on' : ''}" data-tag="${tag}" aria-pressed="${on}">${escapeHTML(name)}${count ? ` <small>${count}</small>` : ''}</button>`;
  const chips = [
    chip('', 'All', 0, !tags.length),
    ...conventionsIn(problems).map(({ tag, name, count }) => chip(tag, name, count, tags.includes(tag))),
  ].join('');

  const pool = withTags(problems, tags);
  const deals = dealCount(pool);
  // A session has at most one problem per deal, so fewer deals than
  // SESSION_SIZE means a shorter session.
  const size = Math.min(SESSION_SIZE, deals);

  const { seen, right, lastAt } = progressSummary(pool, progress);

  app.className = 'home-screen';
  app.innerHTML = `
    <header>
      <h1>Bridge Practicer</h1>
      <p class="hint">Bidding challenges from our lessons</p>
    </header>
    <section>
      <h2>Conventions</h2>
      <div class="chips">${chips}</div>
      <p class="hint">${pool.length} challenge${pool.length === 1 ? '' : 's'} from ${deals} deal${deals === 1 ? '' : 's'}. A set of challenges has at most one from each deal.</p>
    </section>
    <section>
      <h2>Progress${tags.length ? ' on these' : ''}</h2>
      <div class="stats">
        <div><strong>${seen}</strong> of ${pool.length} tried</div>
        <div><strong>${right}</strong> right last time</div>
        <div><strong>${lastAt ? whenText(lastAt) : 'Not yet'}</strong> last practised</div>
      </div>
    </section>
    <div class="starts">
      <button class="primary" data-action="start">${size} bidding challenge${size === 1 ? '' : 's'}</button>
    </div>`;
  window.scrollTo(0, 0);
}

function render() {
  switch (screen) {
    case 'home': return renderHome();
    case 'problem': return renderProblem();
    case 'feedback': return renderFeedback();
    case 'review': return renderFeedback(true);
    case 'summary': return renderSummary();
    case 'error':
      app.className = 'summary-screen';
      app.innerHTML = '<h1>The challenges didn’t load</h1><p>Check the connection and reload the page.</p>';
  }
}

// Starts a session of up to `size` problems from `pool`, with `first`
// first if it's given.
function startSession(pool, size, first = null) {
  const others = pool.filter((item) => item.deal !== first?.deal);
  const picked = pickSession(others, first ? size - 1 : size, { progress });
  session = (first ? [first, ...picked] : picked).map((item) => ({ item, call: null }));
  index = 0;
  selected = null;
  screen = 'problem';
  render();
}

// Stops the session early: the summary covers the answered problems, or
// with none answered it's back to the home screen.
function quitSession() {
  session = session.filter(({ call }) => call);
  selected = null;
  screen = session.length ? 'summary' : 'home';
}

// Records the call for the current problem, in the session and on the
// phone. If saving fails, the session carries on.
function recordAnswer(call) {
  const { item } = session[index];
  const result = grade(item.problem, call);
  answeredAt = Date.now();
  session[index].call = call;
  progress[item.id] = updateProgress(progress[item.id], item.id, result, answeredAt);
  saveAnswer({ id: item.id, call, grade: result, at: answeredAt }, progress[item.id]).catch(console.error);
}

// Events

app.addEventListener('click', (event) => {
  // A tap anywhere hides a showing meaning; a tap on another marked call
  // shows that one instead.
  const marked = event.target.closest('[data-mark]');
  const wasShown = markShown;
  hideMark();
  if (marked) {
    if (marked !== wasShown) showMark(marked);
    return;
  }
  const button = event.target.closest('button');
  if (!button || button.disabled) return;

  const { call, action, tag, review } = button.dataset;
  if (call) {
    selected = call;
  } else if (tag !== undefined) {
    // "All" clears the choice; a convention toggles, and none left is all.
    tags = !tag ? [] : tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    saveSettings();
  } else if (review !== undefined) {
    index = Number(review);
    screen = 'review';
  } else if (action === 'start') {
    startSession(withTags(problems, tags), SESSION_SIZE);
    return;
  } else if (action === 'cancel') {
    selected = null;
  } else if (action === 'confirm') {
    recordAnswer(selected);
    selected = null;
    screen = 'feedback';
  } else if (action === 'next') {
    if (Date.now() - answeredAt < NEXT_DELAY_MS) return;
    index++;
    screen = index < session.length ? 'problem' : 'summary';
  } else if (action === 'quit') {
    quitSession();
  } else if (action === 'summary') {
    screen = 'summary';
  } else if (action === 'missed') {
    const missed = session.filter(({ item, call }) => grade(item.problem, call) === 'wrong').map(({ item }) => item);
    startSession(missed, missed.length);
    return;
  } else if (action === 'again') {
    startSession(withTags(problems, tags), SESSION_SIZE);
    return;
  } else if (action === 'home') {
    // Home starts again from all conventions.
    tags = [];
    saveSettings();
    screen = 'home';
  }
  render();
});

// Taps outside the app's own area (e.g. below a short feedback screen)
// also hide a showing meaning.
document.addEventListener('click', (event) => {
  if (!app.contains(event.target)) hideMark();
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
    // Without storage (e.g. a private window), progress lasts until the
    // page closes.
    progress = await loadProgress().catch((error) => {
      console.error(error);
      return {};
    });
    requestPersistence().catch(() => {});
    // Double dummy results are extra: the app works without them.
    dd = await fetch('problems/dd.json').then((response) => (response.ok ? response.json() : {})).catch(() => ({}));
    // Forget conventions no longer in the problems.
    tags = tags.filter((tag) => problems.some(({ problem }) => problem.tags.includes(tag)));
    // A problem id in the URL (e.g. #texas-6d) skips the home screen and
    // puts that problem first, for trying out a particular problem.
    const wanted = problems.find((item) => `#${item.id}` === location.hash);
    if (wanted) {
      startSession(problems, SESSION_SIZE, wanted);
    } else {
      screen = 'home';
      render();
    }
  } catch (error) {
    console.error(error);
    screen = 'error';
    render();
  }
}

// Offline support (sw.js). Browsers only allow it over HTTPS, so it runs on
// the hosted app; it's skipped on localhost, where a cached copy would hide
// each change until a second reload.
if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('sw.js').catch(console.error);
}
// On a laptop previewing a phone, the app runs in the phone's frame.
if (!startPreview()) start();
