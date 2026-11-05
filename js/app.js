// The app's screens and event handling.
//
// The home screen starts a session of 10 problems, optionally from chosen
// origins (lessons, club, teachers) or for chosen topics only. Each
// problem shows the problem screen: your hand, the auction so far and a
// bidding box. Tapping a call selects it, and Bid confirms it, so there's
// a moment to check. An opening lead problem shows the whole auction and
// your hand as cards to tap instead, and a play problem a moment in the
// play: dummy, the trick so far and your cards. Then the feedback screen grades the call and shows
// the whole deal. After the last problem (or ✕ to stop early), the
// summary lists the answers, any of which can be looked at again, and
// offers the missed ones as a new session.
//
// Every answer is saved on the phone (js/store.js), and the progress
// decides which problems come up: new ones first, then ones missed, then
// ones due again. Ones answered right wait until they're due, so a set
// can be short, or there can be none left for now.

import { marksFor } from './alerts.js';
import { BIDS, STRAINS, contract, isVulnerable, legalCalls, seatAfter } from './auction.js';
import { SUITS, formatHolding, hcp, parseHand } from './hands.js';
import {
  ORIGINS, boardOf, dealCount, dummyOf, earlierSeats, flatten, fromOrigins, grade, isFullDeal, isPosition, nextDue, pickSession,
  problemFiles, progressSummary, readyNow, topicName, topicsIn, trickSeats, updateProgress, withTags,
} from './problems.js';
import { startPreview } from './preview.js';
import { loadProgress, requestPersistence, saveAnswer } from './store.js';

const app = document.getElementById('app');

const SESSION_SIZE = 10;
// Where the home screen's choice of origins and topics is kept between visits.
const SETTINGS_KEY = 'bridge-practicer-settings';
// Columns of the auction table, as on BBO and in the bid recorder.
const TABLE_ORDER = ['W', 'N', 'E', 'S'];
const SEAT_NAMES = { N: 'North', E: 'East', S: 'South', W: 'West' };
// Short, so the top line fits a small phone; the red seats show it too.
const VUL_NAMES = { None: 'None vul', NS: 'N-S vul', EW: 'E-W vul', All: 'Both vul' };
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
let selected = null; // the call or card tapped on the problem screen, not yet confirmed
let answeredAt = 0;
// Chosen on the home screen: where the deals come from, and the topics.
// None chosen means all.
let { origins, tags } = loadSettings();

// Settings are a convenience: if storage is unavailable, the defaults do.
// Before origins could be combined, the setting was one `origin`.
function loadSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (Array.isArray(settings?.tags)) {
      const origins = Array.isArray(settings.origins) ? settings.origins : [settings.origin].filter(Boolean);
      return { origins, tags: settings.tags };
    }
  } catch {}
  return { origins: [], tags: [] };
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ origins, tags }));
  } catch {}
}

// The problems from the chosen origins and topics.
const chosenPool = () => withTags(fromOrigins(problems, origins), tags);

// Topics with nothing from the chosen origins are dropped.
const keepTopicsInOrigins = () => {
  tags = tags.filter((tag) => fromOrigins(problems, origins).some(({ problem }) => problem.tags.includes(tag)));
};

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

// A card such as 'H6' or 'ST': '♥6', '♠10'.
function cardHTML(card) {
  const red = card[0] === 'H' || card[0] === 'D';
  return `<span class="${red ? 'red' : ''}">${SYMBOLS[card[0]]}${card[1] === 'T' ? '10' : card[1]}</span>`;
}

// A problem's answer, or a player's: a card for a lead or a play, else a call.
const answerHTML = (problem, answer) => (problem.lead || problem.play ? cardHTML(answer) : callHTML(answer));
// What the player did, for "You led ♥A", "You played ♥3", "You bid 2♥".
const answerVerb = (problem, deal) => (problem.lead || deal.trick?.length === 0 ? 'led' : problem.play ? 'played' : 'bid');

// "4♠", "5♣ doubled".
function contractHTML({ level, strain, doubled }) {
  return `${callHTML(`${level}${strain}`)}${{ X: ' doubled', XX: ' redoubled' }[doubled] ?? ''}`;
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
    if (seat === deal.dealer) tags.push('dlr');
    return `<div class="${classes.join(' ')}">${seat}<small>${tags.join(' · ')}</small></div>`;
  }).join('');

  const cells = [];
  for (let i = 0; i < TABLE_ORDER.indexOf(deal.dealer); i++) cells.push('<div></div>');
  const marks = marksFor(deal);
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
  if (problem.lead) return renderLead();
  if (problem.play) return renderPlay();
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

