// Monta o servidor do Discord do Galo Brigão: cargos, categorias, canais, permissões e mensagens fixas.
// Plano completo e passo a passo: docs/DISCORD.md
//
// Uso:
//   node scripts/discord-setup.mjs --dry-run                       (só mostra o que faria, sem token)
//   DISCORD_BOT_TOKEN=xxx DISCORD_GUILD_ID=123 node scripts/discord-setup.mjs
//   (opcional) GAME_URL=https://galobrigao.com.br
//
// É idempotente: o que já existe com o mesmo nome é mantido (não duplica nem apaga nada).
// O bot precisa estar no servidor com a permissão "Administrador" (só durante o setup; depois pode remover).

const API = 'https://discord.com/api/v10'
const DRY = process.argv.includes('--dry-run')
const TOKEN = process.env.DISCORD_BOT_TOKEN
const GUILD = process.env.DISCORD_GUILD_ID
const GAME_URL = (process.env.GAME_URL ?? 'https://galobrigao.com.br').replace(/\/$/, '')

if (!DRY && (!TOKEN || !GUILD)) {
  console.error('Faltam DISCORD_BOT_TOKEN e DISCORD_GUILD_ID (ou rode com --dry-run). Veja docs/DISCORD.md.')
  process.exit(1)
}

// ---------- Permissões (bits da API do Discord) ----------
const P = {
  ADMIN: 1n << 3n,
  KICK: 1n << 1n,
  BAN: 1n << 2n,
  MANAGE_CHANNELS: 1n << 4n,
  ADD_REACTIONS: 1n << 6n,
  VIEW: 1n << 10n,
  SEND: 1n << 11n,
  MANAGE_MESSAGES: 1n << 13n,
  EMBED: 1n << 14n,
  ATTACH: 1n << 15n,
  HISTORY: 1n << 16n,
  MENTION_EVERYONE: 1n << 17n,
  EXT_EMOJI: 1n << 18n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
  MUTE: 1n << 22n,
  MOVE: 1n << 24n,
  MANAGE_ROLES: 1n << 28n,
  MANAGE_THREADS: 1n << 34n,
  CREATE_THREADS: 1n << 35n,
  SEND_IN_THREADS: 1n << 38n,
  TIMEOUT: 1n << 40n,
}
const bits = (...ps) => ps.reduce((a, b) => a | b, 0n).toString()
const READ = [P.VIEW, P.HISTORY, P.ADD_REACTIONS]
const CHAT = [...READ, P.SEND, P.EMBED, P.ATTACH, P.EXT_EMOJI, P.CREATE_THREADS, P.SEND_IN_THREADS]
const MOD = [P.KICK, P.BAN, P.TIMEOUT, P.MANAGE_MESSAGES, P.MANAGE_THREADS, P.MUTE, P.MOVE]

// ---------- Cargos (de cima para baixo) ----------
const ROLES = [
  { key: 'equipe', name: '🛠️ Equipe', color: 0xff6d2a, hoist: true, perms: [...CHAT, ...MOD, P.MANAGE_CHANNELS, P.MANAGE_ROLES, P.MENTION_EVERYONE] },
  { key: 'mod', name: '🛡️ Moderação', color: 0x3b82f6, hoist: true, perms: [...CHAT, ...MOD] },
  { key: 'campeao', name: '🏆 Campeão', color: 0xf5c518, hoist: true, perms: [] },
  { key: 'testador', name: '🧪 Testador', color: 0x10b981, hoist: false, perms: [] },
  { key: 'whitelist', name: '🎟️ Whitelist', color: 0xa855f7, hoist: true, perms: [] },
  { key: 'criador', name: '🐓 Criador', color: 0xffb703, hoist: false, perms: [...CHAT, P.CONNECT, P.SPEAK] },
  { key: 'noticias', name: '🔔 Notícias', color: 0x94a3b8, hoist: false, perms: [], mentionable: true },
]

