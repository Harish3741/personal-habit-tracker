#!/bin/bash
#
# Exposes the habit tracker to your other devices over Tailscale.
#
# The app itself stays bound to 127.0.0.1 — it is never opened to the local
# network. Tailscale Serve terminates HTTPS on your machine's tailnet name and
# proxies to that loopback port, so only devices signed into your Tailscale
# account can reach it. The app has no login of its own, so the tailnet *is*
# the authentication boundary. Do not swap this for a public tunnel.
#
#   ./scripts/tunnel-macos.sh            start sharing (persists across reboots)
#   ./scripts/tunnel-macos.sh --status   show what is currently shared
#   ./scripts/tunnel-macos.sh --off      stop sharing
#
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PORT="${PORT:-4321}"

if ! TS="$(find_tailscale)"; then
  cat >&2 <<'EOF'
Tailscale is not installed.

  brew install --cask tailscale     (or get it from the Mac App Store)

Then open the app, sign in, and run this script again.
EOF
  exit 1
fi

case "${1:-}" in
  --off)
    "$TS" serve reset
    echo "Stopped sharing. The app is still running locally on http://localhost:$PORT"
    exit 0
    ;;
  --status)
    "$TS" serve status
    exit 0
    ;;
  "")
    ;;
  *)
    echo "Unknown option: $1 (expected --status or --off)" >&2
    exit 1
    ;;
esac

if ! "$TS" status >/dev/null 2>&1; then
  echo "Tailscale is installed but not signed in. Open the Tailscale app, log in, then re-run." >&2
  exit 1
fi

# Serve needs MagicDNS + HTTPS certificates enabled for the tailnet. Both are
# toggles in the admin console; the error from `serve` is cryptic without this.
if ! "$TS" cert --help >/dev/null 2>&1; then
  echo "Warning: this Tailscale build may not support HTTPS certs." >&2
fi

echo "Checking the app is up on 127.0.0.1:$PORT…"
if ! curl -fs -o /dev/null --max-time 5 "http://127.0.0.1:$PORT/"; then
  cat >&2 <<EOF

The app is not responding on port $PORT.

Start it first:
  ./scripts/install-macos.sh      (installs the launchd agent)
or, for a one-off:
  npm start

EOF
  exit 1
fi

echo "Publishing to your tailnet…"
if ! "$TS" serve --bg --https=443 "http://127.0.0.1:$PORT"; then
  cat >&2 <<'EOF'

Tailscale could not start serving. The usual cause is that HTTPS is not enabled
for your tailnet. In the admin console (https://login.tailscale.com/admin/dns):

  1. Enable MagicDNS
  2. Enable HTTPS Certificates

Then re-run this script.
EOF
  exit 1
fi

URL="$("$TS" status --json 2>/dev/null | node -e '
  let raw = "";
  process.stdin.on("data", (c) => (raw += c)).on("end", () => {
    try {
      const dns = JSON.parse(raw)?.Self?.DNSName ?? "";
      console.log(dns ? `https://${dns.replace(/\.$/, "")}/` : "");
    } catch {
      console.log("");
    }
  });
')"

echo
if [[ -n "$URL" ]]; then
  echo "Now reachable at:  $URL"
else
  echo "Sharing is on. Run '$0 --status' to see the URL."
fi
cat <<'EOF'

Open that URL on any device signed into the same Tailscale account. On iPhone:
install Tailscale from the App Store, sign in with the same account, then open
the link — Add to Home Screen gives it an app icon.

Only your tailnet can reach it. Anyone else gets nothing, and the app is still
bound to loopback so devices on the same wifi cannot reach it either.
EOF
