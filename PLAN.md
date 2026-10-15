# Bridge Practicer: plan

A phone web app (PWA) for drilling the bidding conventions from Dave and
Donna's lessons. Each problem shows your hand and the auction so far;
you choose a call and get the best call, an explanation, and the whole
deal. The goal is to make the conventions automatic, through short mixed
sessions before going to the club.

We build it one step at a time, as with the bid recorder. Each step ends
with a review: read the code, try it, and course-correct before moving on.

## Decisions so far

- **Curated problems first**, taken from the example boards in the lesson
  handouts (about 58 deals, roughly 100 problems). Generated hands come
  later, and only if we start recognising the curated ones. They would
  be generated ahead of time and shipped with the app, not made up live.
- **Mixed sessions** of 10 or 20 problems, with the conventions mixed so
  that recognising the situation is part of the test. A filter by
  convention is there for focused study.
- **"The convention doesn't apply" problems** are included, e.g. Texas is
  off over a 3♦ overcall, and 1♠ rather than a negative double with five
  spades.
- **Every decision is its own problem.** A deal can have several (the
  transfer, the completion, the RKCB reply). A session never shows two
  problems from the same deal, so one can't give away another's answer.
  The feedback shows the whole deal and auction, so you still see the
  sequence.
- **Answers are graded best, acceptable or wrong.** A problem can list
  acceptable alternatives, and notes on tempting wrong calls ("why not").
- **Answers follow our system:** SAYC (not 2/1), 1NT 15–17, 2NT 20–22,
  2♣ 22+, and the treatments in the handouts. Where a handout's
  commentary is wrong (it sometimes names the wrong player), the problem
  follows the auction and says so in its review notes.
- **Each phone keeps its own progress.** No accounts, no syncing.
- **Tap, then confirm.** Tapping a call selects it: it shows in the
  auction in place of the "?", and Bid (beside Cancel) confirms it. That
  gives a moment to check your thinking before committing.
- **The auction scrolls to its last row** so the latest calls sit just
  above the bidding box, with a tag when earlier calls are scrolled out
  of view. Levels of the bidding box with no legal bid left are hidden,
  so long auctions have room.
- **Double dummy results under the deal** on the feedback screen: the
  tricks each player takes as declarer in each strain, how the contract
  played fares, and par. They're worked out ahead of time with DDS and
  stored in `problems/dd.json`, so the app never runs a solver.

## Tech choices

The same as the bid recorder:

- **Plain HTML, CSS and JavaScript (ES modules).** No framework and no
  build step.
- **IndexedDB** for progress on the phone.
- **Node.js** only for development: `node --test`, the problem checker,
  the review page builder, and a dev server. No npm packages.
- **Service worker and manifest** so it installs and works offline.
- `js/auction.js` and its tests are copied from the bid recorder, so both
  apps follow the same rules.

## Layout

```
problems/<lesson>.json   the problems, one file per lesson
js/auction.js            auction rules (from the bid recorder)
js/hands.js              hands, point counts, writing hands and calls
test/                    unit tests
scripts/check.mjs        checks every deal and problem
scripts/build-review.mjs builds review/index.html for checking problems
scripts/review.css       the review page's styles
scripts/dd.mjs           solves every deal into problems/dd.json (npm run dd)
scripts/dd/dd-table.cpp  the small program that calls DDS
scripts/serve.mjs        dev server for trying the app on the phone
index.html, styles.css   the app
js/app.js                the app's screens
js/problems.js           grading, progress and picking problems
js/store.js              saving answers and progress (IndexedDB)
vendor/                  DDS source and the compiled solver (not committed)
```

The service worker and manifest arrive with step 5.

## Problem format

