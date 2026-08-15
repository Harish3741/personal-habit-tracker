#!/bin/bash
#
# One command to get everything running:
#
#   ./scripts/setup.sh
#
# Installs Tailscale if needed, builds the app, installs the launchd agent so
# it runs whenever the Mac is on, and publishes it to your tailnet.
#
# Three things cannot be automated because they need you: signing into
# Tailscale (SSO in a browser), flipping two toggles in the Tailscale admin
# console, and installing Tailscale on your phone. The script stops and waits
# at each, then carries on.
#
# Safe to re-run — every step is idempotent.
#
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
source scripts/lib.sh

require_macos

PORT="${PORT:-4321}"

# --------------------------------------------------------------- 1. Tailscale

step "Checking Tailscale"

if ! TS="$(find_tailscale)"; then
  if command -v brew >/dev/null 2>&1; then
    note "Not installed — installing with Homebrew…"
    brew install --cask tailscale
    TS="$(find_tailscale)" || {
      echo "Installed, but the CLI still isn't findable. Open the Tailscale app once, then re-run." >&2
      exit 1
    }
  else
    cat >&2 <<'EOF'
Tailscale is not installed and Homebrew is not available.

Install Tailscale from https://tailscale.com/download/mac (or the Mac App
Store), open it once, then re-run this script.
EOF
    exit 1
  fi
fi
note "Found: $TS"

# --------------------------------------------------------------- 2. Sign in

if ! "$TS" status >/dev/null 2>&1; then
  step "Sign in to Tailscale"
  note "Opening the Tailscale app. Sign in, then come back here."
  open -a Tailscale 2>/dev/null || true
  note "Waiting for sign-in… (Ctrl-C to abort)"
  until "$TS" status >/dev/null 2>&1; do
    sleep 3
  done
fi
note "Signed in."

# ----------------------------------------------------- 3. Calendars configured

step "Checking calendar configuration"

if [[ -f data/habits.db ]] || [[ -f .env.local ]]; then
  note "Config found. Add or edit calendars any time in the app's sidebar → Manage."
else
  cat <<'EOF'
    No calendars configured yet — that is fine, the app starts empty.

    Once it is running, open the sidebar → Manage → paste your published
    iCloud URLs. In Calendar.app: right-click a calendar → Share Calendar →
    tick Public Calendar → copy the link.

    Those links are read-secrets; they stay on this machine.
EOF
fi

# ------------------------------------------------------ 4. Build + run at login

step "Building and installing the background service"
./scripts/install-macos.sh

# --------------------------------------------------------------- 5. Publish

step "Publishing to your tailnet"

if ! ./scripts/tunnel-macos.sh; then
  cat >&2 <<'EOF'

The tunnel step did not complete. The usual cause is that MagicDNS and HTTPS
Certificates are not enabled for your tailnet:

  https://login.tailscale.com/admin/dns

Enable both, then run:  ./scripts/tunnel-macos.sh
EOF
  exit 1
fi

# ---------------------------------------------------------------- 6. Wrap up

step "Done"
cat <<EOF
    Local:  http://localhost:$PORT
            Safari → File → Add to Dock for an app icon.

    Phone:  install Tailscale from the App Store, sign in with the same
            account, then open the https://….ts.net/ URL printed above.
            Share → Add to Home Screen for an app icon.

    Logs:   ~/Library/Logs/habits-tracker.log
    Stop sharing:  ./scripts/tunnel-macos.sh --off
    Uninstall:     ./scripts/install-macos.sh --uninstall
EOF
