# 🐓 Galo Brigão

Jogo web de criação e lutas de galos de desenho animado, com apostas em moeda virtual.

## Rodar

```bash
npm install
cp .env.example .env   # já vem em modo de teste (sem cobrança)
npm run dev            # jogo + API em http://localhost:5173
```

Produção:

```bash
npm run build          # gera dist/ (jogo) e dist-server/ (API)
npm start              # http://localhost:8787
```

Conta, save, pedidos e pagamentos ficam no SQLite em `data/rinha.sqlite`.
Para cobrar de verdade (Mercado Pago, Pix e cartão), veja `docs/MONETIZACAO.md`, seção 7.

Produção (Google Cloud), atualização, logs, backups e segurança: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Telas

| Menu | O que tem |
|---|---|
| 🏠 Galinheiro | Seus galos, detalhes, treino, itens, acessórios (4 espaços), troca de estilo, renomear, vender |
| ⚔️ Rinha | Escolha seu galo e um adversário (fácil/médio/difícil) com chance de vitória estimada |
| 🤝 Desafios | Desafie galos de jogadores online (nível igual ou ±1). O outro aceita ou recusa em 60s; o servidor simula e paga os dois |
| 🎲 Apostas | Card com 6 lutas da casa, odds por simulação (vencedor A/B ou K.O.), cupom, histórico |
| 🎯 Missões | 5 missões diárias com recompensas |
| 🏆 Liga | Temporada semanal, 5 divisões, ranking e prêmios |
| 🎨 Skins | 14 skins visuais (milho e ovos), skin da semana com 30% off, 3 pacotes com desconto, coleção |
| 🧰 Ferramentas | 9 ferramentas de luta + 3 kits. Leve até 2 por luta na Rinha (gastas ao lutar) |
| 🛒 Loja | Galos, acessórios, itens, caixas surpresa (com % visível), ovos de ouro, Passe VIP, troca |
| 👤 Perfil | Nome/avatar, estatísticas, 12 conquistas, extrato |

## Economia

- **🌽 Milho**: moeda comum. Ganha lutando, apostando, missões, bônus diário.
- **🥚 Ovo de ouro**: moeda premium. É a que se vende por dinheiro (pacotes e Passe do Criador).
- Odds = probabilidade simulada (centenas de lutas) com margem da casa de 7% (`HOUSE_EDGE` em `src/game/battle.ts`).

## Backoffice

Acesse `#/admin` com uma conta administradora. Administradores são definidos por comando no servidor: `npm run admin -- create email@dominio` (ou `add`/`remove`/`list`).

- **Visão geral:** receita, conversão, gasto médio por pagante, ativos por dia e no mês, novas contas, desafios, receita por produto, Pix x cartão e funil.
- **Jogadores:** busca, detalhe (galos, saldo, compras), ajuste de saldo com motivo e bloqueio/desbloqueio.
- **Pedidos:** filtro por status e reconsulta no Mercado Pago.
- **Configurações (valem na hora, sem publicar):** preços e quantidade dos pacotes, produtos à venda, ovos grátis, regras dos desafios, limites anti-trapaça, aviso para todos e modo manutenção.
- **Auditoria:** tudo que os administradores fizeram.

## Monetização

Estudo completo, taxas, quanto sobra de cada venda e riscos: [`docs/MONETIZACAO.md`](docs/MONETIZACAO.md).
Perguntas para o advogado: [`docs/JURIDICO.md`](docs/JURIDICO.md). Nome do jogo e dados da empresa: `src/brand.ts`.

## Onde está a monetização

- **Skins** (`SKINS` em `src/game/data.ts`): cosméticas, maioria em ovos. Skin da semana com desconto e pacotes.
- **Ferramentas** (`TOOLS` / `TOOL_KITS`): consumíveis. Cada luta gasta, então há recompra contínua.
- **Ovos de ouro / Passe VIP**: a moeda que se compra com dinheiro.

## Monetização real

A compra de ovos e do Passe VIP está em **modo demonstração** (`buyEggPack` e `buyVip` em `src/game/store.tsx`).
Para vender de verdade:
1. Criar um backend (o estado hoje fica no `localStorage`, o que permite trapaça).
2. Integrar Mercado Pago / Stripe e só creditar ovos após o webhook de pagamento confirmado.
3. Manter as moedas **sem saque**: apostar com moeda comprada e permitir sacar dinheiro vira jogo de azar,
   que exige licença no Brasil (Lei 14.790/2023).

## Estrutura

```
server/       API: contas, sessões, save, pedidos, Pix/cartão (Mercado Pago), webhook, limites
src/api.ts    cliente da API
src/game/     tipos, dados, catálogo pago, motor de luta (engine.ts é compartilhado com o servidor), estado e sons
src/components RoosterSvg (desenho + acessórios + animações), menu, componentes
src/pages/     uma tela por menu + Luta (arena)
```
