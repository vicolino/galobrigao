# Discord oficial do Galo Brigão

Plano do servidor e passo a passo para colocá-lo no ar. A estrutura (cargos, canais, permissões e mensagens
fixas) é criada pelo script [`scripts/discord-setup.mjs`](../scripts/discord-setup.mjs) em poucos segundos.

## 1. Objetivo

- Ser a **porta de entrada da whitelist**: quem não tem convite pede aqui; a equipe distribui códigos.
- Juntar a comunidade: dicas, prints de galos, desafios PvP, torneios ao vivo.
- Canal direto de **suporte, bugs e sugestões** durante o acesso antecipado.
- Anúncios oficiais (atualizações, Edições Limitadas, eventos).

## 2. Estrutura

### Cargos

| Cargo | Para quem | O que libera |
|---|---|---|
| 🛠️ **Equipe** | Fundadores e devs | Tudo + moderação + gerenciar canais/cargos |
| 🛡️ **Moderação** | Moderadores voluntários | Moderação (timeout, ban, apagar mensagens) |
| 🏆 **Campeão** | Vencedores de torneio / topo da Liga | Destaque na lista de membros |
| 🧪 **Testador** | Quem testa recursos novos | Canais da whitelist |
| 🎟️ **Whitelist** | Quem já tem conta no jogo (acesso antecipado) | `#whitelist` e `#testes` |
| 🐓 **Criador** | Todo membro que aceitou as regras | Todos os canais da comunidade e voz |
| 🔔 **Notícias** | Quem quer ser avisado | Recebe menção nos anúncios |

### Canais

| Categoria | Canais | Quem vê |
|---|---|---|
| 📌 **INÍCIO** | `boas-vindas` · `regras` · `anúncios` · `como-entrar` · `white-paper` | Todos (só leitura) |
| 🐓 **TERREIRO** | `geral` · `mostre-seu-galo` · `dicas-e-estratégias` · `feira-e-trocas` · `memes` | 🐓 Criador |
| ⚔️ **ARENA** | `desafios-pvp` · `torneios` · `ranking` (só leitura) | 🐓 Criador |
| 🎟️ **WHITELIST** | `pedir-convite` (Criador) · `whitelist` · `testes` | 🎟️ Whitelist / 🧪 Testador |
| 🛟 **SUPORTE** | `ajuda` · `bugs` · `sugestões` | 🐓 Criador |
| 🔊 **VOZ** | Terreiro · Torneio ao vivo | 🐓 Criador |
| 🔒 **EQUIPE** | `equipe` · `convites-pendentes` · `moderação-log` | Equipe e Moderação |

Mensagens fixadas pelo script: boas-vindas, as 10 regras, como conseguir convite, como pedir convite e o
white paper (troque o link).

## 3. Rodar o script

1. **Crie o servidor** no Discord (botão **+** → *Criar o meu* → *Para mim e meus amigos*). Nome sugerido:
   `Galo Brigão 🐓`. Use o avatar de [`marca/assets/avatar-instagram-1080.png`](../marca/assets/avatar-instagram-1080.png).
2. **Pegue o ID do servidor:** Configurações do usuário → Avançado → ligue *Modo desenvolvedor*. Depois clique com
   o botão direito no servidor → *Copiar ID do servidor*.
3. **Crie um bot de setup** em <https://discord.com/developers/applications> → *New Application* → *Bot* →
   *Reset Token* (copie o token e **não compartilhe**).
4. **Convide o bot** para o servidor: *OAuth2 → URL Generator* → escopo `bot` → permissão `Administrator` →
   abra a URL gerada e escolha o servidor.
5. **Simule** antes (não precisa de token):

   ```bash
   node scripts/discord-setup.mjs --dry-run
   ```

6. **Rode de verdade** (no PowerShell use `$env:DISCORD_BOT_TOKEN="..."` em vez do prefixo):

   ```bash
   DISCORD_BOT_TOKEN=seu_token DISCORD_GUILD_ID=id_do_servidor GAME_URL=https://galobrigao.com.br node scripts/discord-setup.mjs
   ```

   O script é idempotente: rodar de novo não duplica nada.

## 4. Ajustes manuais (5 minutos, no app do Discord)

1. **Comunidade:** Configurações do servidor → *Ativar Comunidade*. Escolha `#📜・regras` como canal de regras e
   `#📢・anúncios` como canal de atualizações. (Se o script criou `anúncios` como texto, converta-o para
   *Canal de anúncios* agora.)
2. **Onboarding (portão de entrada):** Configurações → *Onboarding*:
   - Canais padrão: os de 📌 INÍCIO.
   - Pergunta **obrigatória**: "Você leu e aceita as regras?" → resposta "Sim, aceito" **dá o cargo 🐓 Criador**.
   - Pergunta opcional: "Quer ser avisado das novidades?" → "Sim" dá 🔔 Notícias.
   - Pergunta opcional: "Você já joga o Galo Brigão?" → "Sim, tenho conta" dá 🎟️ Whitelist (a equipe confere depois).
3. **Seu cargo:** dê a você mesmo 🛠️ Equipe (e aos sócios).
4. **AutoMod** (Configurações → AutoMod):
   - Bloquear mensagens com: `seed phrase`, `frase de recuperação`, `chave privada`, `airdrop`, `free nft`,
     `mint now`, `vendo convite`, `compro convite`.
   - Bloquear spam de menções e links suspeitos; alertas em `#🚨・moderação-log`.
5. **Segurança:** nível de verificação **Médio** (e-mail verificado e conta com 5+ min) e 2FA obrigatória para a moderação.
6. **Bot de setup:** remova a permissão de Administrador ou expulse o bot.
7. **Convite permanente:** clique em *Convidar pessoas* → editar link → *Nunca expira*. Coloque o link em
   `DISCORD_URL` em [`src/brand.ts`](../src/brand.ts): ele passa a aparecer no cadastro do jogo, ao lado do campo de convite.

## 5. Fluxo da whitelist pelo Discord

```
Pessoa entra no Discord → aceita as regras (vira 🐓 Criador) → pede em #🙋・pedir-convite
   → equipe chama na DM e pega o e-mail → backoffice do jogo: #/admin/convites → "Por e-mail (nominal)"
   → o jogo envia o código por e-mail → a pessoa cria a conta → equipe dá o cargo 🎟️ Whitelist
```

- Para eventos e sorteios, gere um **lote** de códigos com nota (ex.: `discord-sorteio-dez`) e validade curta.
- Para influenciadores, um **código personalizado** com vários usos (ex.: `DISCORD-OG`, 50 usos) e a nota com o nome.
- Acompanhe em *Backoffice → 🎟️ Convites* quem usou cada código.

## 6. Rotina da moderação

| Quando | O quê |
|---|---|
| Todo dia | Responder `#ajuda` e `#pedir-convite`; triagem de `#bugs` |
| Toda semana | Post do ranking da Liga em `#🏆・ranking`; lote de convites para os mais ativos |
| A cada atualização | Post em `#📢・anúncios` mencionando 🔔 Notícias |
| A cada torneio | Chamada em `#🏟️・torneios` e transmissão no canal de voz *Torneio ao vivo* |

**Regra de ouro para a equipe:** nunca pedir senha, código, seed phrase ou pagamento por DM, e avisar isso sempre.

## 7. Próximos passos (opcional)

- **Bot próprio** ligado à API do jogo: comando `/convite` que gera um código para membros com tempo mínimo no
  servidor, cargo 🎟️ Whitelist automático ao vincular a conta, e post automático dos resultados dos torneios.
- Webhook de `#📢・anúncios` a partir do aviso do backoffice.
