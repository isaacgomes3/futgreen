#!/usr/bin/env bash
# Setup FUTGRN na VPS tips3x3
# Uso na VPS: bash deploy/setup-vps.sh
set -euo pipefail

APP_DIR=/var/www/futgreen
DOMAIN="${FUTGRN_DOMAIN:-futgreen.com.br}"

echo "==> Diretório $APP_DIR"
mkdir -p "$APP_DIR/data" "$APP_DIR/logs"
chmod 755 "$APP_DIR"

echo "==> Nginx ($DOMAIN + www)"
cp -f "$APP_DIR/deploy/nginx-futgrn.conf" /etc/nginx/conf.d/futgreen.conf
nginx -t
systemctl reload nginx

echo "==> Firewall (http/https)"
firewall-cmd --permanent --add-service=http 2>/dev/null || true
firewall-cmd --permanent --add-service=https 2>/dev/null || true
firewall-cmd --reload 2>/dev/null || true

echo "==> Env + seed"
cd "$APP_DIR"
mkdir -p logs data
if [[ ! -f .env ]]; then
  cp -n .env.example .env
  SECRET="$(openssl rand -hex 24)"
  sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=${SECRET}/" .env || true
fi
if [[ ! -f data/futgreen.json ]]; then
  node scripts/seed.mjs || true
fi

echo "==> PM2"
pm2 delete futgreen 2>/dev/null || true
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root >/tmp/pm2-startup.sh 2>/dev/null || true
if grep -q '^sudo ' /tmp/pm2-startup.sh 2>/dev/null; then
  bash /tmp/pm2-startup.sh || true
fi

IP="$(curl -4 -s ifconfig.me || echo 92.113.33.148)"
echo ""
echo "OK. App local: http://127.0.0.1:3101"
echo "Nginx:        http://${DOMAIN}"
echo "DNS: A ${DOMAIN} e www → ${IP}"
echo "SSL: certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --non-interactive --agree-tos -m admin@${DOMAIN} --redirect"
