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

## Corrigido no 2º lote

| Item | Arquivo | O que mudou |
|------|---------|-------------|
| **scrypt bloqueava o event loop** | `server/auth.ts` (+ call sites) | `hashPassword`/`checkPassword` agora são **assíncronos** (`promisify(scrypt)`, roda na threadpool). Testado: 12/12 e2e incl. caminhos negativos (senha errada em login/troca/exclusão rejeita — sem bypass). |
| **Lockout virava DoS dirigido** | `server/app.ts` | A chave do contador de falhas passou de `email` para **`email\|ip`**: um atacante não tranca mais a conta de uma vítima só errando a senha dela; o legítimo, de outro IP, continua entrando. |
| **Enumeração por tempo no `/forgot`** | `server/app.ts` | O envio do e-mail de recuperação não é mais aguardado (`void sendMail(...)`), então a resposta sai no mesmo tempo exista ou não a conta. |
| **Prêmio de aposta fora da transação** | `server/bets.ts` | `takeCredits()` foi movido para **dentro** do `BEGIN/COMMIT` da aposta: se der rollback, o `credited=1` volta atrás e o jogador não perde o prêmio. |
| **SQLite sem espera sob contenção** | `server/db.ts` | `PRAGMA busy_timeout = 5000` (espera em vez de erro imediato se o banco estiver ocupado). |
| **Save sem proteção contra lost-update** | `server/saves.ts`, `server/app.ts` | `writeSave` agora é **compare-and-swap** (`UPDATE … WHERE user_id=? AND rev=?`): só grava se o rev no banco ainda for o anterior; conflito vira `SaveConflict` → **HTTP 409** ("recarregue"). Verificado que os trechos `load→write` dos handlers de dinheiro (web3/depósito) são **síncronos** (o `await` on-chain fica antes do `BEGIN`), então em processo único o CAS nunca dispara — é backstop para multi-processo, evitando double-spend por lost-update. Testado: CAS unitário 5/5 + fluxo real de save 5/5. |

## Pendências recomendadas (não bloqueiam o lançamento)

- **Rate-limit/lockout em memória (pré-escala).** Os contadores de rate-limit e de falhas de login vivem na memória do processo. O **CAS do save já cobre o double-spend** se o servidor virar multi-processo; falta só mover rate-limit/lockout para um store compartilhado (SQLite/Redis) antes de habilitar cluster — senão cada processo tem seus próprios contadores. Hoje (processo único): seguro. **Não habilitar cluster** sem isso.
- **Verificação de e-mail** (squatting; gate 18+ autodeclarado) — relevante por ser app com dinheiro. É um fluxo novo (token + e-mail + gate nas features de gasto); decisão de produto.
- **Enumeração no cadastro:** `/signup` ainda responde 409 distinto quando o e-mail já existe (tradeoff de UX: avisar "já tem conta"). O `/forgot` já foi uniformizado.
- **RNG de caixas** usa `Math.random()` em vez de `crypto` (`src/game/premium.ts`, código isomórfico cliente/servidor) — justiça, não exploit.
- **scrypt 2¹⁷:** exigiria novo prefixo versionado (`s3:`) mantendo o verificador de 2¹⁶, para não re-brickar quem já migrou para `s2:`.

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
