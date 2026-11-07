#!/bin/bash
# Instalação do Galo Brigão numa VM Debian 12. Pode rodar de novo (atualiza).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
HOST="${GB_HOST:-35-199-88-58.sslip.io}"
NODE_VERSION="v24.18.0"
APP=/opt/galobrigao
DATA=/var/lib/galobrigao

echo "== Sistema"
apt-get update -q
apt-get upgrade -yq
apt-get install -yq git curl xz-utils caddy unattended-upgrades sqlite3
echo 'APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";' > /etc/apt/apt.conf.d/20auto-upgrades

echo "== Node.js $NODE_VERSION (conferido pelo SHA256 oficial)"
if [ "$(node -v 2>/dev/null || true)" != "$NODE_VERSION" ]; then
  cd /tmp
  curl -fsSLO "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.xz"
  curl -fsSLO "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt"
  grep " node-$NODE_VERSION-linux-x64.tar.xz\$" SHASUMS256.txt | sha256sum -c -
  tar -xJf "node-$NODE_VERSION-linux-x64.tar.xz" -C /usr/local --strip-components=1
  rm -f "node-$NODE_VERSION-linux-x64.tar.xz" SHASUMS256.txt
fi
node -v

echo "== Usuário e pastas"
id galobrigao >/dev/null 2>&1 || useradd --system --home-dir "$DATA" --shell /usr/sbin/nologin galobrigao
mkdir -p "$DATA/backups" "$APP"
chown -R galobrigao:galobrigao "$DATA" "$APP"
chmod 750 "$DATA"

echo "== Código"
if [ -d "$APP/.git" ]; then
  sudo -u galobrigao git -C "$APP" pull -q --ff-only
else
  sudo -u galobrigao git clone -q https://github.com/vicolino/galobrigao.git "$APP"
fi
cd "$APP"
sudo -u galobrigao HOME="$DATA" npm ci --no-audit --no-fund --loglevel=error
sudo -u galobrigao HOME="$DATA" npm run build --silent

echo "== Configuração (só root e o app leem)"
if [ ! -f /etc/galobrigao.env ]; then
  cat > /etc/galobrigao.env <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=8787
TRUST_PROXY=1
PUBLIC_URL=https://$HOST
DB_FILE=$DATA/rinha.sqlite
PAYMENT_PROVIDER=sandbox
MP_ACCESS_TOKEN=
MP_WEBHOOK_SECRET=
RESEND_API_KEY=
MAIL_FROM=
EOF
fi
chown root:galobrigao /etc/galobrigao.env
chmod 640 /etc/galobrigao.env

echo "== Serviço do app (systemd, com isolamento)"
cat > /etc/systemd/system/galobrigao.service <<'EOF'
[Unit]
Description=Galo Brigão
After=network-online.target
Wants=network-online.target

[Service]
User=galobrigao
Group=galobrigao
WorkingDirectory=/opt/galobrigao
EnvironmentFile=/etc/galobrigao.env
ExecStart=/usr/local/bin/node dist-server/main.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true
ProtectClock=true
ProtectHostname=true
RestrictSUIDSGID=true
RestrictNamespaces=true
RestrictRealtime=true
LockPersonality=true
CapabilityBoundingSet=
AmbientCapabilities=
SystemCallArchitectures=native
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
ReadWritePaths=/var/lib/galobrigao
UMask=0077
MemoryMax=1G

[Install]
WantedBy=multi-user.target
EOF

echo "== Backup diário do banco (guarda 14 dias)"
cat > /etc/systemd/system/galobrigao-backup.service <<'EOF'
[Unit]
Description=Backup do banco do Galo Brigão

[Service]
Type=oneshot
User=galobrigao
WorkingDirectory=/opt/galobrigao
EnvironmentFile=/etc/galobrigao.env
ExecStart=/bin/sh -c 'node dist-server/cli.mjs backup /var/lib/galobrigao/backups/rinha-$(date +%%F-%%H%%M).sqlite && find /var/lib/galobrigao/backups -name "rinha-*.sqlite" -mtime +14 -delete'
EOF
cat > /etc/systemd/system/galobrigao-backup.timer <<'EOF'
[Unit]
Description=Backup diário do Galo Brigão

[Timer]
OnCalendar=*-*-* 06:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now galobrigao.service galobrigao-backup.timer
systemctl restart galobrigao.service
sleep 2
systemctl is-active galobrigao.service
curl -fsS http://127.0.0.1:8787/api/config >/dev/null && echo "app respondendo localmente"

echo "== Contas de administrador (só na primeira instalação)"
if [ ! -f "$DATA/.admins-criados" ]; then
  touch /root/admin-senhas.txt && chmod 600 /root/admin-senhas.txt
  for email in vinicius@vj.dev.br vinicius.morais@vj.dev.br; do
    sudo -u galobrigao DB_FILE="$DATA/rinha.sqlite" node "$APP/dist-server/cli.mjs" admin create "$email" >> /root/admin-senhas.txt 2>&1 || true
  done
  touch "$DATA/.admins-criados"
  echo "senhas temporárias gravadas em /root/admin-senhas.txt (somente root)"
fi

echo "== Caddy (HTTPS automático)"
cat > /etc/caddy/Caddyfile <<EOF
galobrigao.com.br {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8787 {
		header_up X-Forwarded-For {remote_host}
	}
	log {
		output file /var/log/caddy/galobrigao.log {
			roll_size 50mb
			roll_keep 5
		}
	}
}

www.galobrigao.com.br {
	redir https://galobrigao.com.br{uri} permanent
}

$HOST {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8787 {
		header_up X-Forwarded-For {remote_host}
	}
}
EOF
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy
echo "== Pronto: https://galobrigao.com.br (e https://$HOST)"
