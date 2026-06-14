#!/usr/bin/env bash
# Build one or all addons and produce versioned zips.
# Self-contained: vendors Wealthfolio source into .vendor/ on first run.
#
# Requirements: Docker, git. No Node/pnpm needed on the host.
#
# Usage:
#   ./build.sh                    # build all addons
#   ./build.sh composition        # build one addon
#   WF_REF=v2.41.0 ./build.sh    # build against a specific WF version
set -euo pipefail

cd "$(dirname "$0")"
ROOT_DIR="$(pwd)"

WEALTHFOLIO_REPO="${WF_REPO:-https://github.com/wealthfolio/wealthfolio.git}"
WEALTHFOLIO_REF="${WF_REF:-main}"
VENDOR_DIR=".vendor/wealthfolio"

# Determine which addons to build.
if [ $# -ge 1 ]; then
  ADDONS=("$1")
else
  ADDONS=()
  for dir in addons/*/; do
    [ -f "${dir}manifest.json" ] && ADDONS+=("$(basename "$dir")")
  done
fi

if [ ${#ADDONS[@]} -eq 0 ]; then
  echo "ERROR: no addon directories found under addons/" >&2
  exit 1
fi

echo "Addons to build: ${ADDONS[*]}"
echo "Wealthfolio:     ${WEALTHFOLIO_REPO} @ ${WEALTHFOLIO_REF}"
echo "Vendor dir:      ${VENDOR_DIR}"
echo

# Vendor Wealthfolio source once for all addons.
if [ ! -d "${VENDOR_DIR}/.git" ]; then
  echo "Cloning Wealthfolio source (depth=1)..."
  mkdir -p "$(dirname "${VENDOR_DIR}")"
  git clone --depth 1 --branch "${WEALTHFOLIO_REF}" \
    "${WEALTHFOLIO_REPO}" "${VENDOR_DIR}"
else
  echo "Updating vendored Wealthfolio source to ${WEALTHFOLIO_REF}..."
  (
    cd "${VENDOR_DIR}"
    git fetch --depth 1 origin "${WEALTHFOLIO_REF}"
    git checkout "${WEALTHFOLIO_REF}"
    git reset --hard "FETCH_HEAD"
  )
fi
echo

HOST_UID="$(id -u)"
HOST_GID="$(id -g)"

# Build all addons in a single Docker container run.
BUILD_CMDS=""
for ADDON in "${ADDONS[@]}"; do
  MANIFEST="addons/${ADDON}/manifest.json"
  if [ ! -f "${MANIFEST}" ]; then
    echo "WARNING: no manifest.json found for addon '${ADDON}', skipping" >&2
    continue
  fi
  ADDON_ID=$(grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]+"' "${MANIFEST}" \
    | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
  VERSION=$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' "${MANIFEST}" \
    | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
  ZIP="addons/${ADDON}/dist/${ADDON_ID}-${VERSION}.zip"
  echo "  ${ADDON_ID} v${VERSION} -> ${ZIP}"
  BUILD_CMDS="${BUILD_CMDS}
    echo '--- Building ${ADDON} ---'
    ADDON=${ADDON} ./node_modules/.bin/vite build
    zip -j addons/${ADDON}/dist/${ADDON_ID}-${VERSION}.zip \
      addons/${ADDON}/manifest.json \
      addons/${ADDON}/dist/addon.js \
      addons/${ADDON}/dist/addon.js.map"
done
echo

docker run --rm \
  -e HOST_UID="${HOST_UID}" \
  -e HOST_GID="${HOST_GID}" \
  -v "${ROOT_DIR}:/work" \
  -w "/work" \
  node:24-alpine \
  sh -c "
    set -e
    corepack enable
    apk add --no-cache zip
    cd /work/${VENDOR_DIR} && (pnpm install --no-frozen-lockfile || true)
    cd /work/${VENDOR_DIR}/packages/addon-sdk && ./node_modules/.bin/tsup
    cd /work/${VENDOR_DIR}/packages/ui && ./node_modules/.bin/tsup
    cd /work && (pnpm install || true)
    ${BUILD_CMDS}
    chown -R \"\$HOST_UID:\$HOST_GID\" /work/node_modules /work/.vendor /work/pnpm-lock.yaml /work/addons 2>/dev/null || true
  "

echo
echo "Done. Zips:"
for ADDON in "${ADDONS[@]}"; do
  ls -lh addons/${ADDON}/dist/*.zip 2>/dev/null || true
done