// An opening lead: the whole auction, then your hand at the bottom, where
// the thumb reaches, with each card a button.
function renderLead() {
  const { item } = session[index];
  const { deal, seat } = item;
  const final = contract(deal.dealer, deal.auction);

  app.className = 'problem-screen lead-screen';
  app.innerHTML = `
    <header class="bar">
      <button class="quit" data-action="quit" aria-label="Stop these challenges">✕</button>
      <span class="progress">${index + 1} of ${session.length}</span>
      <span class="setting">You are ${SEAT_NAMES[seat]} · ${VUL_NAMES[deal.vul]}</span>
    </header>
    <section class="auction">${auctionHTML(deal, seat, deal.auction)}</section>
    <p class="lead-prompt">${contractHTML(final)} by ${SEAT_NAMES[final.declarer]}. Your lead.</p>
    <section class="lead-hand" aria-label="Your hand: tap the card to lead">${cardButtonsHTML(deal.hands[seat])}</section>
    <div class="confirm">
      <button class="secondary" data-action="cancel"${selected ? '' : ' disabled'}>Cancel</button>
      <button class="primary" data-action="confirm"${selected ? '' : ' disabled'}>${selected ? `Lead ${cardHTML(selected)}` : 'Choose a card'}</button>
    </div>`;
  scrollAuction();
}

// Your cards as buttons to tap, one suit per line, or only the suits a
// position shows. Cards that don't follow suit are disabled.
function cardButtonsHTML(handText, { suits = SUITS, led = null } = {}) {
  const hand = parseHand(handText);
  const canFollow = led && hand[led];
  return suits.map((suit) => {
    const red = suit === 'H' || suit === 'D';
    const cards = [...hand[suit]].map((rank) => {
      const card = suit + rank;
      const disabled = canFollow && suit !== led ? ' disabled' : '';
      return `<button class="card${red ? ' red' : ''}${card === selected ? ' selected' : ''}" data-card="${card}"${disabled}>${rank === 'T' ? '10' : rank}</button>`;
    });
    return `<div class="holding"><span class="suit${red ? ' red' : ''}">${SYMBOLS[suit]}</span>${cards.join('') || '<span class="void">—</span>'}</div>`;
  }).join('');
}

// A play position: dummy's cards left, then the trick so far round a
// compass, with "?" (or your card, once chosen or answered) in your place.
function positionHTML(deal, you, yourCard = null) {
  const suits = [...(deal.shown ?? SUITS.join(''))];
  const dummy = dummyOf(deal);
  const played = Object.fromEntries(trickSeats(deal).map((seat, i) => [seat, deal.trick[i]]));
  const dummyLeft = parseHand(deal.hands[dummy]);
  if (played[dummy]) dummyLeft[played[dummy][0]] = dummyLeft[played[dummy][0]].replace(played[dummy][1], '');
  const role = (seat) => (seat === you ? 'you' : seat === dummy ? 'dummy' : seat === deal.declarer ? 'declarer' : 'partner');
  const spot = (seat) => {
    const card = seat === you ? yourCard : played[seat];
    const content = card ? cardHTML(card) : seat === you ? '<span class="cursor">?</span>' : '';
    return `<div class="spot spot-${seat.toLowerCase()}${seat === deal.leader ? ' led' : ''}">
      <small>${SEAT_NAMES[seat]} · ${role(seat)}</small><span class="played">${content}</span></div>`;
  };
  return `
    ${deal.context ? `<p class="hint position-context">${escapeHTML(deal.context)}</p>` : ''}
    <div class="dummy-hand">
      <div class="deal-label">Dummy (${SEAT_NAMES[dummy]})</div>
      ${suits.map((suit) => holdingHTML(dummyLeft, suit)).join('')}
    </div>
    ${(deal.earlier ?? []).map((trick, k) => earlierHTML(trick, k, role)).join('')}
    ${deal.trick.length ? `<div class="trick" aria-label="The trick so far">${SEATS_ORDER.map(spot).join('')}</div>` : ''}`;
}