// ---------- Canais ----------
// access: 'public-read' (todos leem, só equipe escreve) · 'members' (só 🐓 Criador) · 'whitelist' · 'staff'
// type: 0 texto · 2 voz · 5 anúncios (precisa Comunidade; se falhar vira texto)
const CATEGORIES = [
  {
    name: '📌 INÍCIO',
    channels: [
      { name: '👋・boas-vindas', access: 'public-read', topic: 'Bem-vindo ao terreiro! Leia as regras e reaja para liberar o servidor.', post: 'welcome' },
      { name: '📜・regras', access: 'public-read', topic: 'Regras da comunidade. Quem entra aceita estas regras.', post: 'rules' },
      { name: '📢・anúncios', type: 5, access: 'public-read', topic: 'Novidades oficiais do Galo Brigão.' },
      { name: '🎟️・como-entrar', access: 'public-read', topic: 'O jogo está em acesso antecipado: só entra quem tem convite.', post: 'howto' },
      { name: '📄・white-paper', access: 'public-read', topic: 'O white paper do jogo: economia, NFTs, roadmap e riscos.', post: 'whitepaper' },
    ],
  },
  {
    name: '🐓 TERREIRO',
    channels: [
      { name: '💬・geral', access: 'members', topic: 'Papo livre sobre o jogo.' },
      { name: '📸・mostre-seu-galo', access: 'members', topic: 'Print do seu galo, skins e conquistas. Só imagem + comentário.' },
      { name: '🧠・dicas-e-estratégias', access: 'members', topic: 'Builds, ferramentas, cruzamentos e como subir na Liga.' },
      { name: '🏪・feira-e-trocas', access: 'members', topic: 'Anuncie trocas e vendas da Feira e do Mercado. Negócio fechado é dentro do jogo, nunca por fora.' },
      { name: '😂・memes', access: 'members', topic: 'Memes do terreiro (respeite as regras).' },
    ],
  },
  {
    name: '⚔️ ARENA',
    channels: [
      { name: '🤝・desafios-pvp', access: 'members', topic: 'Procure adversário para Desafios. Combine nível e aposta aqui, lute no jogo.' },
      { name: '🏟️・torneios', access: 'members', topic: 'Inscrições, chaves e resultados dos torneios.' },
      { name: '🏆・ranking', access: 'public-read', topic: 'Top da Liga semanal e campeões dos torneios.' },
    ],
  },
  {
    name: '🎟️ WHITELIST',
    channels: [
      { name: '🙋・pedir-convite', access: 'members', topic: 'Quer jogar? Conte por que e qual seu e-mail fica em DM com a equipe. Nunca poste e-mail aqui.', post: 'askinvite' },
      { name: '✅・whitelist', access: 'whitelist', topic: 'Área de quem já está no acesso antecipado: feedback e testes.' },
      { name: '🧪・testes', access: 'whitelist', topic: 'Recursos novos para testar antes de todo mundo.' },
    ],
  },
  {
    name: '🛟 SUPORTE',
    channels: [
      { name: '❓・ajuda', access: 'members', topic: 'Dúvidas sobre o jogo. A equipe NUNCA pede senha, seed phrase ou código por DM.' },
      { name: '🐞・bugs', access: 'members', topic: 'Achou um bug? Diga o que fez, o que esperava e mande print.' },
      { name: '💡・sugestões', access: 'members', topic: 'Ideias de raças, skins e modos. Vote com 👍/👎.' },
    ],
  },
  {
    name: '🔊 VOZ',
    channels: [
      { name: '🔊 Terreiro', type: 2, access: 'members' },
      { name: '🏟️ Torneio ao vivo', type: 2, access: 'members' },
    ],
  },
  {
    name: '🔒 EQUIPE',
    channels: [
      { name: '🛠️・equipe', access: 'staff', topic: 'Só equipe.' },
      { name: '🎟️・convites-pendentes', access: 'staff', topic: 'Pedidos de convite em análise. Gere os códigos em #/admin/convites no jogo.' },
      { name: '🚨・moderação-log', access: 'staff', topic: 'Registro de advertências, timeouts e bans.' },
    ],
  },
]

