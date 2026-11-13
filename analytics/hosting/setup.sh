#!/usr/bin/env bash
# One-time setup of the SQL: The Missing Influencer analytics server on a fresh Ubuntu box
# (AWS Lightsail or EC2, 22.04 or 24.04). Safe to run again - every step is idempotent.
#
#   sudo bash setup.sh <hostname> [admin-password]
#
#   <hostname>        the public name students' browsers will call, e.g. tmi-analytics.duckdns.org
#                     It must already point at this machine's static IP, or Let's Encrypt will fail.
#   [admin-password]  the dashboard password. Left out: a strong one is generated and printed once.
#
# What it installs: Node 24 (see the note on node:sqlite below), Caddy (automatic HTTPS), sqlite3 (backups),
# a systemd service that restarts on crash and on reboot, a daily backup at 02:30 IST, and ufw rules.
#
# Layout it creates
#   /opt/tmi/analytics/        the server code          (push.ps1 or git clone puts it here)
#   /opt/tmi/content/sessions/ the 13 episode packs     (the server reads them at boot to know the beats)
#   /var/lib/tmi/analytics.sqlite   THE DATABASE - the only file that matters. Backed up daily.
#   /var/backups/tmi/          14 days of backups
#   /etc/tmi-analytics.env     secrets + config (root only)
set -euo pipefail

DOMAIN="${1:-}"
ADMIN_PASSWORD="${2:-}"
APP_DIR=/opt/tmi
DATA_DIR=/var/lib/tmi
BACKUP_DIR=/var/backups/tmi
ENV_FILE=/etc/tmi-analytics.env
SERVICE=tmi-analytics
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { echo "ERROR: $*" >&2; exit 1; }
say() { echo; echo "==> $*"; }

[ "$(id -u)" -eq 0 ] || die "run with sudo: sudo bash setup.sh <hostname> [admin-password]"
[ -n "$DOMAIN" ] || die "give the hostname: sudo bash setup.sh tmi-analytics.duckdns.org"

# ---------------------------------------------------------------- 1. packages
say "installing packages (node 24, caddy, sqlite3)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg sqlite3 ufw debian-keyring debian-archive-keyring apt-transport-https

# Node 24, not 22. The server stores everything through Node's BUILT-IN sqlite (no npm packages at all),
# and on Node 22 that module still needs --experimental-sqlite, so the service would die at boot with
# "No such built-in module: node:sqlite". It is unflagged from Node 23.4 on. 24 is also what the game was
# developed and tested against, so this matches the dev machine exactly.
NODE_MAJOR="$(node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/' || echo 0)"
if [ "${NODE_MAJOR:-0}" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y -qq nodejs
fi
node -e 'const{DatabaseSync}=require("node:sqlite");new DatabaseSync(":memory:").close()' 2>/dev/null \
  || die "this Node cannot open node:sqlite without a flag - found $(node -v), need 24.x. Try: curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash - && sudo apt-get install -y nodejs"
echo "node $(node -v) with built-in sqlite: OK"

if ! command -v caddy >/dev/null 2>&1; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
fi

# ---------------------------------------------------------------- 2. user, folders
say "creating the service user and folders"
id -u tmi >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin tmi
mkdir -p "$APP_DIR" "$DATA_DIR" "$BACKUP_DIR"
chown -R tmi:tmi "$APP_DIR" "$DATA_DIR" "$BACKUP_DIR"
chmod 750 "$DATA_DIR" "$BACKUP_DIR"

# ---------------------------------------------------------------- 3. config + secrets
say "writing $ENV_FILE"
if [ -f "$ENV_FILE" ]; then
  # keep the existing password and secret: regenerating them would log every admin out and break nothing else
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(grep -oP '^ADMIN_PASSWORD=\K.*' "$ENV_FILE" || true)}"
  SESSION_SECRET="$(grep -oP '^SESSION_SECRET=\K.*' "$ENV_FILE" || true)"
fi
[ -n "$ADMIN_PASSWORD" ] || { ADMIN_PASSWORD="$(head -c 18 /dev/urandom | base64 | tr -d '/+=' | head -c 20)"; GENERATED=1; }
[ -n "${SESSION_SECRET:-}" ] || SESSION_SECRET="$(head -c 32 /dev/urandom | base64 | tr -d '/+=')"

