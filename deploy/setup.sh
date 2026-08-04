#!/usr/bin/env bash
#
# Atheon — one-shot server bootstrap for an Ubuntu VM (e.g. Oracle Always Free).
#
# Run it from the repo root, AFTER you've cloned the repo and pointed a hostname
# at this machine's public IP:
#
#     sudo bash deploy/setup.sh atheon-pilot.example.com
#
# It installs Node 24 + Caddy, builds the app, creates a systemd service, and
# configures Caddy for automatic HTTPS. Safe to re-run (idempotent).

set -euo pipefail

HOST="${1:-}"
if [ -z "$HOST" ]; then
  echo "Usage: sudo bash deploy/setup.sh <public-hostname>"
  echo "  e.g. sudo bash deploy/setup.sh atheon-pilot.duckdns.org"
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "Please run with sudo: sudo bash deploy/setup.sh $HOST"
  exit 1
fi

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_USER="${SUDO_USER:-$(logname 2>/dev/null || echo root)}"
DATA_DIR="/var/lib/atheon"

echo "==> App dir:  $APP_DIR"
echo "==> Run as:   $APP_USER"
echo "==> Hostname: $HOST"
echo

echo "==> Ensuring swap (1 GB free VMs can OOM during the build) ..."
if [ "$(free -m | awk '/^Swap:/{print $2}')" -lt 1024 ] && [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "    added 2G swap"
fi

echo "==> Installing Node 24 (needed for node:sqlite) ..."
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> Installing Caddy (automatic HTTPS) ..."
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

echo "==> Building the app ..."
cd "$APP_DIR"
sudo -u "$APP_USER" npm ci --include=dev
sudo -u "$APP_USER" npm run build

echo "==> Data dir + environment ..."
mkdir -p "$DATA_DIR"
chown -R "$APP_USER":"$APP_USER" "$DATA_DIR"
if [ ! -f /etc/atheon.env ]; then
  JWT="$(openssl rand -hex 32)"
  cat > /etc/atheon.env <<EOF
NODE_ENV=production
PORT=4000
DATA_DIR=$DATA_DIR
JWT_SECRET=$JWT
EOF
  chmod 600 /etc/atheon.env
  echo "    wrote /etc/atheon.env (generated a strong JWT_SECRET)"
else
  echo "    /etc/atheon.env already exists — leaving it as is"
fi

echo "==> systemd service ..."
sed -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__APP_USER__|$APP_USER|g" \
  "$APP_DIR/deploy/atheon.service" > /etc/systemd/system/atheon.service
systemctl daemon-reload
systemctl enable atheon >/dev/null 2>&1 || true
systemctl restart atheon

echo "==> Caddy reverse proxy + HTTPS for $HOST ..."
cat > /etc/caddy/Caddyfile <<EOF
$HOST {
    encode gzip
    reverse_proxy 127.0.0.1:4000
}
EOF
systemctl restart caddy

echo
echo "==================================================================="
echo " Done. Once DNS for $HOST points at this VM, open:"
echo "     https://$HOST"
echo
echo " Handy commands:"
echo "     sudo systemctl status atheon      # app status"
echo "     sudo journalctl -u atheon -f      # app logs"
echo "     sudo systemctl status caddy       # proxy/TLS status"
echo "==================================================================="
