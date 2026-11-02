#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST_LABEL="com.saintgordon.autoupdate"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"

if [ "$1" = "--uninstall" ]; then
    echo "Uninstalling Saint Gordon autoupdater..."
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    rm -f "$PLIST_PATH"
    echo "Autoupdater uninstalled."
    exit 0
fi

echo "Installing Saint Gordon background autoupdater..."
mkdir -p "$HOME/Library/LaunchAgents"

cat <<EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>
    <key>WorkingDirectory</key>
    <string>${DIR}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>${DIR}/scripts/update_soundcloud.py</string>
    </array>
    <key>StartInterval</key>
    <integer>1800</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${DIR}/.update-backups/autoupdater.log</string>
    <key>StandardErrorPath</key>
    <string>${DIR}/.update-backups/autoupdater.err</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo "Autoupdater installed and loaded!"
echo "It will check SoundCloud every 30 minutes in the background."
echo "To uninstall anytime, run: bash scripts/install_autoupdater.sh --uninstall"
