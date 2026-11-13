#!/usr/bin/env bash
# Moves the files push.ps1 just uploaded into place. Safe to run BEFORE setup.sh (first upload)
# and AFTER it (every later update) - it adapts to whichever is true.
# Never touches /var/lib/tmi, so the student database is safe.
set -euo pipefail

STAGE="${1:-$HOME/tmi-stage}"
[ -d "$STAGE/analytics" ] || { echo "nothing uploaded at $STAGE"; exit 1; }

sudo mkdir -p /opt/tmi
sudo rm -rf /opt/tmi/analytics /opt/tmi/content
sudo mv "$STAGE/analytics" "$STAGE/content" /opt/tmi/

# the tmi service user only exists once setup.sh has run
if id -u tmi >/dev/null 2>&1; then sudo chown -R tmi:tmi /opt/tmi; fi
rm -rf "$STAGE"

echo "installed: $(ls /opt/tmi/content/sessions | wc -l) files in content/sessions"

if systemctl list-unit-files 2>/dev/null | grep -q '^tmi-analytics'; then
  sudo systemctl restart tmi-analytics
  sleep 2
  echo "service: $(systemctl is-active tmi-analytics)"
else
  echo
  echo "NEXT STEP - install it (one command, use your own hostname):"
  echo "  sudo bash /opt/tmi/analytics/hosting/setup.sh your-name.duckdns.org"
fi
