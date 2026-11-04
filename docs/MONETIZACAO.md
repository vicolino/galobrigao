# Galo Brigão — Monetização

Estudo comparativo e o modelo que está implementado no jogo. Data: novembro de 2026.

## 1. Resumo

| Pergunta | Resposta |
|---|---|
| Como ganhamos dinheiro? | Venda de **ovos de ouro** (moeda premium), **kits iniciais**, **Passe do Criador** (assinatura) e itens comprados com ovos: skins, acessórios, ferramentas, galos premium, evolução de estrelas, comida instantânea. |
| Como o usuário paga? | **Pix** (QR Code + copia e cola, aprovação na hora) e **cartão de crédito** (Checkout Pro do Mercado Pago, o cartão nunca passa pelo nosso servidor). |
| Como ele compra um galo? | No cadastro: Galo Livre grátis **ou** um kit pago (R$ 9,90 / 24,90 / 49,90). Depois: Mercado (milho), Edição Eleições (ovos), ofertas na Loja. |
| Como compra skins? | Com ovos de ouro. Skin da semana com 30% off e pacotes com ~25% de desconto. |
| Como aposta? | Com **milho** (moeda do jogo) nas lutas da casa: vencedor A, vencedor B ou "termina em K.O.". **Não há saque.** |
| Por que não apostar dinheiro real? | Aposta com prêmio em dinheiro = casa de apostas. No Brasil exige outorga federal (Lei 14.790/2023), e Mercado Pago/Stripe encerram contas que operam aposta sem licença. Ver seção 6. |

## 2. Benchmark

| Jogo | Modelo | O que vende | Faixa de preço (BR) | O que copiamos |
|---|---|---|---|---|
| **Free Fire** (Garena) | Grátis + moeda premium (diamantes) | Skins, passe de elite, caixas | 100 diamantes ≈ R$ 4,49; 1.060 ≈ R$ 44,99 | Pacotes de moeda com bônus crescente, Pix via site de recarga (sem taxa de loja de app), passe mensal |
| **Clash Royale / Brawl Stars** | Grátis + gemas | Passe, ofertas de começo, cosméticos | Ofertas iniciais muito baratas | "Oferta de começo" única por conta (nossos kits) |
| **Coin Master** | Social casino (sem saque) | Giros e moedas | R$ 5–100 | Aposta só com moeda virtual, bônus diário com sequência |
| **Pokémon GO** | Grátis + moedas | Itens consumíveis, incubadoras | R$ 5–100 | Consumíveis que se gastam ao usar (nossas ferramentas e comida) |
| **Axie Infinity** | Play-to-earn (saque) | NFTs | — | **Evitamos**: saque de dinheiro trouxe colapso econômico e risco regulatório |

Conclusão: o padrão que funciona no Brasil é **moeda premium + cosméticos + consumíveis + passe mensal + oferta inicial barata**, com **Pix** como meio principal.

## 3. Tabela de preços implementada

Referência: **1 ovo de ouro ≈ R$ 0,05 a R$ 0,10** (R$ 0,098 no pacote de 50, R$ 0,050 no de 2.000). Os valores "≈ em R$" da tabela abaixo usam ~R$ 0,10, o preço do pacote menor.

### Dinheiro real (`src/game/catalog.ts`)

| Produto | Preço | Entrega |
|---|---|---|
| 50 ovos | R$ 4,90 | 50 |
| 130 ovos | R$ 9,90 | 120 + 10 |
| 345 ovos — *mais vendido* | R$ 22,90 | 300 + 45 |
| 850 ovos | R$ 49,90 | 700 + 150 |
| 2.000 ovos — *melhor valor* | R$ 99,90 | 1.600 + 400 |
| Passe do Criador (30 dias) | R$ 19,90 | 100 ovos + 10 ovos/dia + 25% milho |
| Kit Brigão (1x) | R$ 9,90 | Índio Gigante ★★★ + 120 ovos + 9 ferramentas |
| Kit Campeão (1x) — *mais escolhido* | R$ 24,90 | Aurora ★★★★ + skin + 350 ovos + ferramentas |
| Kit Lenda (1x) | R$ 49,90 | Galo de Ouro ★★★★★ + skin Fênix + 800 ovos + ferramentas |

### Com ovos (gasto dentro do jogo)

| Item | Preço em ovos | ≈ em R$ |
|---|---|---|
| Skin rara / épica / lendária | 45–50 / 85–120 / 200–300 | R$ 4 / 9–12 / 20–30 |
| Pacote de 3 skins | 135–380 | R$ 13–37 |
| Acessório épico / lendário | 60–80 / 150–200 | R$ 6–8 / 15–20 |
| Ferramenta rara / épica / lendária | 6 / 8–12 / 20 | R$ 0,60 / 1 / 2 |
| Kit de ferramentas | 40–75 | R$ 4–7 |
| Evoluir estrela (1→2, 2→3, 3→4, 4→5) | 40 / 80 / 150 / 250 | R$ 4 / 8 / 15 / 25 |
| Comer agora (pular espera de 4h) | 3 | R$ 0,30 |
| Galo da Edição Eleições | 99 | R$ 10 |
| Caixa surpresa (Baú de Ouro) | 40 | R$ 4 |

