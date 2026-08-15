#!/bin/bash
# Shared helpers for the setup scripts. Sourced, not executed.

require_macos() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "These scripts target macOS — this machine is $(uname -s)." >&2
    exit 1
  fi
}

# The Tailscale CLI lives in different places depending on how it was
# installed: the App Store build hides it inside the .app bundle, Homebrew and
# the standalone installer put it on PATH.
find_tailscale() {
  if command -v tailscale >/dev/null 2>&1; then
    command -v tailscale
    return 0
  fi
  local candidate
  for candidate in \
    /Applications/Tailscale.app/Contents/MacOS/Tailscale \
    /opt/homebrew/bin/tailscale \
    /usr/local/bin/tailscale; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

step() {
  printf '\n\033[1m==> %s\033[0m\n' "$1"
}

note() {
  printf '    %s\n' "$1"
}
