#!/bin/bash
#
# Installs the habit tracker as a launchd user agent so it starts at login and
# stays running for as long as the Mac is on.
#
#   ./scripts/install-macos.sh          install (or reinstall) and start
#   ./scripts/install-macos.sh --uninstall
#
set -euo pipefail

LABEL="com.habits.tracker"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-4321}"

if [[ "${1:-}" == "--uninstall" ]]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Uninstalled $LABEL."
  exit 0
fi

command -v node >/dev/null || { echo "node not found on PATH" >&2; exit 1; }
command -v npm  >/dev/null || { echo "npm not found on PATH"  >&2; exit 1; }

NODE_BIN="$(command -v node)"
NPM_BIN="$(command -v npm)"
NODE_DIR="$(dirname "$NODE_BIN")"

echo "Building…"
cd "$APP_DIR"
npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund
npm run build

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>$NPM_BIN</string>
    <string>start</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$APP_DIR</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$NODE_DIR:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>PORT</key>
    <string>$PORT</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>

  <!-- Restart if it ever exits, so the app is always there when you open it. -->
  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/habits-tracker.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/habits-tracker.log</string>
</dict>
</plist>
PLIST_EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

echo
echo "Installed. Waiting for it to come up…"
for _ in $(seq 1 20); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/"; then
    echo "Running at http://localhost:$PORT"
    echo
    echo "Next: open that URL in Safari, then File -> Add to Dock to get an app icon."
    exit 0
  fi
  sleep 1
done

echo "Did not respond on port $PORT. Check ~/Library/Logs/habits-tracker.log" >&2
exit 1