### Quanto se ganha de graça

Regra: um jogador ativo que não paga consegue **qualquer skin épica em até 4 dias**. Simulação de 1.000 dias de um jogador que pega o bônus diário, completa as 5 missões e faz 10 lutas por dia (metade difíceis, 55% de vitória):

| Fonte | Ovos por dia |
|---|---|
| Bônus diário (6 por dia, 35 no 7º dia) | 10,1 |
| Missões (todas dão ovos, 2 a 7 cada) | 17,1 |
| Vitórias na Arena | 5,9 |
| **Total** | **~33** |

| Item | Dias jogando de graça |
|---|---|
| Skin rara (45–50) | ~1,5 |
| Skin épica (85–120) | 2,6 a 3,6 |
| Skin lendária (200–300) | 6 a 9 |
| Evoluir 4★ → 5★ (250) | ~7,5 |

Assim o jogo é justo com quem não paga, e o dinheiro vem de quem quer **tudo agora**: lendárias, estrelas, ferramentas e kits. Os valores ficam em `src/game/rewards.ts` (bônus e Arena) e no `MISSION_POOL` de `src/game/engine.ts` (missões).

## 4. Funil e ciclo de gasto

1. **Cadastro** (e-mail, senha, 18+, termos) →
2. **Primeiro galo**: Galo Livre grátis (fraco, 1★) *ou* kit pago no Pix. A comparação lado a lado deixa a diferença de força visível →
3. **Primeiras lutas**: o Galo Livre perde dos adversários médios → motivo para **alimentar**, **treinar**, **evoluir estrela** ou comprar um kit →
4. **Ciclo diário**: bônus diário (sequência de 7 dias), missões, alimentar a cada 4h, energia que recarrega 1/min →
5. **Gastos recorrentes**: ferramentas acabam a cada luta; comida instantânea; skin da semana; temporada da liga semanal →
6. **Assinatura**: Passe do Criador dá ovos todo dia (retenção de 30 dias).

KPIs para acompanhar: conversão cadastro→pagante (meta 3–6%), ARPPU, % que compra kit inicial, retenção D1/D7/D30, receita por produto.

## 5. Meios de pagamento

### Taxas do Mercado Pago (vendas online)

Números das páginas oficiais do Mercado Pago (checkout e link de pagamento), consultadas em 04/11/2026. A página de custos exige login, então **confirme no painel da sua conta** antes de fechar preços.

| Meio | Taxa | Recebimento |
|---|---|---|
| **Pix** | **0,99%** | Na hora |
| Cartão de crédito à vista | **4,98%** | Na hora |
| Cartão de crédito à vista | 4,48% | Em 14 dias |
| Cartão de crédito à vista | ~3,98% a 3,99% (uma página cita 2,95%) | Em 30 dias |
| Parcelado | 2,53% (2x) até 24,28% (18x) | — o jogo vende só à vista |

Recomendação: **empurrar o Pix** (mais barato e é o que o público de jogos no Brasil já usa) e configurar o cartão para **receber em 30 dias**, o que corta a taxa quase pela metade em relação ao recebimento na hora. Contas novas às vezes só têm recebimento em 7 dias no começo.

### Quanto sobra de cada venda

| Produto | Preço | Líquido no Pix (−0,99%) | Líquido no cartão, na hora (−4,98%) | Líquido no cartão, 30 dias (−3,98%) |
|---|---|---|---|---|
| 50 ovos | R$ 4,90 | R$ 4,85 | R$ 4,66 | R$ 4,70 |
| 130 ovos | R$ 9,90 | R$ 9,80 | R$ 9,41 | R$ 9,51 |
| 345 ovos | R$ 22,90 | R$ 22,67 | R$ 21,76 | R$ 21,99 |
| 850 ovos | R$ 49,90 | R$ 49,41 | R$ 47,41 | R$ 47,91 |
| 2.000 ovos | R$ 99,90 | R$ 98,91 | R$ 94,92 | R$ 95,92 |
| Passe do Criador | R$ 19,90 | R$ 19,70 | R$ 18,91 | R$ 19,11 |
| Kit Brigão | R$ 9,90 | R$ 9,80 | R$ 9,41 | R$ 9,51 |
| Kit Campeão | R$ 24,90 | R$ 24,65 | R$ 23,66 | R$ 23,91 |
| Kit Lenda | R$ 49,90 | R$ 49,41 | R$ 47,41 | R$ 47,91 |

Outros custos a considerar: impostos (Simples Nacional, em geral 6% a 15,5% para serviços digitais, conforme anexo e faturamento — ver com o contador), hospedagem e e-mail.

### Comparação com outros provedores