cat > "$ENV_FILE" <<EOF
# SQL: The Missing Influencer - analytics server. Edit, then: sudo systemctl restart $SERVICE
ADMIN_PASSWORD=$ADMIN_PASSWORD
SESSION_SECRET=$SESSION_SECRET
DB_PATH=$DATA_DIR/analytics.sqlite
CONTENT_DIR=$APP_DIR/content/sessions
PORT=8787
# loopback only: Caddy holds the certificate and is the only thing allowed to reach the app
HOST=127.0.0.1
TZ_OFFSET=+05:30
EOF
chmod 600 "$ENV_FILE"

# ---------------------------------------------------------------- 4. service
say "installing the systemd service"
install -m 644 "$HERE/tmi-analytics.service" "/etc/systemd/system/$SERVICE.service"
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null

# ---------------------------------------------------------------- 5. https
say "configuring Caddy for https://$DOMAIN"
sed "s/{{DOMAIN}}/$DOMAIN/g" "$HERE/Caddyfile.example" > /etc/caddy/Caddyfile
systemctl enable caddy >/dev/null
systemctl restart caddy

# ---------------------------------------------------------------- 6. firewall
# Two different worlds:
#   AWS (Lightsail/EC2)  - no host firewall by default, ufw is the clean way to add one.
#   Oracle Cloud         - the Ubuntu image ships legacy iptables rules that REJECT everything
#                          except 22, and those rules OUTLIVE ufw. Opening 80/443 only in the
#                          cloud console is not enough; this is the usual reason HTTPS never works.
say "opening 22, 80, 443"
if iptables -S INPUT 2>/dev/null | grep -q 'icmp-host-prohibited'; then
  echo "    Oracle-style iptables detected"
  for p in 80 443; do
    iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport "$p" -j ACCEPT
  done
  apt-get install -y -qq iptables-persistent >/dev/null 2>&1 || true
  netfilter-persistent save >/dev/null 2>&1 || true
  echo "    80 and 443 opened and saved (survives reboot)"
  iptables -S INPUT | grep -E 'dport (80|443)' | sed 's/^/    /'
else
  ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
  ufw status | sed 's/^/    /'
fi

# ---------------------------------------------------------------- 7. daily backup
say "scheduling the daily backup (02:30 IST, 14 days kept)"
install -m 755 "$HERE/backup.sh" /usr/local/bin/tmi-backup
cat > /etc/cron.d/tmi-backup <<EOF
# daily backup of the analytics database
CRON_TZ=Asia/Kolkata
30 2 * * * root /usr/local/bin/tmi-backup >> /var/log/tmi-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/tmi-backup

# ---------------------------------------------------------------- 8. start if the code is here
echo
if [ -f "$APP_DIR/analytics/server.mjs" ] && [ -d "$APP_DIR/content/sessions" ]; then
  say "starting the service"
  chown -R tmi:tmi "$APP_DIR"
  systemctl restart "$SERVICE"
  sleep 2
  systemctl --no-pager --lines=5 status "$SERVICE" | sed 's/^/    /' || true
else
  say "code not uploaded yet"
  echo "    Put the server code at $APP_DIR/analytics and the packs at $APP_DIR/content/sessions,"
  echo "    then: sudo chown -R tmi:tmi $APP_DIR && sudo systemctl restart $SERVICE"
fi

echo
echo "-----------------------------------------------------------------"
echo " Dashboard : https://$DOMAIN"
if [ -n "${GENERATED:-}" ]; then
  echo " Password  : $ADMIN_PASSWORD      <-- SAVE THIS NOW, it is not shown again"
else
  echo " Password  : (the one you passed in / the existing one in $ENV_FILE)"
fi
echo " Database  : $DATA_DIR/analytics.sqlite"
echo " Logs      : sudo journalctl -u $SERVICE -f"
echo "-----------------------------------------------------------------"
echo " Next: rebuild the game with this address and re-upload it to S3:"
echo "   VITE_ANALYTICS_URL=https://$DOMAIN npm run build:s3"
echo "-----------------------------------------------------------------"
