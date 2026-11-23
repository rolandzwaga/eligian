#!/usr/bin/env bash
# Runs test commands on Linux (WSL) for guard-ci-gates.cjs: tests that branch on the platform
# (`process.platform === 'win32'`) only exercise their POSIX branch here, and CI runs on Linux.
#
# Usage (from Windows): tar -c -f - -T <list> | wsl.exe -e bash -l <this script> <commands file>
# stdin: a tar of the working tree (tracked + untracked-not-ignored files, plus packages/*/dist,
#   built on Windows by the gate's Build step; plain JS). One tar stream, because reading the
#   Windows drive file by file from WSL costs ~16 ms a file (100 s for the tree).
# <commands file>: a /mnt path; the bash commands to run in the mirror (`vitest related` per package).
#
# The mirror ($ELIGIAN_LINUX_MIRROR, default ~/eligian-linux-gate) keeps only its Linux
# node_modules between runs; every other file is replaced by the stream.
set -euo pipefail

CMDS_FILE="$1"
MIRROR="${ELIGIAN_LINUX_MIRROR:-$HOME/eligian-linux-gate}"
export PATH="$HOME/.local/bin:$PATH"
missing() {
  cat > /dev/null # drain the tar stream
  echo "linux-tests: no $1 in WSL" >&2
  exit 90
}
command -v node > /dev/null || missing node
command -v pnpm > /dev/null || corepack enable --install-directory "$HOME/.local/bin" > /dev/null 2>&1 || true
command -v pnpm > /dev/null || missing pnpm

mkdir -p "$MIRROR"
cd "${MIRROR:?}"
find . -name node_modules -prune -o -type f -print0 | xargs -0 -r rm -f
tar -x -f -

pnpm install --frozen-lockfile --prefer-offline > /tmp/eligian-linux-gate-install.log 2>&1 \
  || { tail -30 /tmp/eligian-linux-gate-install.log; exit 1; }
export FORCE_COLOR=0 NO_COLOR=1 CI=1
bash -e "$CMDS_FILE"