| Provedor | Pix | Cartão | Observações |
|---|---|---|---|
| **Mercado Pago** (implementado) | 0,99% | 3,98% a 4,98% | Pix por API com QR, Checkout Pro para cartão |
| Stripe | Via parceria com EBANX | ~3,99% + R$ 0,39 (fonte não oficial) | Política restritiva para jogos com aposta |
| Efí / Asaas / PagBank | Sim | Sim | Alternativas para Pix com tarifa fixa |
| Google Play / App Store | — | Obrigatório dentro do app | Comissão de 15–30%. Vender pelo site evita essa taxa |

Como está implementado (`server/payments.ts`):
- Pedido criado no servidor com preço do catálogo (o navegador nunca define preço).
- Pix: `POST /v1/payments` (expira em 30 min). Cartão: `POST /checkout/preferences`.
- Confirmação: **webhook** `/api/webhooks/mercadopago` (com validação de assinatura) + consulta ativa quando o jogador está na tela de pagamento.
- Entrega **idempotente**: o mesmo pagamento nunca entrega duas vezes; confere se o valor pago bate com o pedido.
- Sem `MP_ACCESS_TOKEN`, roda em **modo de teste** com botão "Simular pagamento aprovado".

## 6. Riscos e decisões

- **Apostas com dinheiro real**: fora de escopo de propósito. Para fazer, seria preciso virar operador licenciado (outorga federal de cerca de R$ 30 milhões, sede no Brasil, KYC, jogo responsável, auditoria). Mesmo social casino (sem saque) deve ser revisado por advogado.
- **Tema "rinha de galo"**: rinha real é crime (Lei 9.605/98, maus-tratos). O jogo é desenho animado, mas processadores de pagamento e lojas de app podem rejeitar o tema. Considerar um nome como "Galo Brigão" ou "Terreiro Arena" antes de lançar.
- **Nomes de políticos** (Lula Livre / Bolsonaro Mito): risco de direito de imagem e propaganda eleitoral. Sugestão: nomes de paródia ou itens grátis.
- **Proteções já implementadas**: 18+ no cadastro, **limite de gasto mensal** (padrão R$ 500; aumentar só vale após 24h; reduzir vale na hora), histórico de compras, chances das caixas visíveis, compras de kit uma vez por conta.
- **Integridade**: todas as compras da loja, evolução de estrelas, comida instantânea, caixas, trocas e o Mercado de galos rodam no servidor (`src/game/premium.ts`). O servidor recusa progresso que crie skins, estrelas, atributos, galos, ferramentas, itens ou acessórios premium do nada, e limita ovos ganhos jogando a 400 por dia.
- **Nome e marca**: o jogo passou a se chamar **Galo Brigão** (troca em `src/brand.ts`), a tela de luta virou **Arena**, e os galos da Edição Eleições usam apelidos de paródia (Barbudo Vermelho e Capitão Verde-Amarelo).
- **LGPD**: termos de uso, política de privacidade, exclusão de conta pelo próprio jogador e recuperação de senha por e-mail. Os textos são modelo — revisar com advogado (ver `docs/JURIDICO.md`).

## 7. Como ativar cobrança de verdade

1. Criar conta no Mercado Pago como empresa e pegar as credenciais em *Suas integrações*.
2. Testar primeiro com o token de **teste** (`TEST-...`) e os usuários de teste do Mercado Pago.
3. Preencher `.env`: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `PUBLIC_URL` (endereço público com HTTPS) e apagar `PAYMENT_PROVIDER=sandbox`.
3b. E-mail (recuperar senha): criar conta no Resend, verificar o domínio e preencher `RESEND_API_KEY` e `MAIL_FROM`.
3c. Preencher razão social e e-mail de suporte em `src/brand.ts`.
4. Cadastrar a URL de notificação `https://SEU_DOMINIO/api/webhooks/mercadopago` no painel.
5. `npm run build && npm start`.

## Fontes

- [Diamantes Free Fire: preços 2026 — Free Fire Mania](https://www.freefiremania.com.br/tudo-sobre/diamantes.html)
- [Diamantes Free Fire: preços e recarga 2026 — Gameoverdrive](https://gameoverdrive.com.br/diamantes-free-fire-precos-recarga-2026/)
- [Quanto custa receber via Pix e QR — Mercado Pago](https://www.mercadopago.com.br/blog/quanto-custa-receber-pagamentos-via-pix-e-codigo-qr)
- [Taxas Mercado Pago — Calculadora de Taxas](https://www.calculadoradetaxas.com.br/mercado-pago/taxas)
- [Checkout Mercado Pago (oficial)](https://www.mercadopago.com.br/ferramentas-para-vender/check-out)
- [Link de pagamento Mercado Pago (oficial)](https://www.mercadopago.com.br/ferramentas-para-vender/link-de-pagamento)
- [Quanto custa vender online com Mercado Pago (oficial)](https://www.mercadopago.com.br/blog/quanto-custa-vender-on-line-com-mercado-pago)
- [Stripe users can now accept Pix in Brazil via EBANX](https://business.ebanx.com/en/press-room/press-releases/stripe-users-can-now-accept-pix-in-brazil-via-ebanx)
- [Calculadora de taxas do Stripe — Sellfy](https://sellfy.com/pt/ferramentas/calculadora-de-taxas-do-stripe/)
