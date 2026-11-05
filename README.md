# Bridge Practicer

A phone app of bridge challenges I want to get better at remembering:
from lessons I've taken, hands I've played at the club, and bridge
teaching I've found online. Each challenge shows a hand and asks for the
call, the opening lead or the card to play. Then it tells you the answer
and why, and shows the whole deal.

The problems come from the example boards in the lesson handouts:
Stayman, Jacoby and Texas transfers, new minor forcing, negative doubles,
Jacoby 2NT, Roman Keycard Blackwood and control bids. A session is a
short mixed set, for a quick review before going to the club.

It runs at https://dave-finlay.github.io/bridge-practicer/. On an
iPhone, open it in Safari and choose Share, then Add to Home Screen; it
then works offline. Each phone keeps its own progress. How it's being
built is in [PLAN.md](PLAN.md).

## Problems

Problems live in `problems/<origin>/<file>.json`, by where the deals
come from: `lessons/` (one file per lesson handout), `club/` (one per
club session reviewed) and `teachers/` (boards from other teachers, such
as videos). Each file holds deals, and each deal holds one or more problems:
the point in the auction to stop at, the answer, an explanation, and
notes on tempting wrong calls. [PLAN.md](PLAN.md) describes the format.

```sh
npm test          # unit tests
npm run check     # checks every deal and problem (52 cards, legal auctions, ...)
npm run review    # builds review/index.html, a page for checking the problems
npm run dd        # double dummy results for new or changed deals
npm start         # serves the app to this computer and phones on the Wi-Fi
```

The lesson handouts themselves are not in this repo.
