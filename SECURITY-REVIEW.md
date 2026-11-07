# Revisão de segurança — Galo Brigão (pré-produção)

Data: 2026-11-07 · Escopo: servidor (`server/`), cliente (`src/`), deploy (`deploy/`).
Método: auditoria por domínio (auth/sessão, SQLi + autorização/IDOR, integridade da economia/pagamentos, camada web/admin/XSS) com verificação dos achados críticos no código.

## Veredito

Código maduro e bem protegido. Nos domínios de maior risco para um jogo com economia real — injeção de SQL, autorização/IDOR, integridade de moeda, pagamentos e saques — **não há vulnerabilidade crítica ou alta explorável** na topologia atual (processo único). Os ajustes abaixo são de endurecimento e configuração.

## Corrigido nesta revisão

| # | Item | Arquivo | O que mudou |
|---|------|---------|-------------|
| 1 | X-Forwarded-For falsificável burlava todos os rate-limits | `server/security.ts`, `deploy/setup.sh` | `clientIp()` passa a ler o **último** item do XFF (o que o proxy confiável anexou); o Caddy ganhou `header_up X-Forwarded-For {remote_host}`, que sobrescreve o valor do cliente. |
| 2 | scrypt no custo padrão (N=2¹⁴) | `server/auth.ts`, `server/app.ts` | Custo subiu para **N=2¹⁶** (r=8, p=1), 4× o padrão — escolhido 2¹⁶ e não 2¹⁷ para caber com folga na VM de processo único (~67 MB/cálculo); dá para subir depois. Hashes novos levam o prefixo `s2:`; hashes legados continuam a ser verificados e são **re-hasheados no próximo login** (sem brickar contas existentes). Testado ponta a ponta. |
| 3 | Cookie de sessão sem `Secure` se `PUBLIC_URL` fosse http | `server/app.ts` | `Secure` agora é definido por `isProd() \|\| PUBLIC_URL começa com https`. Confirmado que em produção o cookie sai com `Secure`. |
| 4 | `ws` (via `viem`) com advisory HIGH (vazamento de memória) + DoS | `package.json`, `package-lock.json` | `viem` 2.21.54 → 2.57.16 (mesma major); `ws` resolvido para 8.21.0. `npm audit`: 0 vulnerabilidades. Typecheck do web3 ok. |

## Pendências recomendadas (não bloqueiam o lançamento)

- **Arquitetura mono-processo.** Rate-limits/lockout (memória) e a atomicidade dos débitos de save (sem compare-and-swap) só valem com **um processo**. Antes de escalar para cluster/múltiplas instâncias sobre o mesmo SQLite: CAS no `writeSave` (`WHERE rev = ?`), `BEGIN IMMEDIATE` nos handlers de moeda, `PRAGMA busy_timeout`, e rate-limit/lockout compartilhado (SQLite/Redis). Hoje: **não habilitar cluster.**
- **Enumeração de e-mail:** cadastro responde 409 distinto; `/forgot` vaza por tempo de resposta. Uniformizar.
- **Lockout vira DoS dirigido:** 8 falhas por e-mail trancam a conta sem vínculo com IP (`app.ts`). Combinar com IP / CAPTCHA.
- **`scryptSync` bloqueia o event loop** (agora mais caro). Migrar para `scrypt` assíncrono.
- **Sem verificação de e-mail** (squatting; gate 18+ autodeclarado).
- **Prêmio de aposta consumido fora da transação** (`bets.ts:286`): em rollback o jogador perde o prêmio (prejudica o jogador, não dá ganho ao atacante).
- **RNG de caixas** usa `Math.random()` em vez de `crypto` (justiça, não exploit).

## Confirmado seguro (checado)

- **SQLi:** nenhum. `ORDER BY` do admin é whitelist; todas as queries usam placeholders.
- **Autorização/IDOR:** identidade sempre do cookie de sessão, nunca do corpo; toda ação checa posse do recurso; admin num único choke point (`role` no banco, setado só por CLI).
- **Path traversal** no serving estático: contido (`normalize` + confinamento em `dist/`).
- **XSS no SVG do NFT:** nomes escapados; CSP `default-src 'none'`.
- **Pagamentos (Mercado Pago):** webhook com HMAC + `timingSafeEqual` + janela anti-replay de 10 min; valor vem da API; `fulfill` idempotente; rejeita subpagamento.
- **Depósitos USDC → ovos:** idempotente (`BEGIN IMMEDIATE` + guarda de status), transfer assinado no servidor, lock por usuário, cap diário.
- **Marketplace web3/NFT:** verifica dono on-chain + preço/vendedor; CAS de status; conservação de tokens.
- **Preço:** sempre do servidor por `id`; cliente manda só `id`/`qty`/`method`. Negativo/NaN/overflow barrados.
- **Claims diários/missão:** sem replay (estado autoritativo no servidor).
- **Headers/CSP** bons; **CORS** sem reflexão de origem; body com cap de 2 MB; `.env` fora do git; sem segredos hardcoded.
