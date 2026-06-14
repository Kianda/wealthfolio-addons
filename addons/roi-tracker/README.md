# ROI Tracker

Shows lifetime Return on Investment per account (gain / net contribution), with
per-holding breakdown and a time-range selector.

## Features

- One row per account: Total Value, Net Contribution, Net Gain, ROI or Return
- Click any account row to expand a per-holding breakdown
- Time-range selector: 1M, 3M, 6M, YTD, 1Y, ALL
- Aggregated TOTAL row when more than one account is present

## Metrics

| Range | Metric | Formula |
|---|---|---|
| ALL | ROI | `(Total Value - Net Contribution) / Net Contribution` |
| 1M / 3M / 6M / YTD / 1Y | TWR | Cumulative Time-Weighted Return from `performance.calculateSummary` |

**Why TWR for sub-periods?** Wealthfolio's own `simple_return` field uses the
value at the very first trade as the denominator, which reports inflated numbers
(e.g. +303% on a portfolio that actually grew ~10%) when you made a small first
trade and added capital later. TWR chains sub-period returns and is not distorted
by the timing of deposits.

## Permissions

- `accounts.getAll` - list accounts
- `portfolio.getLatestValuations` - total value and net contribution per account
- `portfolio.getHoldings` - per-holding breakdown on row expand
- `performance.calculateSummary` - sub-period TWR for 1M/3M/6M/YTD/1Y
- `ui.sidebar.addItem` + `ui.router.add` - register sidebar entry and route

## Known runtime quirks

The Wealthfolio runtime returns some fields in shapes that differ from the SDK
types. Defensive helpers in the code handle these:

- `marketValue` and similar monetary fields arrive as `{local, base}`, not a
  plain number. The `money()` helper normalises this.
- `holding.instrument.symbol` is the correct field at runtime; `displayCode` and
  `instrumentSymbol` (as documented in the SDK types) are absent.

## Build and install

See the [root README](../../README.md).
