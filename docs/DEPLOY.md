# Galo Brigão — Produção (Google Cloud)

## Onde está

| Item | Valor |
|---|---|
| Site | https://35-199-88-58.sslip.io |
| Projeto GCP | `replicats-449911` |
| VM | `galobrigao` · e2-small · `southamerica-east1-a` (São Paulo) · Debian 12 |
| IP fixo | `35.199.88.58` (`galobrigao-ip`) |
| Rede | `galobrigao-net` (isolada das outras redes do projeto) |
| Firewall | 80/443 abertas; SSH (22) **só pelo IAP** do Google; app (8787) só dentro da VM |
| Custo aproximado | ~US$ 15/mês (VM) + IP fixo + snapshots |

## Como funciona na VM

- **Caddy** recebe HTTPS (certificado Let's Encrypt automático) e repassa para o app em `127.0.0.1:8787`.
- **App** roda como serviço `galobrigao` (usuário próprio, sem login, sistema de arquivos somente leitura, só escreve em `/var/lib/galobrigao`).
- **Configuração secreta**: `/etc/galobrigao.env` (só root e o app leem).
- **Banco**: `/var/lib/galobrigao/rinha.sqlite`.
- **Backups**: cópia do banco todo dia às 06:00 (UTC) em `/var/lib/galobrigao/backups` (14 dias) + snapshot diário do disco no GCP (`galobrigao-diario`, 7 dias).
- **Atualizações de segurança** do sistema: automáticas.

## Comandos do dia a dia

Entrar na VM (pelo túnel IAP):

```bash
gcloud compute ssh galobrigao --project replicats-449911 --zone southamerica-east1-a --tunnel-through-iap
```

Publicar uma nova versão (depois de `git push`):

```bash
sudo bash /opt/galobrigao/deploy/setup.sh
```

Ver logs do app / do Caddy:

```bash
sudo journalctl -u galobrigao -f
sudo tail -f /var/log/caddy/galobrigao.log
```

Senhas temporárias dos administradores (troque no Perfil → Trocar senha e depois apague o arquivo):

```bash
sudo cat /root/admin-senhas.txt
sudo shred -u /root/admin-senhas.txt
```

Administradores:

```bash
cd /opt/galobrigao
sudo -u galobrigao DB_FILE=/var/lib/galobrigao/rinha.sqlite node dist-server/cli.mjs admin list
sudo -u galobrigao DB_FILE=/var/lib/galobrigao/rinha.sqlite node dist-server/cli.mjs admin create email@dominio
sudo -u galobrigao DB_FILE=/var/lib/galobrigao/rinha.sqlite node dist-server/cli.mjs admin remove email@dominio
```

## Ativar pagamentos de verdade

Hoje o site está com **pagamentos desligados** (em produção o modo de teste é recusado de propósito, senão qualquer um "simularia" compras).

1. Edite `/etc/galobrigao.env`: preencha `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` e apague a linha `PAYMENT_PROVIDER=sandbox`.
2. No painel do Mercado Pago, cadastre a notificação: `https://35-199-88-58.sslip.io/api/webhooks/mercadopago`.
3. `sudo systemctl restart galobrigao`

E-mail (recuperar senha): preencha `RESEND_API_KEY` e `MAIL_FROM` e reinicie. Sem isso, o link aparece só no log (`journalctl -u galobrigao`).

## Domínio próprio

1. Crie um registro DNS `A` do domínio apontando para `35.199.88.58`.
2. Na VM: `sudo GB_HOST=seudominio.com.br bash /opt/galobrigao/deploy/setup.sh` e troque `PUBLIC_URL` em `/etc/galobrigao.env` para `https://seudominio.com.br`; `sudo systemctl restart galobrigao`.

## Segurança — o que está protegido

- Admin só por comando na VM (cadastro com e-mail de admin não dá acesso).
- Senhas com scrypt; sessão em cookie HttpOnly + Secure + SameSite; troca de senha derruba outras sessões.
- Limites: 300 req/min por IP; login 20/min por IP e 8 erros por conta em 15 min; cadastro 5/h por IP; recuperar senha 5/h.
- Cabeçalhos: CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy.
- Conferência de origem em toda requisição que altera dados; IP real só via Caddy (cabeçalho falsificado é ignorado).
- Compras, skins, estrelas, galos e mercado decididos pelo servidor; limites de nível, XP, liga, ovos e milho no progresso.
- Webhook do Mercado Pago com assinatura obrigatória e proteção contra reenvio; pagamento conferido direto na API do Mercado Pago.

## Próximos passos recomendados

- Verificação de e-mail no cadastro e 2FA para administradores.
- Mover as lutas da Arena e as apostas para o servidor (hoje têm limites de bom senso, não são 100% à prova de trapaça).
- Monitoramento de disponibilidade (ex.: Uptime check do GCP) e alerta de erro.