// ---------- Mensagens fixas ----------
const EMBED_COLOR = 0xff6d2a
const POSTS = {
  welcome: {
    embeds: [
      {
        title: '🐓 Bem-vindo ao Galo Brigão!',
        color: EMBED_COLOR,
        description: [
          'Aqui é o terreiro oficial do **Galo Brigão**, o jogo de criar, treinar e colocar galos de desenho para lutar.',
          '',
          '**Para liberar o servidor:**',
          '1. Leia as regras em **#📜・regras**',
          '2. Responda à pergunta da tela de entrada do Discord aceitando as regras',
          '3. Pronto: você ganha o cargo **🐓 Criador** e vê todos os canais',
          '',
          '**Ainda não joga?** O acesso está fechado, só por convite. Veja **#🎟️・como-entrar**.',
          '',
          `🎮 Jogo: ${GAME_URL}`,
        ].join('\n'),
      },
    ],
  },
  rules: {
    embeds: [
      {
        title: '📜 Regras do terreiro',
        color: EMBED_COLOR,
        description: [
          '**1. Respeito.** Sem ofensas, preconceito, assédio ou ameaça. Discordar pode, humilhar não.',
          '**2. Proibido maus-tratos a animais.** O jogo é desenho. Nada de foto, vídeo ou apologia de rinha real. Ban imediato.',
          '**3. Sem golpe.** A equipe **nunca** pede senha, seed phrase, chave privada ou código por DM. Quem pedir é golpista: denuncie.',
          '**4. Negócio é dentro do jogo.** Trocas e vendas só pela Feira ou pelo Mercado. Nada de "paga por fora", Pix ou envio direto.',
          '**5. Sem spam ou divulgação** de outros servidores, links encurtados ou referral.',
          '**6. Sem trapaça.** Bots, multicontas, exploits e venda de contas dão ban no jogo e aqui. Achou bug? **#🐞・bugs**.',
          '**7. Sem conselho financeiro.** NFTs e tokens são itens de jogo, sem promessa de valorização. Não prometa lucro a ninguém.',
          '**8. Conteúdo +18 e político-partidário fora.** Os galos de paródia são do jogo; debate político não.',
          '**9. Dados pessoais:** não poste e-mail, telefone, endereço ou documento (seu ou de outros).',
          '**10. Siga os** [Termos do Discord](https://discord.com/terms) **e os termos do jogo.**',
          '',
          'Punições: aviso → timeout → ban. A moderação pode agir direto em casos graves.',
          '',
          'Reaja com ✅ depois de ler.',
        ].join('\n'),
      },
    ],
    react: '✅',
  },
  howto: {
    embeds: [
      {
        title: '🎟️ Como entrar no jogo (acesso por convite)',
        color: EMBED_COLOR,
        description: [
          'O Galo Brigão está em **acesso antecipado**. Para criar conta você precisa de um **código de convite** (formato `GALO-XXXX-XXXX`).',
          '',
          '**3 jeitos de conseguir:**',
          '• **Um amigo que já joga:** cada jogador pode gerar convites em *Perfil → Convide amigos*.',
          '• **Aqui no Discord:** peça em **#🙋・pedir-convite**. Membros ativos e participantes dos eventos recebem convites.',
          '• **Eventos e sorteios** anunciados em **#📢・anúncios** (ative o cargo 🔔 Notícias).',
          '',
          '**Com o código em mãos:**',
          `1. Abra o link do convite (ou ${GAME_URL}/#/criar)`,
          '2. Preencha o código, nome de criador, e-mail e senha',
          '3. Confirme seu e-mail e escolha seu primeiro galo 🐓',
          '',
          '⚠️ Convite é pessoal e de uso único. **Não venda nem compre convites.**',
        ].join('\n'),
      },
    ],
  },
  askinvite: {
    content:
      '**Quer um convite?** Responda aqui com: seu nome de criador, há quanto tempo joga jogos do tipo e o que te chamou atenção no Galo Brigão. ' +
      'A equipe te chama na DM para pegar o e-mail (**nunca poste e-mail aqui**). Os convites saem em lotes.',
  },
  whitepaper: {
    embeds: [
      {
        title: '📄 White paper',
        color: EMBED_COLOR,
        description:
          'Economia, NFTs, tokens, whitelist, roadmap e riscos do Galo Brigão. NFTs e tokens são **itens de jogo**: não são investimento e não têm promessa de valorização.\n\n' +
          '🔗 (cole aqui o link público do white paper)',
      },
    ],
  },
}

