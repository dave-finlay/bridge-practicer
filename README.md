# Bridge Practicer

A phone app for practising the bidding conventions from our bridge
lessons until the answers come automatically. Each problem shows your
hand and the auction so far and asks for your call. Then it tells you
the best call and why, and shows the whole deal.

The problems come from the example boards in the lesson handouts:
Stayman, Jacoby and Texas transfers, new minor forcing, negative doubles,
Jacoby 2NT, Roman Keycard Blackwood and control bids. A session is a
short mixed set, for a quick review before going to the club.

The app isn't built yet: see [PLAN.md](PLAN.md).

## Problems

Problems live in `problems/<lesson>.json`, one file per lesson. Each
file holds the lesson's deals, and each deal holds one or more problems:
the point in the auction to stop at, the answer, an explanation, and
notes on tempting wrong calls. [PLAN.md](PLAN.md) describes the format.

```sh
npm test          # unit tests
npm run check     # checks every deal and problem (52 cards, legal auctions, ...)
npm run review    # builds review/index.html, a page for checking the problems
```

The lesson handouts themselves are not in this repo.
