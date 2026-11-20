# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/gta6scam/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/gta6scam/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks every protocol that records no token — the whole 40-protocol watchlist plus the strongest pre-token protocols below its floor — by an implied value that is calibrated, not asserted: for each category, the model takes the median market-cap/TVL of that category's tokenized protocols in the snapshot itself (the market's own price for a dollar of TVL, shrunk toward the global median when a category has few priced peers), then adjusts each protocol by its seven-day TVL momentum and by how long it has run with no token. Protocols whose token already trades are set aside at their real market caps — they calibrate the board, they are never ranked by it — and every row carries a concrete farm plan (the category's real actions, on the protocol's own chains, with capital, gas, cadence and hold spelled out). The dashboard re-derives every multiple and recomputes every row from the same figures, so the page and board.json cannot drift apart.

## Run it

```sh
node main.ts --input <snapshot.json>
```
(then open the dashboard written to the output directory)

---

<sub>Entered on [make.fun](https://make.fun/?ref=kvykfv6e&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
