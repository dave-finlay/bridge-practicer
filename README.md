# Bridge Practicer

A personal phone app for practicing bridge, so that what I learn
sticks. The challenges come from three places:

- **Lessons I've taken:** the example boards from the lesson handouts
  (Stayman, Jacoby and Texas transfers, new minor forcing, negative
  doubles, Jacoby 2NT, Roman Keycard Blackwood and control bids).
- **Things I've read or watched online:** teachers' handouts and videos
  on overcalls, cuebids, opening leads and defense.
- **Hands that have come up in play:** club boards where the bidding
  went wrong, with the auction my partner and I agreed we should have
  had.

Each challenge shows a hand and asks for a call, an opening lead or a
card to play. Then it gives the answer and why, and where there's a
whole deal, shows it with its double dummy results. A session is a short mixed set, chosen by
where the deals come from and by topic. Challenges I miss come back
sooner, and ones I get right come back less often.

It runs at https://dave-finlay.github.io/bridge-practicer/. On an
iPhone, open it in Safari and choose Share, then Add to Home Screen; it
then works offline. Each phone keeps its own progress. How it's built,
and what's planned, is in [PLAN.md](PLAN.md).

## Challenges

Challenges live in `problems/<origin>/<file>.json`, by where the deals
come from: `lessons/` (one file per lesson handout), `club/` (one per
club session reviewed) and `teachers/` (other teachers' handouts and
videos). Each file holds deals, and each deal holds one or more
problems: a call at a point in the auction, an opening lead, or a card
to play in a position from the middle of a hand. Each has an answer, an
explanation, and notes on tempting wrong answers. [PLAN.md](PLAN.md)
describes the format.

```sh
npm test          # unit tests, plus the checker
npm run check     # checks every deal and problem (52 cards, legal auctions, ids kept, ...)
npm run review    # builds review/index.html, a page for checking the problems
npm run dd        # double dummy results for new or changed deals
npm start         # serves the app to this computer and phones on the Wi-Fi
```

The handouts and video screenshots the challenges are based on are not
in this repo, and the explanations are in my own words.