```js
{
  lesson: 'texas',               // file name and tag for the lesson
  title: 'Texas transfers',
  source: 'Texas Hands Explan.pdf',
  deals: [{
    id: 'texas-1',               // never changes once published
    board: 1,                    // board number in the handout
    dealer: 'N',                 // N E S W
    vul: 'None',                 // None NS EW All
    hands: { N: 'A2.JT54.AQ4.AJT2', E: …, S: …, W: … },  // PBN style, T = ten
    auction: ['1N', 'P', '4H', 'P', '4S', 'P', 'P', 'P'], // from the dealer, complete
    handout: '…',                // the handout's commentary on the bidding
    reviewNotes: ['…'],          // optional: anything for us to check
    problems: [{
      id: 'texas-1a',            // never changes: progress is stored by id
      at: 2,                     // index in the auction of the call to make
      answer: '4H',              // normally the auction's call at `at`
      answerNote: '…',           // required if the answer differs from the auction
      acceptable: { '6S': '…' }, // optional: other calls that are fine, and why
      whyNot: { '4S': '…' },     // optional: tempting wrong calls, and why not
      tags: ['texas'],           // conventions the problem tests
      explanation: '…',
    }],
  }],
}
```

`npm run check` verifies every deal: four 13-card hands making one full
deck with ranks in order, dealer and vulnerability matching the board
number, a legal and complete auction, legal answers, acceptable calls and
why-nots, unique problem ids, and an answer that matches the auction
unless an `answerNote` explains why it doesn't. It also fails if a deal's
double dummy results are missing or out of date (`npm run dd` fixes it).

## Screens

1. **Home:** convention chips (All, or any mix of conventions, remembered
   on the phone), Start with 10 or 20 problems (fewer if the filter leaves
   fewer deals), and from step 4 a line of progress (problems seen, share
   right, last practised).
2. **Problem:** "3 of 10", your seat, dealer and vulnerability, your hand
   (large, one suit per line), the auction table (W N E S, as in the bid
   recorder) with "?" at your turn, and a bidding box with illegal calls
   greyed out. ✕ stops the session early, going to the summary.
3. **Feedback:** right, acceptable or wrong; your call beside the best
   call; the explanation; the "why not" note for your call if there is
   one; the whole deal and auction; double dummy results; Next.
4. **Summary:** the score, each problem with a tick or cross, its
   convention and the answer (tap to look again), "Practise the ones I
   missed", New session and Home.

**Choosing problems.** At most one problem per deal. Within that, prefer
problems never seen, then ones answered wrong last time, then ones due
soonest, picking at random among equals, and shuffle the session. Each
problem keeps a level that drops to 0 when answered wrong and rises by
one when answered right or acceptably. A problem is due 1, 3, 7, 14 or
30 days (by level) after it was last answered, so missed problems come
back sooner and known ones fade out.

## Steps

### 1. Problem format, checker and review page: done
Texas transfers written up (8 deals, 16 problems) and reviewed.
`js/auction.js` copied from the bid recorder.

### 2. The problem screen (the core): done
One problem at a time from the Texas set: hand, auction, bidding box,
then the feedback screen with the whole deal. Dev server so it can be
opened on the iPhone. A session is already a random set with one
problem per deal (8 for Texas), ending with a bare summary.
**Review:** try it on the phone. This is the main checkpoint for how it
feels: hand size, the bidding box, and how long the explanations are.
Added during review: tap then confirm, and double dummy results.

### 3. Sessions: done
Home screen, choosing 10 or 20 problems by the rules above, the summary
screen, and the convention filter. Problems are picked at random until
step 4 stores progress.
**Review:** run a few sessions.

### 4. Progress: done
IndexedDB storage of every answer, levels for choosing problems, and the
progress line on the home screen.
**Review:** check that missed problems come back.
Progress on the home screen follows the convention chips. Note: an
iPhone home screen app keeps its own storage, separate from Safari's,
so progress starts fresh once it's installed (step 5).

### 5. PWA: installable and works offline
**Review:** install it and try it in airplane mode.

### 6. The other lessons
Stayman, new minor forcing, negative doubles, Jacoby 2NT, RKCB and
control bids, one lesson at a time, each with a review page. This can
run alongside steps 3 to 5.

### 7. Hosting
Depends on the open question below.

### 8. Use it before a session, then iterate

## Open questions

- **Public or private.** GitHub Pages hosting is free for a public repo.
  But the deals and the quoted commentary come from our teacher's
  handouts, so we should ask the teacher before publishing, or rewrite
  the commentary in our own words. Until then the repo stays local.

## Working agreements

- At the end of each step, after your review, I commit that step if you
  want me to.
- The lesson handouts stay out of the repo (they're the teacher's).
