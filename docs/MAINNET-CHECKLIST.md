# Checklist antes da mainnet (Polygon PoS)

Hoje o jogo roda na **testnet Polygon Amoy** (chainId 80002, gás em POL de teste) ou numa chain local
(31337). Na testnet os tokens CORN/EGG e os NFTs não valem nada. Na **mainnet Polygon PoS** (chainId 137)
eles passam a ter valor de mercado, e o jogo passa a responder como emissor de ativo digital. Este
documento lista o que precisa estar pronto antes de ligar `WEB3_NETWORK=mainnet`.

> O servidor **se recusa** a ligar a camada web3 na mainnet se faltar qualquer trava técnica abaixo
> (`server/chain.ts → mainnetBlockers()`). As travas técnicas não substituem os itens jurídicos:
> eles vêm primeiro.

## 0. Travas que o código já confere

| Trava | Onde | Sem ela |
|---|---|---|
| `WEB3_MAINNET_ACK=yes` | `.env` | web3 desligado, log `[web3] MAINNET bloqueada` |
| `KYC_PROVIDER` com um provedor real (não `manual`) | `.env` | web3 desligado |
| Economia no servidor (`economy.serverAuthoritative`) | Backoffice → Configurações | web3 desligado (desliga sozinho se alguém desmarcar) |
| Ponte de saída CORN/EGG só para conta com KYC `verified` | `server/web3.ts` | 403 |
| Aprovação manual de KYC no backoffice proibida | `server/web3.ts → setKyc` | 403 |
| Limites diários da ponte e de envios (`WEB3_DAILY_BRIDGE_CAP`, `WEB3_DAILY_SEND_CAP`) | `.env` | padrão: 🥚 5.000 e 🌽 200.000 por dia |
| USDC nativo da Circle (`0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`) | padrão na mainnet | usa `WEB3_USDC` se informado |

`KYC_PROVIDER` hoje é só o nome: **falta a integração** (webhook do provedor gravando
`users.kyc_status = 'verified'`). Sem ela ninguém fica verificado e a ponte de saída não abre.

## 1. Jurídico (antes de qualquer linha de código)

- [ ] **Parecer jurídico no Brasil**: enquadramento dos tokens CORN/EGG e dos NFTs perante a **CVM**
      (valor mobiliário? Parecer de Orientação CVM 40/2022) e a **Lei 14.478/2022** (marco dos ativos
      virtuais: prestadora de serviços de ativos virtuais, autorização do Banco Central).
- [ ] **Jogos de azar**: apostas usam 🎟️ fichas sem valor; confirmar que nada com valor (tokens, NFTs,
      USDC) pode entrar ou sair das apostas (Decreto-Lei 3.688/41, Lei 14.790/2023 das apostas de
      quota fixa). Manter fichas fora da ponte.
- [ ] **EUA / outros países**: risco de "security" (teste de Howey, SEC), leis estaduais de jogos de
      azar e sweepstakes, sanções (OFAC). Decidir bloqueio por geolocalização onde não houver parecer.
- [ ] **Termos de uso e Política de Privacidade** atualizados: natureza dos tokens (itens de jogo, sem
      promessa de valorização), riscos de cripto, KYC, limites, taxas, irreversibilidade das transações,
      encerramento do jogo (o que acontece com os tokens), proibição de menores.
- [ ] **Tributação**: tratamento da venda de NFTs/itens em USDC (receita da taxa do Market), obrigações
      de reporte (IN RFB 1.888/2019 e sucessoras).
- [ ] **Sem cash-out de compras**: nada comprado com dinheiro (🥚 ovos de lojas, VIP, passe) pode virar
      token vendável sem análise jurídica específica (risco de câmbio/arranjo de pagamento).

## 2. KYC / AML

- [ ] Contratar provedor (ex.: Sumsub, Onfido, Veriff, idwall) com checagem de documento, prova de vida
      e listas de sanções / PEP.
- [ ] Integrar o webhook do provedor → `kyc_status` (nunca aprovação manual na mainnet).
- [ ] Monitoramento de transações (Chainalysis, TRM, Elliptic) para carteiras de destino em envios
      externos; bloquear endereços sancionados.
- [ ] Política de AML escrita, responsável (compliance officer) e canal de comunicação ao COAF se exigido.

## 3. Contratos

- [ ] **Auditoria externa** de `GameToken` (CORN/EGG), `GameItems` (NFTs) e `Market` por empresa
      reconhecida; corrigir tudo que for alto/crítico e publicar o relatório.
