# Galo Brigão — Roteiro para a conversa com o advogado

Este roteiro **não é parecer jurídico**. Ele reúne o que o jogo faz e as perguntas que precisam de resposta de um advogado (de preferência com experiência em games, direito do consumidor e LGPD) antes do lançamento.

## O que o jogo faz hoje

- Jogo web de navegador, para **maiores de 18 anos** (declaração no cadastro).
- Galos de **desenho animado** lutam em simulação. Nenhum animal real.
- Vende com dinheiro real (Pix e cartão, via Mercado Pago): moeda virtual (ovos de ouro), kits iniciais e assinatura mensal (Passe do Criador).
- Há **"apostas" com moeda virtual (milho)** em lutas simuladas. O milho pode ser obtido trocando ovos de ouro, que são comprados com dinheiro. **Não há saque nem prêmio em dinheiro ou bens.**
- Caixas surpresa (loot boxes) com as chances de cada raridade visíveis.
- Galos de "Edição Eleições" com apelidos de paródia (Barbudo Vermelho, Capitão Verde-Amarelo), sem nome nem imagem de pessoas reais.
- Limite de gasto mensal (padrão R$ 500; aumentar só vale após 24h), histórico de compras, exclusão de conta.

## Perguntas

### Apostas e jogos de azar
1. As apostas com moeda virtual, sem saque, mas com moeda que pode ser comprada indiretamente, podem ser enquadradas como jogo de azar (Decreto-Lei 3.688/41, art. 50) ou como aposta de quota fixa sem autorização (Lei 14.790/2023)?
2. É mais seguro **impedir que milho comprado com ovos seja usado em apostas** (ex.: separar "milho de aposta", ganho só jogando)?
3. As caixas surpresa precisam de algum cuidado adicional (há projetos de lei sobre loot boxes no Brasil)?

### Consumidor
4. A redação do direito de arrependimento (7 dias, art. 49 do CDC) para itens digitais já usados está adequada?
5. A assinatura mensal precisa de renovação automática com aviso prévio? (Hoje ela **não** renova sozinha.)
6. Os textos de oferta ("Mais vendido", "Melhor valor", preço riscado) estão corretos à luz do CDC (publicidade enganosa)?

### LGPD
7. Os modelos de **Termos de Uso** e **Política de Privacidade** (`src/pages/Legal.tsx`) cobrem o necessário? Falta indicar o encarregado (DPO)?
8. Prazo de guarda dos registros de pagamento após a exclusão da conta.
9. A verificação de idade por autodeclaração é suficiente para um jogo com compras?

### Marca e conteúdo
10. O tema de galos lutando (mesmo em desenho) pode gerar problema com a Lei 9.605/98 (maus-tratos) ou com políticas do Mercado Pago, Google Play e App Store?
11. Os galos de paródia política, em período eleitoral ou fora dele, podem ser vistos como propaganda eleitoral irregular (Lei 9.504/97) ou violar direito de imagem?
12. Registro da marca "Galo Brigão" no INPI e checagem de anterioridade.

### Empresa e impostos
13. Melhor enquadramento (CNAE e regime tributário) para venda de itens digitais em jogo.
14. Emissão de nota fiscal para cada compra (NFS-e) e como integrar isso ao fluxo de pagamento.

## Documentos para levar
- `docs/MONETIZACAO.md` (modelo de negócio e preços)
- Telas: cadastro, escolha do primeiro galo, checkout Pix, loja, apostas
- `src/pages/Legal.tsx` (termos e privacidade)