// A trick played before the position, as a line: "Trick 1: you led ♥K,
// dummy ♥2, partner ♥8, declarer ♥4."
function earlierHTML(trick, k, role) {
  const plays = earlierSeats(trick).map((seat, i) =>
    `${role(seat)}${i === 0 ? ' led' : ''} ${cardHTML(trick.cards[i])}`);
  return `<p class="earlier"><strong>Trick ${k + 1}:</strong> ${plays.join(', ')}.</p>`;
}
const SEATS_ORDER = ['N', 'W', 'E', 'S'];

// A play problem: the contract, dummy and the trick so far, then your
// cards at the bottom to tap.
function renderPlay() {
  const { item } = session[index];
  const { deal, seat } = item;
  const suits = [...(deal.shown ?? SUITS.join(''))];
  app.className = 'problem-screen play-screen';
  app.innerHTML = `
    <header class="bar">
      <button class="quit" data-action="quit" aria-label="Stop these challenges">✕</button>
      <span class="progress">${index + 1} of ${session.length}</span>
      <span class="setting">You are ${SEAT_NAMES[seat]} · ${callHTML(deal.contract)} by ${SEAT_NAMES[deal.declarer]}</span>
    </header>
    <section class="position">${positionHTML(deal, seat, selected)}</section>
    <p class="lead-prompt">${deal.trick.length ? 'Which card do you play?' : 'Which card do you lead?'}</p>
    <section class="lead-hand" aria-label="Your cards: tap the one to play">${cardButtonsHTML(deal.hands[seat], { suits, led: deal.trick[0]?.[0] })}</section>
    <div class="confirm">
      <button class="secondary" data-action="cancel"${selected ? '' : ' disabled'}>Cancel</button>
      <button class="primary" data-action="confirm"${selected ? '' : ' disabled'}>${selected ? `${deal.trick.length ? 'Play' : 'Lead'} ${cardHTML(selected)}` : 'Choose a card'}</button>
    </div>`;
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

// For an opening lead, the tricks the defense takes after each card the
// leader could lead, under the leader's hand, with the leads that beat
// the contract marked.
function leadsHTML(deal, seat) {
  const tricks = dd[deal.id]?.lead;
  if (!tricks) return '';
  const final = contract(deal.dealer, deal.auction);
  const beat = 8 - final.level;
  const hand = parseHand(deal.hands[seat]);
  const holding = (suit) => {
    const red = suit === 'H' || suit === 'D';
    const cards = [...hand[suit]].map((rank) => {
      const taken = tricks[suit + rank];
      return `<span class="lead-result${taken >= beat ? ' beats' : ''}">${rank === 'T' ? '10' : rank}<small>${taken}</small></span>`;
    });
    return `<div class="holding"><span class="suit${red ? ' red' : ''}">${SYMBOLS[suit]}</span>${cards.join('') || '—'}</div>`;
  };
  return `
    <h2>Double dummy leads</h2>
    <p class="dd-note">Tricks the defense takes after each lead, with all four hands seen and perfect play. Green leads beat ${contractHTML(final)} (${beat} tricks).</p>
    <div class="leads">${SUITS.map(holding).join('')}</div>`;
}

// Where the board comes from: "Texas transfers lesson, board 6", or a
// club or teacher's board's own `source`.
function boardSource({ deal, title }) {
  if (deal.source) return deal.source;
  return `${title} lesson, ${deal.part ? `part ${deal.part}, ` : ''}board ${deal.board}`;
}

// The board under the feedback: the auction, then the whole deal with
// double dummy results, or just your hand if that's all there is.
function boardFeedbackHTML(item, problem) {
  const { deal, seat } = item;
  return `
    <h2>${isFullDeal(deal) ? 'The whole board' : 'The auction'}</h2>
    <p class="hint">${escapeHTML(boardSource(item))}</p>
    <section class="auction">${auctionHTML(deal, seat, deal.auction, { highlight: problem.at })}</section>
    ${isFullDeal(deal)
      ? `${dealHTML(deal, seat)}${problem.lead ? leadsHTML(deal, seat) : ''}${doubleDummyHTML(deal)}`
      : `<div class="deal-hand you lone-hand"><div class="deal-label">${SEAT_NAMES[seat]} (you) · ${hcp(parseHand(deal.hands[seat]))}</div>${handHTML(deal.hands[seat])}</div>`}`;
}

// A play problem's position under the feedback, with your card in place.
function positionFeedbackHTML(item, call) {
  const { deal, seat } = item;
  const suits = [...(deal.shown ?? SUITS.join(''))];
  const hand = parseHand(deal.hands[seat]);
  return `
    <h2>The position</h2>
    <p class="hint">${callHTML(deal.contract)} by ${SEAT_NAMES[deal.declarer]} · ${escapeHTML(boardSource(item))}</p>
    <section class="position">${positionHTML(deal, seat, call)}</section>
    <div class="deal-hand you lone-hand"><div class="deal-label">${SEAT_NAMES[seat]} (you)</div>${suits.map((suit) => holdingHTML(hand, suit)).join('')}</div>`;
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
    notes.push(`<p><strong>Why not ${answerHTML(problem, call)}?</strong> ${proseHTML(problem.whyNot[call])}</p>`);
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
            ? `${answerHTML(problem, call)} is the answer.`
            : `You ${answerVerb(problem, deal)} ${answerHTML(problem, call)}. The answer is ${answerHTML(problem, problem.answer)}.`}</p>
        </div>
      </header>
      ${notes.join('')}
      <h2>Why ${answerHTML(problem, problem.answer)}</h2>
      <p>${proseHTML(problem.explanation)}</p>
      ${alternatives.map(([c, why]) => `<p><strong>Also fine: ${answerHTML(problem, c)}.</strong> ${proseHTML(why)}</p>`).join('')}
      ${deal.atTheTable ? `<h2>At the club</h2><p>${proseHTML(deal.atTheTable)}</p>` : ''}
      ${isPosition(deal) ? positionFeedbackHTML(item, call) : boardFeedbackHTML(item, problem)}
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
  // More challenges takes the same origins and topics, if any are ready.
  const more = readyNow(chosenPool(), progress).length;
  const rows = session.map(({ item, call }, i) => {
    const result = grade(item.problem, call);
    const answer = result === 'best' ? '' : ` · answer ${answerHTML(item.problem, item.problem.answer)}`;
    return `<li class="${result}"><button data-review="${i}">
      <span class="mark" aria-hidden="true">${GRADES[result].icon}</span>
      <span class="result-text">
        <small>${escapeHTML(topicName(item.problem.tags[0]))}</small>
        You ${answerVerb(item.problem, item.deal)} ${answerHTML(item.problem, call)}${answer}
      </span>
      <span class="chevron" aria-hidden="true">›</span>
    </button></li>`;
  }).join('');

  app.className = 'summary-screen';
  app.innerHTML = `
    <h1>${right} of ${session.length} right</h1>
    <p class="hint">Tap a challenge to look at it again.</p>
    <ul class="results">${rows}</ul>
    ${missed ? `<button class="primary" data-action="missed">Practice the ${missed === 1 ? 'one' : `${missed}`} I missed</button>` : ''}
    ${more ? `<button class="${missed ? 'secondary' : 'primary'}" data-action="again">More challenges</button>` : ''}
    <button class="secondary" data-action="home">Home</button>`;
  window.scrollTo(0, 0);
}