- [ ] Testes de fuzz/invariantes (oferta total só muda por mint/burn do operador; Market não perde USDC).
- [ ] Verificar os contratos no **Polygonscan** (código-fonte público).
- [ ] Decidir pausabilidade/upgrade: botão de pausa (circuit breaker) controlado pela multisig.
- [ ] Taxa do Market (`feeBps`) e `treasury` conferidos; `treasury` = multisig.

## 4. Chaves e custódia

- [ ] **Multisig (Safe na Polygon)** como dona dos contratos e da tesouraria (ex.: 2 de 3 ou 3 de 5,
      signatários em aparelhos diferentes). O operador quente só tem papel de minter/burner.
- [ ] Chave do operador (`WEB3_OPERATOR_KEY`) e segredo das carteiras custodiais (`WEB3_WALLET_SECRET`)
      em **KMS/HSM** (AWS KMS, GCP KMS, HashiCorp Vault) — nunca em `.env` de servidor na mainnet.
- [ ] Rotação de chaves documentada; backup cifrado do segredo das carteiras custodiais (perder =
      perder os fundos dos jogadores).
- [ ] Saldo mínimo de POL no operador (paga o gás dos jogadores) com alerta de reabastecimento.
- [ ] Avaliar se a custódia de carteiras dos jogadores exige licença (Lei 14.478) — alternativa:
      carteira do próprio jogador (WalletConnect) para a mainnet.

## 5. Economia (tokenomics)

- [x] **Economia no servidor**: milho, ovos, XP, níveis, prêmios de Arena/missões/liga/bônus só são
      creditados pelo servidor; o save do navegador não consegue aumentar nada disso
      (`src/game/economia.ts → economyViolation`). Pré-requisito nº 1 — sem isso qualquer um forja
      milho e saca em CORN.
- [ ] **Ralos > torneiras**: medir por dia o milho/ovos criados (Arena, bônus, missões, liga, apostas)
      contra o destruído (treino, comida, loja, taxa da Feira, cruzamento, estrelas). Painel no
      backoffice; meta: ralos ≥ torneiras.
- [ ] Limites da ponte calibrados pelo que um jogador honesto ganha por dia (não pelo que um bot
      consegue): `WEB3_DAILY_BRIDGE_CAP`; limite global diário da ponte (soma de todos) e mensal por conta.
- [ ] Atraso/carência na ponte de saída para contas novas (ex.: 7 dias) e para valores altos (revisão).
- [ ] Anti-bot na Arena: limites por minuto já existem; adicionar detecção de padrões (muitas lutas
      24h, muitas contas por dispositivo/IP) antes de abrir a ponte.
- [ ] Liquidez: não prometer preço; não fazer market making com dinheiro da empresa sem parecer.

## 6. Monitoramento

- [ ] Alertas: falhas da ponte (`web3_tx.status = failed` ou `burned-uncredited`), saldo de POL do
      operador, mint acima do esperado por hora, contas batendo o limite diário, recusas de save
      (`[save] recusado`) acima do normal.
- [ ] Reconciliação diária: soma dos saldos on-chain de CORN/EGG = soma das saídas − entradas da ponte
      em `web3_tx`.
- [ ] Logs de auditoria imutáveis das operações de backoffice (KYC, ajustes de saldo, configuração).

## 7. Plano de incidente

- [ ] Botão de emergência: desligar a camada web3 (tirar `WEB3_MAINNET_ACK`) e pausar os contratos pela
      multisig. Documentar quem pode apertar e em quanto tempo.
- [ ] Roteiro para chave vazada (rotacionar operador, revogar papel de minter pela multisig).
- [ ] Roteiro para exploit da economia (desligar a ponte, congelar contas, reverter saves, comunicar).
- [ ] Comunicação com jogadores e, se houver dados pessoais envolvidos, ANPD (LGPD, prazo de aviso).

## 8. Ligar

1. Deploy dos contratos na Polygon PoS com `scripts/deploy-contracts.mjs` (RPC da mainnet, operador
   temporário) e transferência de propriedade para a Safe.
2. `.env`: `WEB3_NETWORK=mainnet`, endereços dos contratos, `WEB3_USDC` vazio (USDC nativo),
   `KYC_PROVIDER=<provedor>`, limites, chaves vindas do KMS, e por último `WEB3_MAINNET_ACK=yes`.
3. Conferir no log que não aparece `[web3] MAINNET bloqueada` e testar com uma conta interna
   verificada: ponte de saída pequena, ponte de volta, envio externo, compra/venda de NFT em USDC.
4. Abrir para poucos jogadores (lista de permissão) antes de abrir para todos.
