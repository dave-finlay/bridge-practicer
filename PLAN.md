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
- **Mixed sessions** of 10 problems, with the conventions mixed so
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
- **Alerts and announcements are marked** in the auction, as ACBL rules
  and our agreements require: a red box for an alert, blue for an
  announcement (the convention card's colours), and tapping one shows
  its meaning. `js/alerts.js` works them out from the auction by rules,
  so the problem files don't list them. Announced: 1NT openings (15 to
  17), Jacoby and Texas transfers, and a super-accept. Alerted: Jacoby
  2NT and opener's three-level answers, new minor forcing, and Stayman
  over interference (double of 2♣, or a cue bid). Not marked: Stayman,
  negative doubles, strong 2♣, RKCB, control bids.
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
scripts/make-icons.swift draws the app icons (npm run icons)
manifest.webmanifest, sw.js, icons/  installing and offline use
index.html, styles.css   the app
js/app.js                the app's screens
js/problems.js           grading, progress and picking problems
js/alerts.js             which calls are alerted or announced
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
    part: 2,                     // optional: which handout, for a lesson in two
    board: 1,                    // board number in the handout
    dealer: 'N',                 // N E S W
    vul: 'None',                 // None NS EW All
    hands: { N: 'A2.JT54.AQ4.AJT2', E: …, S: …, W: … },  // PBN style, T = ten
    auction: ['1N', 'P', '4H', 'P', '4S', 'P', 'P', 'P'], // from the dealer, complete
    handout: '…',                // the handout's commentary on the bidding
    reviewNotes: ['…'],          // optional: anything for us to check
    unusualSetup: '…',           // optional: why dealer or vulnerability isn't the board's usual
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
number (unless `unusualSetup` explains why not), a legal and complete
auction, legal answers, acceptable calls and why-nots, unique problem
ids, and an answer that matches the auction unless an `answerNote`
explains why it doesn't. It also fails if a deal's double dummy results
are missing or out of date (`npm run dd` fixes it).

## Screens

The app calls the problems **challenges** ("10 bidding challenges",
"More challenges"); "session" isn't used on screen.

1. **Home:** convention chips (All, or any mix of conventions, remembered
   on the phone; Home from the summary goes back to All), Start with 10
   bidding challenges (fewer if the filter leaves fewer deals; a choice
   of 20 was dropped as more than anyone wanted at once), and
   progress (problems seen, share right, last practised).
2. **Problem:** "3 of 10", your seat, dealer and vulnerability, your hand
   (large, one suit per line), the auction table (W N E S, as in the bid
   recorder) with "?" at your turn, and a bidding box with illegal calls
   greyed out. ✕ stops the session early, going to the summary.
3. **Feedback:** right, acceptable or wrong; your call beside the best
   call; the explanation; the "why not" note for your call if there is
   one; the whole deal and auction; double dummy results; Next.
4. **Summary:** the score, each problem with a tick or cross, its
   convention and the answer (tap to look again), "Practise the ones I
   missed", More challenges (same conventions) and Home.

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
`manifest.webmanifest`, icons (`npm run icons`) and `sw.js`, the same
approach as the bid recorder: the phone keeps a copy of every file and
refreshes it in the background, so updates show on the second opening.
`npm run check` fails if a script or lesson file is missing from the
service worker's list.
**Review:** install it and try it in airplane mode.

### 6. The other lessons
Stayman, new minor forcing, negative doubles, Jacoby 2NT, RKCB and
control bids, one lesson at a time, each with a review page
(`npm run review -- <lesson>`). This can run alongside steps 3 to 5.
Done: Stayman (8 deals, 28 problems), negative doubles (16 deals, 45
problems), new minor forcing (6 deals, 15 problems), Jacoby 2NT (6
deals, 22 problems), RKCB (6 deals, 21 problems), control bids (8
deals, 28 problems), Jacoby transfers (8 deals, 25 problems).

### 7. Hosting: done
Public GitHub Pages from `main`, at
https://dave-finlay.github.io/bridge-practicer/ (repo
dave-finlay/bridge-practicer). Pushing to `main` publishes.

### 8. Use it before a session, then iterate

## To do: more topics

None of these have handouts, so each needs its own deals: written to
fit the topic, or taken from real hands (see below). Problems built this
way leave out the `handout` field and say where the deal came from.

**Later**
- **Minor suit transfers.** We've agreed to play them but have no
  handout, and we need to settle which version first.

**We understand these but don't play them**
- **Balancing:** bidding in the pass-out seat with less than usual.
- **Cue bids of the opponents' suit:** e.g. a cue bid raise showing a
  limit raise or better after an overcall, and a cue bid asking for a
  stopper.

These can go in as they are, since the answers don't depend on our own
agreements. Before each, we agree which version we'd use.

**To explore, and decide whether to play**
- **Unusual 2NT**: the two lowest unbid suits.
- **Michaels cue bid**: both majors, or a major and a minor.
- **Drury / reverse Drury**: a passed hand's 2♣ asking whether a
  third- or fourth-seat opener is light.
- **Support doubles**: opener's double showing three-card support for
  responder's major after an interfering bid.
- **Finding 3NT after a minor suit fit**: showing stoppers (and asking
  for them) once a minor fit is found, so 3NT is reached instead of 5 of
  a minor; inverted minors fit here too.

For these, I'd write a short summary of the convention first, as a
page like the review page, so we can decide whether to play it. If we
do, the agreement goes in `~/context/bridge/agreements.md` before any
problems are written.

**A scoring trainer**
- A second mode, chosen on the home screen: Bidding or Scoring. Same
  app, one install, one progress store. Duplicate scoring, as at the
  club.
- **Problems are made up on the spot**, since scoring is arithmetic: a
  contract, doubled or not, vulnerability and tricks taken. A scoring
  function in `js/` (with tests) works out the answer.
- **Paired questions**: "2NT vulnerable, 7 tricks: your score?" then
  "and if you'd made it?", so the difference sinks in (−100 against
  +120). The same for game against partscore, and doubled against
  undoubled.
- **Answering** with a number pad, plus or minus for your side. The
  feedback breaks the score down: trick score, partscore or game bonus
  (50, or 300 / 500 vulnerable), slam bonus, overtricks, and the bonus
  for making a doubled contract.
- **Levels**: undoubled makes and downs; game against partscore at each
  vulnerability; doubled undertricks (100/300/500 not vulnerable,
  200/500/800 vulnerable); doubled overtricks, redoubles and slams.
- **Progress by type** ("doubled, vulnerable, down 2") rather than by
  problem, with the same spaced repetition, so weak spots come back.
- Later, a link to the bidding problems: the feedback screen already
  knows the final contract and its double dummy tricks, so it could ask
  what that scores.

**From our own play**
- When a hand at the club goes wrong in the bidding, Dave and Donna
  agree what they *should* have bid, and it becomes a problem: the deal
  from the club's hand record, the agreed auction, and the reasoning.
  The bid recorder already records our auctions, so its export could
  carry the auction across. Tagged `club`, with the date and board.

## Decided: public hosting

The deals and some quoted commentary come from our teacher's handouts.
We chose public GitHub Pages anyway: it's for Dave and Donna, nobody
makes money from it, and the handout files themselves stay out of the
repo. If it looks to be used more widely, Dave will make the repo
private once the app is installed on our phones. (On a free account
that takes the Pages site down: installed apps keep working from their
offline copy but stop getting updates.)

## Working agreements

- At the end of each step, after your review, I commit that step if you
  want me to, and push it, which publishes it.
- The lesson handouts stay out of the repo (they're the teacher's).