// "later today", "tomorrow", "in 3 days", or "on" a date such as "3 Oct".
function dueText(time) {
  const startOfDay = (t) => new Date(t).setHours(0, 0, 0, 0);
  const days = Math.round((startOfDay(time) - startOfDay(Date.now())) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'later today';
  if (days === 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  return `on ${new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
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

// The home screen: where the deals come from, which topics to practice,
// progress, and Start.
function renderHome() {
  const chip = (data, name, count, on) =>
    `<button class="chip${on ? ' on' : ''}" ${data} aria-pressed="${on}">${escapeHTML(name)}${count ? ` <small>${count}</small>` : ''}</button>`;
  // Only origins with problems are offered.
  const originChips = [
    chip('data-origin=""', 'All', 0, !origins.length),
    ...Object.entries(ORIGINS)
      .filter(([key]) => fromOrigins(problems, [key]).length)
      .map(([key, { name }]) => chip(`data-origin="${key}"`, name, 0, origins.includes(key))),
  ].join('');
  const topics = [
    chip('data-tag=""', 'All', 0, !tags.length),
    ...topicsIn(fromOrigins(problems, origins))
      .map(({ tag, name, count }) => chip(`data-tag="${tag}"`, name, count, tags.includes(tag))),
  ].join('');

  const pool = chosenPool();
  const deals = dealCount(pool);
  // A session has at most one problem per deal, so fewer deals with a
  // problem ready than SESSION_SIZE means a shorter session.
  const size = Math.min(SESSION_SIZE, dealCount(readyNow(pool, progress)));

  const { seen, right, lastAt } = progressSummary(pool, progress);

  app.className = 'home-screen';
  app.innerHTML = `
    <header>
      <h1>Bridge Practicer</h1>
      <p class="hint">Bidding and defense challenges
        <button class="about-button" data-action="about" aria-label="About these challenges">ⓘ</button></p>
    </header>
    <dialog class="about" aria-label="About these challenges">
      <h2>About these challenges</h2>
      <p>A collection of bridge challenges I want to get better at remembering: from lessons I've taken, hands I've played at the club, and bridge teaching I've found online.</p>
      <p>Each one shows a hand and asks for the call, the opening lead or the card to play, then explains the answer.</p>
      <button class="primary" data-action="close-about">Close</button>
    </dialog>
    <section>
      <h2>From</h2>
      <div class="chips">${originChips}</div>
      <h2>Topics</h2>
      <div class="chips">${topics}</div>
      <p class="hint">${pool.length} challenge${pool.length === 1 ? '' : 's'} from ${deals} deal${deals === 1 ? '' : 's'}. A set has at most one challenge from each deal. One you got right comes back the next day, then after longer and longer gaps.</p>
    </section>
    <section>
      <h2>Progress${tags.length ? ' on these' : ''}</h2>
      <div class="stats">
        <div><strong>${seen}</strong> of ${pool.length} tried</div>
        <div><strong>${right}</strong> right last time</div>
        <div><strong>${lastAt ? whenText(lastAt) : 'Not yet'}</strong> last practiced</div>
      </div>
    </section>
    <div class="starts">
      ${size ? `<button class="primary" data-action="start">${size} challenge${size === 1 ? '' : 's'}</button>`
        : `<p class="hint">You’ve done all of these for now. More are due ${dueText(nextDue(pool, progress))}.</p>
      <button class="primary" disabled>All caught up</button>`}
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
  const others = pool.filter((item) => !first || boardOf(item.deal) !== boardOf(first.deal));
  const picked = pickSession(others, first ? size - 1 : size, { progress });
  session = (first ? [first, ...picked] : picked).map((item) => ({ item, call: null }));
  index = 0;
  selected = null;
  // With nothing ready, the home screen says when more are due.
  screen = session.length ? 'problem' : 'home';
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
  // The About popup: a tap on its backdrop (the dialog itself) closes it.
  if (event.target.matches('dialog.about')) {
    event.target.close();
    return;
  }
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.action === 'about' || button.dataset.action === 'close-about') {
    const about = app.querySelector('dialog.about');
    if (button.dataset.action === 'about') about.showModal();
    else about.close();
    return;
  }

  const { call, card, action, origin, tag, review } = button.dataset;
  if (call || card) {
    selected = call ?? card;
  } else if (origin !== undefined) {
    // As with topics: "All" clears the choice, an origin toggles.
    origins = !origin ? [] : origins.includes(origin) ? origins.filter((o) => o !== origin) : [...origins, origin];
    keepTopicsInOrigins();
    saveSettings();
  } else if (tag !== undefined) {
    // "All" clears the choice; a convention toggles, and none left is all.
    tags = !tag ? [] : tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    saveSettings();
  } else if (review !== undefined) {
    index = Number(review);
    screen = 'review';
  } else if (action === 'start') {
    startSession(chosenPool(), SESSION_SIZE);
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
    startSession(chosenPool(), SESSION_SIZE);
    return;
  } else if (action === 'home') {
    // Home starts again from all topics, keeping the origins.
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
    const files = await Promise.all(
      problemFiles().map(({ origin, path }) => fetch(path).then((response) => {
        if (!response.ok) throw new Error(`${path}: ${response.status}`);
        return response.json().then((file) => ({ ...file, origin }));
      })),
    );
    problems = flatten(files);
    // Without storage (e.g. a private window), progress lasts until the
    // page closes.
    progress = await loadProgress().catch((error) => {
      console.error(error);
      return {};
    });
    requestPersistence().catch(() => {});
    // Double dummy results are extra: the app works without them.
    dd = await fetch('problems/dd.json').then((response) => (response.ok ? response.json() : {})).catch(() => ({}));
    // "Club hands" was a topic before the club was an origin.
    if (tags.includes('club') && !origins.includes('club')) origins.push('club');
    // Forget origins and topics no longer in the problems.
    origins = origins.filter((o) => fromOrigins(problems, [o]).length);
    keepTopicsInOrigins();
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
