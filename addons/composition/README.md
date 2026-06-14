# Composition

Shows the percentage weight of each holding inside an account. Includes a
what-if mode to simulate rebalances at current prices.

## Features

- Account selector: switch between accounts with one click
- Holdings table sorted by weight descending, with a visual bar per position
- **What-if mode**: edit quantities to see how weights and values would change
  - Prices fixed at today's market value (`marketValue / quantity`)
  - Weight %, value, and delta recalculate live as you type
  - Quantity delta shown below each edited input (+N / -N)
  - Delta column shows the weight change vs current allocation
  - Reset button restores real quantities

## Permissions

- `accounts.getAll` - list accounts for the selector
- `portfolio.getHoldings` - read holdings to compute weights
- `ui.sidebar.addItem` + `ui.router.add` - register sidebar entry and route

## Build and install

See the [root README](../../README.md).
