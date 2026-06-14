# wealthfolio-addons

Personal addon collection for [Wealthfolio](https://github.com/wealthfolio/wealthfolio).

## Addons

| Addon | Description |
|---|---|
| [composition](addons/composition/) | % weight of each holding per account, with a what-if mode to simulate rebalances |
| [roi-tracker](addons/roi-tracker/) | Lifetime ROI per account (gain / net contribution) with per-holding breakdown and time-range selector |

## Build

Requirements: Docker, git. No Node/pnpm needed on the host.

```bash
# Build all addons
./build.sh

# Build one addon
./build.sh composition
./build.sh roi-tracker

# Build against a specific Wealthfolio version
WF_REF=v2.41.0 ./build.sh
```

Output zips are in `addons/<name>/dist/`.

## Install in Wealthfolio

1. Open Wealthfolio
2. Settings - Addons - Install from file
3. Select the zip from `addons/<name>/dist/`

## Structure

```
addons/
  composition/        <- % weight per holding + what-if sandbox
    manifest.json
    src/
  roi-tracker/        <- ROI per account + per-holding breakdown
    manifest.json
    src/
build.sh              <- builds one or all addons (Docker-based)
package.json          <- shared deps (SDK, UI, vite)
vite.config.ts        <- parameterized by ADDON env var
tsconfig.json
```

The `.vendor/` directory is created on first build (shallow clone of Wealthfolio
source for the addon SDK and UI packages). It is not committed.