// ---------- API ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function api(method, path, body) {
  if (DRY) return null
  for (;;) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (galo-setup, 1.0)' },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.status === 429) {
      const j = await res.json().catch(() => ({}))
      await sleep(((j.retry_after ?? 1) * 1000) | 0)
      continue
    }
    const text = await res.text()
    const data = text ? JSON.parse(text) : null
    if (!res.ok) {
      const err = new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`)
      err.status = res.status
      throw err
    }
    return data
  }
}

async function main() {
  console.log(DRY ? '🔎 Modo simulação (--dry-run): nada será criado.\n' : '🚀 Montando o servidor...\n')
  const guild = DRY ? { id: '@everyone', name: '(simulação)' } : await api('GET', `/guilds/${GUILD}`)
  console.log(`Servidor: ${guild.name}`)
  const everyoneId = DRY ? 'everyone' : guild.id
  const existingRoles = DRY ? [] : await api('GET', `/guilds/${GUILD}/roles`)
  const existingChannels = DRY ? [] : await api('GET', `/guilds/${GUILD}/channels`)

  // @everyone: sem permissões de conversa (só lê o que o canal liberar)
  await api('PATCH', `/guilds/${GUILD}/roles/${everyoneId}`, { permissions: bits(P.VIEW, P.HISTORY, P.ADD_REACTIONS) })
  console.log('• @everyone: só leitura nos canais públicos')

  const role = {}
  for (const r of ROLES) {
    const found = existingRoles.find((x) => x.name === r.name)
    if (found) {
      role[r.key] = found.id
      console.log(`= cargo ${r.name} (já existe)`)
      continue
    }
    const made = await api('POST', `/guilds/${GUILD}/roles`, { name: r.name, color: r.color, hoist: r.hoist, mentionable: !!r.mentionable, permissions: bits(...r.perms) })
    role[r.key] = made?.id ?? r.key
    console.log(`+ cargo ${r.name}`)
  }

  const staff = [role.equipe, role.mod]
  const allow = (id, ps) => ({ id, type: 0, allow: bits(...ps), deny: '0' })
  const deny = (id, ps) => ({ id, type: 0, allow: '0', deny: bits(...ps) })
  const overwrites = (access, voice) => {
    const talk = voice ? [P.VIEW, P.CONNECT, P.SPEAK] : CHAT
    switch (access) {
      case 'public-read':
        return [allow(everyoneId, READ), deny(everyoneId, [P.SEND, P.CREATE_THREADS]), ...staff.map((s) => allow(s, CHAT))]
      case 'members':
        return [deny(everyoneId, [P.VIEW]), allow(role.criador, talk), ...staff.map((s) => allow(s, talk))]
      case 'whitelist':
        return [deny(everyoneId, [P.VIEW]), allow(role.whitelist, talk), allow(role.testador, talk), ...staff.map((s) => allow(s, talk))]
      case 'staff':
        return [deny(everyoneId, [P.VIEW]), ...staff.map((s) => allow(s, talk))]
    }
    return []
  }

  for (const cat of CATEGORIES) {
    let catCh = existingChannels.find((c) => c.type === 4 && c.name === cat.name)
    if (catCh) console.log(`\n= categoria ${cat.name} (já existe)`)
    else {
      catCh = await api('POST', `/guilds/${GUILD}/channels`, { name: cat.name, type: 4 })
      console.log(`\n+ categoria ${cat.name}`)
    }
    for (const ch of cat.channels) {
      const type = ch.type ?? 0
      const voice = type === 2
      const exists = existingChannels.find((c) => c.name === ch.name && (c.parent_id === catCh?.id || !catCh))
      if (exists) {
        console.log(`  = #${ch.name} (já existe)`)
        continue
      }
      const body = { name: ch.name, type, parent_id: catCh?.id, topic: voice ? undefined : ch.topic, permission_overwrites: overwrites(ch.access, voice) }
      let made
      try {
        made = await api('POST', `/guilds/${GUILD}/channels`, body)
      } catch (e) {
        // Canal de anúncios exige "Comunidade" ligada: cria como texto comum
        if (type === 5) made = await api('POST', `/guilds/${GUILD}/channels`, { ...body, type: 0 })
        else throw e
      }
      console.log(`  + ${voice ? '🔊' : '#'}${ch.name}  [${ch.access}]`)
      const post = ch.post && POSTS[ch.post]
      if (post && made) {
        const msg = await api('POST', `/channels/${made.id}/messages`, { content: post.content, embeds: post.embeds })
        if (post.react && msg) await api('PUT', `/channels/${made.id}/messages/${msg.id}/reactions/${encodeURIComponent(post.react)}/@me`)
        if (msg) await api('PUT', `/channels/${made.id}/pins/${msg.id}`).catch(() => null)
        console.log(`    ✉️  mensagem fixada (${ch.post})`)
      } else if (post) console.log(`    ✉️  postaria a mensagem "${ch.post}"`)
    }
  }

  console.log('\n✅ Pronto. Próximos passos manuais (docs/DISCORD.md, seção 4):')
  console.log('   1. Ativar "Comunidade" e o "Onboarding" com as regras, dando o cargo 🐓 Criador a quem aceitar')
  console.log('   2. Dar a você mesmo o cargo 🛠️ Equipe')
  console.log('   3. AutoMod: bloquear links suspeitos e palavras de golpe (seed phrase, airdrop, etc.)')
  console.log('   4. Remover a permissão de Administrador do bot de setup (ou expulsá-lo)')
}

main().catch((e) => {
  console.error('\n❌', e.message)
  if (e.status === 403) console.error('   O bot precisa da permissão Administrador e o cargo dele precisa estar acima dos cargos criados.')
  process.exit(1)
})
