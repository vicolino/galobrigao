# Galo Brigão — White Paper

**Versão 0.1 (rascunho) · novembro de 2026**

> **Aviso importante.** Este documento descreve um **jogo**. Os tokens e NFTs do Galo Brigão são **itens de jogo**:
> não são investimento, não dão participação nos lucros, não dão direito a dividendos e **não há promessa de
> valorização**. Nada aqui é oferta de valores mobiliários nem recomendação financeira. A camada on-chain roda hoje
> na **testnet** (Polygon Amoy), onde os ativos não têm valor. A mainnet só será ligada depois dos itens jurídicos de
> [`MAINNET-CHECKLIST.md`](MAINNET-CHECKLIST.md). Regras e números podem mudar; a versão mais nova deste documento vale.

---

## Sumário

1. [Resumo](#1-resumo)
2. [O problema](#2-o-problema)
3. [A solução: o jogo](#3-a-solução-o-jogo)
4. [Ativos digitais](#4-ativos-digitais)
5. [Economia (tokenomics)](#5-economia-tokenomics)
6. [Acesso: whitelist por convite](#6-acesso-whitelist-por-convite)
7. [Tecnologia](#7-tecnologia)
8. [Segurança e anti-fraude](#8-segurança-e-anti-fraude)
9. [Governança e comunidade](#9-governança-e-comunidade)
10. [Roadmap](#10-roadmap)
11. [Jurídico e conformidade](#11-jurídico-e-conformidade)
12. [Riscos](#12-riscos)
13. [Equipe e contato](#13-equipe-e-contato)
14. [Glossário](#14-glossário)

---

## 1. Resumo

**Galo Brigão** (fora do Brasil, *Chicken Fighter*) é um jogo de navegador em que o jogador cria, treina, veste,
cruza e coloca para lutar **galos de desenho animado**. As lutas são simuladas; nenhum animal real está envolvido.

O jogo é **divertido primeiro e cripto depois**: dá para jogar tudo sem carteira. Para quem quiser, os galos raros,
skins de edição limitada e itens viram **NFTs** de verdade (ERC-721 na Polygon), que o jogador pode guardar ou
negociar por **USDC** num mercado on-chain. As moedas do jogo têm versões em token (ERC-20) por meio de uma
**ponte** controlada.

| | |
|---|---|
| Gênero | Criação de bichinhos + luta por turnos simulada (web, celular e computador) |
| Rede | Polygon PoS (hoje: testnet Amoy) |
| NFTs | `GameItems` (ERC-721): galos, skins, acessórios, ferramentas |
| Tokens | 🌽 **CORN** (milho) e 🥚 **EGG** (ovo de ouro), ERC-20 sem casas decimais |
| Moeda de troca | **USDC** nativo da Circle |
| Taxa do mercado | 10% (teto fixo no contrato: 20%) |
| Venda de token (ICO/pré-venda) | **Não há** |
| Acesso | Fechado, por convite (whitelist) durante o acesso antecipado |

## 2. O problema

Jogos "play-to-earn" da geração 2021–2022 mostraram três falhas que queremos evitar:

1. **Economia que só fica de pé com gente nova entrando.** Quando o jogo paga mais do que retira, o token desaba
   e leva o jogo junto.
2. **Jogo chato, investimento no centro.** O jogador vira "funcionário" farmando token; quando o preço cai, ele sai.
3. **Fraude e bots.** Recompensas emitidas pelo cliente e cadastros em massa drenam a economia.

Do outro lado, jogos tradicionais com itens pagos não deixam o jogador ser **dono** do que comprou ou conquistou:
não dá para vender, dar de presente nem levar para fora.

## 3. A solução: o jogo

### 3.1 Ciclo principal

```
Criar/comprar galo → Treinar e equipar → Lutar (Arena, Desafios, Torneios) → Ganhar milho, ovos, XP e drops
        ↑                                                                                   │
        └──────────── Cruzar, evoluir estrelas, comprar skins/ferramentas ←─────────────────┘
```

### 3.2 Modos

| Modo | O que é |
|---|---|
| 🏠 **Galinheiro** | Os galos do jogador: treino, alimentação, 4 espaços de acessório, skins, renomear, vender |
| ⚔️ **Arena (Rinha)** | Luta contra a casa em 4 dificuldades (fácil, médio, difícil, chefão), com chance de vitória visível |
| 🤝 **Desafios (PvP)** | Desafia galos de jogadores online de nível parecido (±1). O servidor simula e paga os dois |
| 🏟️ **Torneios** | Chaves com inscrição e premiação, transmitidas ao vivo |
| 🥚 **Cruzamento** | Dois galos geram um ovo que choca um filhote com genes dos pais |
| 🏪 **Feira** | Troca e venda entre jogadores dentro do jogo (milho/ovos), com taxa |
| 🏠 **Aluguel** | Alugar o galo para outro jogador lutar |
| 🎲 **Apostas** | Palpites em lutas da casa usando **🎟️ fichas**, que não se compram, não se trocam e não saem do jogo |
| 🎯 Missões, 🏆 Liga, 🎫 Passe | Retenção: 5 missões diárias, temporada semanal com 5 divisões, passe de temporada |

### 3.3 Princípios de design

- **Justo com quem não paga.** Um jogador ativo ganha cerca de 33 🥚 por dia jogando e consegue uma skin épica
  em 3 a 4 dias ([`MONETIZACAO.md`](MONETIZACAO.md), seção 3).
- **Cosmético e consumível, não "pague para ganhar" puro.** Skins não mexem nos atributos; ferramentas de luta
  são gastas a cada uso.
- **Tudo que vale passa pelo servidor.** O navegador só mostra; quem calcula lutas, prêmios e saldos é o servidor.

## 4. Ativos digitais

### 4.1 NFTs — contrato `GameItems` (ERC-721)

Cada NFT guarda o **tipo** (`kind`) e o **id do item** (`itemId`). Os tipos:

| Tipo | Exemplos | Como nasce |
|---|---|---|
| **Galo NFT** | Galo com raça, estrelas, nível, genes, histórico de cruzamentos | O jogador "tokeniza" um galo elegível (ver abaixo) |
| **Skin rara** | Coleção *Raros* (Ouro, Neon, Galáxia, Dragão...) | **Edições Limitadas** lançadas pela equipe, com tiragem fixa |
| **Acessório / ferramenta** | Itens épicos e lendários | Drops da Arena e loja |

**Regras de escassez do Galo NFT** (`src/game/galonft.ts`):

- O **Galo Livre** do cadastro **nunca** vira NFT (evita farm de contas).
- Pode virar NFT quem: nasceu de **cruzamento**; é **edição especial**; veio de **kit pago**; ou chegou ao **nível 10**.
- Cada galo cruza **no máximo 7 vezes na vida**. O custo sobe a cada cruzamento (×1; ×1,5; ×2; ×3; ×4; ×6; ×8).
  Galo "virgem" vale mais (+15%); esgotado, um pouco menos (−5%).
- **Drops** épicos e lendários têm tiragem máxima por item (padrão: 500 cópias).

Os **metadados** e a **imagem** de cada NFT são servidos pelo jogo (`/api/nft/...`), desenhados a partir da ficha do
galo. Um NFT não pode ser alugado, chocar ovo ou ir para a Feira enquanto está na carteira: para usar no jogo,
traz-se de volta.

### 4.2 Tokens — contrato `GameToken` (ERC-20)

| Token | No jogo | Casas decimais | Emissão |
|---|---|---|---|
| 🌽 **CORN** | Milho: moeda comum, ganha jogando | 0 (1 token = 1 milho) | Só pela **ponte de saída** |
| 🥚 **EGG** | Ovo de ouro: moeda premium | 0 (1 token = 1 ovo) | Só pela **ponte de saída** |

- **Não existe pré-mineração, reserva da equipe, pré-venda ou vesting**: um token só passa a existir quando um
  jogador move milho/ovos que **já tinha no jogo** para a carteira (o jogo debita e o contrato emite).
- A **ponte de entrada** faz o caminho inverso: o contrato queima e o jogo credita.
- Limites diários por jogador na ponte de saída (padrão: 🥚 5.000 e 🌽 200.000 por dia).
- Na mainnet, a ponte de saída só abre para conta com **KYC verificado**.

### 4.3 Mercado on-chain — contrato `Market`

- O jogador lista um NFT por um preço em **USDC**; o comprador paga e recebe o NFT na mesma transação.
- **Taxa de 10%** sobre a venda vai para a tesouraria do jogo. O contrato tem um **teto fixo de 20%**: nem a equipe
  consegue cobrar acima disso.
- O contrato usa proteção contra reentrância e emite eventos públicos (`Listed`, `Sold`, `Cancelled`).

### 4.4 Carteira

Cada conta recebe uma **carteira custodial** criada pelo jogo, para quem nunca usou cripto. O jogador pode enviar
seus NFTs, tokens e USDC para uma carteira própria (com limites diários).

## 5. Economia (tokenomics)

### 5.1 As quatro moedas

| Moeda | Para que serve | Como entra | Como sai (sumidouros) | Sai do jogo? |
|---|---|---|---|---|
| 🌽 **Milho** | Comida, mercado de galos, caixas, treino | Lutas, missões, bônus diário, Liga | Loja, cruzamento, comida, taxa da Feira | Sim, como **CORN** (ponte, KYC) |
| 🥚 **Ovo de ouro** | Skins, estrelas, edições raras, ferramentas | Compras em USDC, depósito de USDC, missões, bônus, vitórias difíceis | Loja, evolução, edições, taxas | Sim, como **EGG** (ponte, KYC) |
| 🎟️ **Fichas** | Só apostas | Bônus diário, vitórias na Arena | Apostas perdidas | **Nunca** |
| 💵 **USDC** | Comprar na loja; comprar/vender NFTs | Carteira do jogador | Loja, Market | É o dólar digital da Circle |

**Separação proposital:** as apostas usam só fichas, que não se compram e não saem do jogo. Assim nada que tenha
valor fora do jogo entra ou sai das apostas.

### 5.2 Torneiras e sumidouros

A saúde da economia depende de quanto se **emite** (torneiras) versus quanto se **retira** (sumidouros). O jogo mede
os dois em tempo real (Backoffice → Carteira → Emissão) e tem controles que valem na hora, sem nova versão:

| Controle | Efeito |
|---|---|
| Teto diário de milho da Arena (padrão 100.000) | Acima dele a luta rende só 15% do milho |
| Multiplicador de custo em milho da loja | >1 retira mais milho de circulação |
| Multiplicador da troca ovo → milho | <1 diminui a torneira de milho |
| Limite de ovos e milho grátis por dia | Teto de ganho diário por conta |
| Tiragem máxima de drops raros | Escassez real dos itens épicos/lendários |
| Limite de cruzamentos por galo (7) | Escassez de galos novos |

### 5.3 Receita do jogo

1. **Loja em USDC**: pacotes de ovos, kits iniciais e Passe do Criador.
2. **Depósito de USDC → ovos** (só ida; padrão 50 🥚 por 1 USDC, mínimo 1 USDC, teto diário 500 USDC).
3. **Taxa do Market** (10% das vendas de NFT) e taxas internas (Feira, Desafios).
4. **Edições Limitadas** vendidas em ovos.

A receita paga servidores, desenvolvimento e prêmios de torneios. **Ela não é repartida com quem tem tokens ou NFTs.**

### 5.4 Por que isso não é "play-to-earn"

- Não há recompensa garantida em dinheiro por jogar.
- Os tokens não são vendidos pela equipe: só existem quando um jogador move o que ganhou jogando.
- Os limites diários e o KYC impedem que bots e farms de contas drenem a economia.
- O preço de um NFT no Market é decidido entre jogadores; a equipe não recompra nem sustenta preço.

## 6. Acesso: whitelist por convite

Durante o **acesso antecipado**, o cadastro é **fechado**: só cria conta quem tem um **código de convite** válido.

| Origem do convite | Regras |
|---|---|
| **Equipe** (backoffice) | Lotes de códigos com limite de usos e validade; ou convites **nominais**, presos a um e-mail, enviados por e-mail |
| **Jogadores** | Cada jogador com e-mail confirmado gera até **3 convites** de 1 uso (ajustável) |
| **Comunidade (Discord)** | Códigos de campanha distribuídos em eventos e para membros ativos do servidor |

Por quê:

- **Qualidade da comunidade** e feedback antes da abertura ao público.
- **Economia protegida**: cadastros em massa ficam caros sem convite, e cada conta tem rastreio de quem convidou.
- **Escala controlada** do servidor e do suporte.

Quem já tem conta continua entrando normalmente. A whitelist pode ser desligada no backoffice quando o jogo abrir.
Nas **Edições Limitadas** de NFT, a equipe poderá reservar uma janela de compra antecipada para membros da
whitelist (ex.: primeiros 24 h), sempre ao mesmo preço do público.

## 7. Tecnologia

| Camada | Tecnologia |
|---|---|
| Cliente | React 18 + TypeScript + Vite (PWA de navegador) |
| Servidor | Node.js 22, HTTP próprio, SQLite (WAL) |
| Lutas | Motor determinístico compartilhado (`src/game/engine.ts`): o servidor simula e o cliente só anima |
| Blockchain | Polygon PoS · contratos Solidity 0.8.28 com OpenZeppelin 5.1 · `viem` no servidor |
| Contratos | `GameItems` (ERC-721 + AccessControl), `GameToken` (ERC-20 + AccessControl), `Market` (Ownable + ReentrancyGuard) |
| Infra | Google Cloud, proxy Caddy, backups ([`DEPLOY.md`](DEPLOY.md)) |
| Idiomas | Português e inglês |

**Papéis on-chain:** só a carteira **operadora** do jogo pode emitir e queimar (ponte) e criar NFTs. A meta para a
mainnet é que os papéis de administrador fiquem numa **multisig** e que os contratos sejam **auditados e verificados**
no Polygonscan.

## 8. Segurança e anti-fraude

- **Servidor como fonte da verdade**: milho, XP, prêmios e drops só são creditados pelo servidor.
- **Limites** por conta e por IP: cadastros, logins, compras, ponte, envios, drops por dia.
- **E-mail confirmado** antes de liberar créditos de boas-vindas e convites.
- **Whitelist** com rastreio de quem convidou quem.
- **KYC/AML** obrigatório para a ponte de saída na mainnet (aprovação manual proibida no código).
- **Travas da mainnet**: o servidor se recusa a ligar a camada web3 na mainnet sem as confirmações de
  `MAINNET-CHECKLIST.md`.
- **Limite de gasto mensal** por jogador, com aumento que só vale após 24 h.
- Revisão de segurança do código: [`SECURITY-REVIEW.md`](../SECURITY-REVIEW.md).

## 9. Governança e comunidade

- O jogo é operado pela empresa responsável (ver seção 13). **Os tokens não dão voto** nem direito sobre a empresa.
- A comunidade participa pelo **Discord oficial** ([`DISCORD.md`](DISCORD.md)): sugestões, votações não vinculantes
  sobre novas raças/skins, testes de recursos e eventos.
- Mudanças de economia são anunciadas com antecedência no Discord e no aviso do jogo.

## 10. Roadmap

As datas são metas, não promessas.

| Fase | Período | Entregas |
|---|---|---|
| **0 — Fundação** ✅ | 2026 | Jogo completo, economia no servidor, backoffice, contratos na testnet, loja em USDC, i18n PT/EN |
| **1 — Acesso antecipado** | T4 2026 – T1 2027 | **Whitelist por convite**, Discord oficial, balanceamento com jogadores reais, primeiros torneios |
| **2 — Preparação da mainnet** | T1 – T2 2027 | Parecer jurídico, provedor de KYC integrado, auditoria externa dos contratos, multisig |
| **3 — Mainnet** | T2 – T3 2027 | NFTs e Market na Polygon PoS, primeiras Edições Limitadas, ponte com limites |
| **4 — Abertura** | T3 2027 em diante | Fim da whitelist, app em lojas (avaliar políticas), temporadas, ligas competitivas |

## 11. Jurídico e conformidade

- **Brasil:** enquadramento perante a CVM (Parecer de Orientação 40/2022) e a Lei 14.478/2022 (ativos virtuais);
  apostas usam fichas sem valor para ficar fora da Lei 14.790/2023 e do art. 50 do Decreto-Lei 3.688/41; LGPD.
- **União Europeia:** o regulamento **MiCA** exige white paper para a oferta pública de cripto-ativos, e a exceção
  para NFTs é interpretada de forma estreita (coleções em série podem não se enquadrar como "únicas"). Antes de
  oferecer no bloco, este documento será revisado para o formato do Anexo I do MiCA ou o acesso será bloqueado.
- **EUA e outros:** avaliação de risco de *security* (teste de Howey), leis estaduais e sanções; bloqueio por
  região onde não houver parecer.
- Público: **maiores de 18 anos**.

Detalhes e perguntas em aberto: [`JURIDICO.md`](JURIDICO.md) e [`MAINNET-CHECKLIST.md`](MAINNET-CHECKLIST.md).

## 12. Riscos

Quem usa a camada cripto precisa conhecer estes riscos:

- **Preço:** NFTs e tokens podem valer **zero**. O valor é decidido entre jogadores.
- **Regulatório:** leis podem mudar e obrigar a restringir, mudar ou encerrar recursos em alguns países.
- **Técnico:** falhas em contratos, na rede Polygon, no USDC ou na carteira podem causar perda. Transações on-chain
  são **irreversíveis**.
- **Custódia:** a carteira custodial depende da segurança do jogo; mover para carteira própria passa a
  responsabilidade ao jogador.
- **Economia:** mudanças de balanceamento podem alterar a utilidade de itens.
- **Continuidade:** se o jogo encerrar, os NFTs continuam na blockchain, mas podem perder a utilidade dentro do jogo.

## 13. Equipe e contato

- Empresa: **Galo Brigão Jogos Digitais LTDA** *(razão social e CNPJ a preencher)*
- Suporte: suporte@galobrigao.com.br *(a confirmar)*
- Discord: *(link do convite, ver [`DISCORD.md`](DISCORD.md))*
- Equipe e conselheiros: *(a preencher: nome, função e experiência de cada um)*

## 14. Glossário

| Termo | Significado |
|---|---|
| **NFT** | Token não fungível: um certificado único na blockchain de que você é dono de um item |
| **ERC-721 / ERC-20** | Padrões de NFT e de token comum na rede Ethereum/Polygon |
| **USDC** | Dólar digital emitido pela Circle (1 USDC ≈ 1 dólar) |
| **Ponte** | Mover milho/ovos do jogo para a carteira como token (saída) ou de volta (entrada) |
| **Whitelist** | Lista de quem pode entrar: no Galo Brigão, quem tem um código de convite |
| **Mint** | Criar um NFT ou token na blockchain |
| **KYC** | Verificação de identidade (documento e selfie) |
| **Multisig** | Carteira que só movimenta com a assinatura de várias pessoas |
| **Torneira / sumidouro** | Fontes que criam moeda / gastos que retiram moeda da economia |

---

### Referências usadas na pesquisa

- Estrutura de white papers de NFT e jogos blockchain: [Udonis](https://www.blog.udonis.co/blockchain/write-whitepaper-blockchain-game),
  [Meegle](https://www.meegle.com/en_us/topics/nft/nft-whitepapers), [Amy Suto](https://www.amysuto.com/desk-of-amy-suto/how-to-write-a-whitepaper-for-web3-project),
  exemplos públicos como [Fishing Frenzy](https://games.gg/news/fishing-frenzy-reveals-whitepaper/) e [Wild Forest](https://gam3s.gg/news/wild-forest-revamped-whitepaper).
- MiCA e NFTs: [CoinDesk (2022)](https://coindesk-coindesk-prod.cdn.arcpublishing.com/policy/2022/08/10/nft-collections-will-be-regulated-like-cryptocurrencies-under-eus-mica-law-official-says/),
  [Mondaq — categorias de token no MiCA](https://www.mondaq.com/fin-tech/1723344/mica-token-categories-a-practical-refresher),
  [DLA Piper](https://www.dlapiper.com/en/insights/publications/2025/01/articleeu-crypto-assets-regulatory-framework).
- Números do jogo: código-fonte deste repositório (`contracts/`, `src/game/config.ts`, `src/game/galonft.ts`, `server/web3.ts`) e [`MONETIZACAO.md`](MONETIZACAO.md).
