// Builds review/index.html: every problem as the app will ask it, with the
// answer, explanation and full deal, for checking before they go in the app.
// Usage: node scripts/build-review.mjs [lesson …]   (default: every lesson)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { seatOfCall } from '../js/auction.js';
import { SUITS, SUIT_SYMBOLS, formatCall, formatHolding, hcp, parseHand } from '../js/hands.js';
import { LESSONS } from '../js/problems.js';

const root = new URL('../', import.meta.url).pathname;
const SEAT_NAMES = { N: 'North', E: 'East', S: 'South', W: 'West' };
const VUL_NAMES = { None: 'None vul', NS: 'N-S vul', EW: 'E-W vul', All: 'Both vul' };
const TABLE_ORDER = ['W', 'N', 'E', 'S'];

const esc = (text) => String(text)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Suit symbols in prose get their suit's color.
const prose = (text) => esc(text).replace(/[♠♥♦♣]/g, (s) => `<span class="${suitClass(s)}">${s}</span>`);
const suitClass = (symbol) => (symbol === '♥' || symbol === '♦' ? 'red' : 'black');

function call(code) {
  return prose(formatCall(code));
}

function handHtml(handText, { label } = {}) {
  const hand = parseHand(handText);
  const rows = SUITS.map((suit) => `<div class="holding"><span class="${suitClass(SUIT_SYMBOLS[suit])}">${SUIT_SYMBOLS[suit]}</span> ${formatHolding(hand[suit])}</div>`).join('');
  return `<div class="hand">${label ? `<div class="hand-label">${label}</div>` : ''}${rows}</div>`;
}

// Bidding table in W N E S columns. With `upTo`, stops there and shows "?".
function auctionHtml(deal, upTo) {
  const cells = Array(TABLE_ORDER.indexOf(deal.dealer)).fill('<td></td>');
  const calls = upTo === undefined ? deal.auction : deal.auction.slice(0, upTo);
  let shown = calls.map((c) => `<td>${call(c)}</td>`);
  if (upTo === undefined) {
    // End with "All pass", as the handouts do.
    shown = shown.slice(0, -3).concat('<td colspan="3" class="all-pass">All pass</td>');
  } else {
    shown.push('<td class="you">?</td>');
  }
  const all = cells.concat(shown);
  const rows = [];
  for (let i = 0; i < all.length; i += 4) rows.push(`<tr>${all.slice(i, i + 4).join('')}</tr>`);
  const head = TABLE_ORDER.map((s) => `<th>${SEAT_NAMES[s]}</th>`).join('');
  return `<table class="auction"><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function dealDiagram(deal) {
  const h = (seat) => handHtml(deal.hands[seat], { label: `${SEAT_NAMES[seat]} · ${hcp(parseHand(deal.hands[seat]))}` });
  return `<div class="diagram">
    <div class="d-n">${h('N')}</div><div class="d-w">${h('W')}</div>
    <div class="d-c"><div class="compass"><span>N</span><span>W</span><span>E</span><span>S</span></div></div>
    <div class="d-e">${h('E')}</div><div class="d-s">${h('S')}</div>
  </div>`;
}

function problemHtml(deal, problem) {
  const seat = seatOfCall(deal.dealer, problem.at);
  const letter = problem.id.slice(deal.id.length);
  const acceptable = Object.entries(problem.acceptable ?? {});
  const whyNot = Object.entries(problem.whyNot ?? {});
  return `<article class="problem" id="${problem.id}">
    <header class="problem-head">
      <h3>Problem ${deal.board}${letter}</h3>
      <p class="setting">You are ${SEAT_NAMES[seat]} · Dealer ${SEAT_NAMES[deal.dealer]} · ${VUL_NAMES[deal.vul]}</p>
      <p class="tags">${problem.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</p>
    </header>
    <div class="problem-body">
      <div class="question">
        ${handHtml(deal.hands[seat], { label: 'Your hand' })}
        ${auctionHtml(deal, problem.at)}
      </div>
      <div class="answer">
        <p class="answer-call"><span class="answer-label">Answer</span> ${call(problem.answer)}</p>
        <p>${prose(problem.explanation)}</p>
        ${acceptable.length ? `<dl class="calls acceptable"><dt class="list-title">Also acceptable</dt>${acceptable.map(([c, why]) => `<div><dt>${call(c)}</dt><dd>${prose(why)}</dd></div>`).join('')}</dl>` : ''}
        ${whyNot.length ? `<dl class="calls"><dt class="list-title">Why not…</dt>${whyNot.map(([c, why]) => `<div><dt>${call(c)}</dt><dd>${prose(why)}</dd></div>`).join('')}</dl>` : ''}
        ${problem.answerNote ? `<p class="note">${prose(problem.answerNote)}</p>` : ''}
      </div>
    </div>
  </article>`;
}

function dealHtml(deal) {
  const notes = deal.reviewNotes ?? [];
  return `<section class="deal" id="${deal.id}">
    <h2>Board ${deal.board}</h2>
    ${notes.length ? `<div class="check"><span class="check-label">Please check</span><ul>${notes.map((n) => `<li>${prose(n)}</li>`).join('')}</ul></div>` : ''}
    ${deal.problems.map((p) => problemHtml(deal, p)).join('')}
    <div class="full">
      <h3>The whole board</h3>
      <div class="full-body">
        ${dealDiagram(deal)}
        <div>
          ${auctionHtml(deal)}
          <blockquote><span class="answer-label">Handout</span> ${prose(deal.handout)}</blockquote>
        </div>
      </div>
    </div>
  </section>`;
}

// The lessons named on the command line (npm run review -- stayman), or all.
const names = process.argv.length > 2 ? process.argv.slice(2) : LESSONS;
const lessons = names.map((name) => JSON.parse(readFileSync(join(root, 'problems', `${name}.json`), 'utf8')));
const problemCount = lessons.reduce((n, l) => n + l.deals.reduce((m, d) => m + d.problems.length, 0), 0);
const flagged = lessons.flatMap((l) => l.deals.filter((d) => d.reviewNotes?.length));

const css = readFileSync(join(root, 'scripts/review.css'), 'utf8');
const html = `<title>Bridge Practicer Problems</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Literata:opsz,wght@7..72,500;7..72,700&display=swap">
<style>${css}</style>
<main>
  <header class="intro">
    <p class="eyebrow">Bridge practicer · draft problems for review</p>
    <h1>${lessons.map((l) => esc(l.title)).join(', ')}</h1>
    <p>${problemCount} problems from ${lessons.reduce((n, l) => n + l.deals.length, 0)} lesson boards. Each one shows what the app will ask (your hand and the auction so far), then the answer it will give. Check that the answers are right and the explanations say what you'd want to read at the table.</p>
    ${flagged.length ? `<p>Boards with something to check: ${flagged.map((d) => `<a href="#${d.id}">${d.board}</a>`).join(', ')}.</p>` : ''}
  </header>
  ${lessons.map((l) => l.deals.map(dealHtml).join('')).join('')}
</main>
`;

mkdirSync(join(root, 'review'), { recursive: true });
writeFileSync(join(root, 'review/index.html'), html);
console.log(`Wrote review/index.html: ${problemCount} problems`);
