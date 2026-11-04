import type { Accessory, Breed, Item, Rarity, Skin, Style, Tool } from './types'

export const BREEDS: Breed[] = [
  {
    id: 'caipira',
    name: 'Caipira',
    desc: 'Criado no quintal, come de tudo e nunca desiste.',
    rarity: 'comum',
    pattern: 'solido',
    colors: { body: '#c4622d', wing: '#9c4a1f', tail: '#1f2a24', tail2: '#2f6b4f', neck: '#e08a3c', comb: '#e23b3b', legs: '#e8b04a' },
    base: { hp: 100, atk: 14, def: 10, spd: 10 },
    price: 800,
  },
  {
    id: 'garnize',
    name: 'Garnizé',
    desc: 'Pequeno, marrento e rápido como um raio.',
    rarity: 'comum',
    pattern: 'solido',
    colors: { body: '#f1e3c6', wing: '#d9c39a', tail: '#3b3b3b', tail2: '#6b6b6b', neck: '#fff3dd', comb: '#ff4040', legs: '#f2c14e' },
    base: { hp: 82, atk: 12, def: 9, spd: 16 },
    price: 900,
  },
  {
    id: 'carijo',
    name: 'Carijó',
    desc: 'Plumagem listrada que confunde o adversário.',
    rarity: 'comum',
    pattern: 'carijo',
    colors: { body: '#d9d9d9', wing: '#9a9a9a', tail: '#2b2f36', tail2: '#3d6e74', neck: '#efefef', comb: '#e03131', legs: '#e8b04a' },
    base: { hp: 104, atk: 12, def: 13, spd: 10 },
    price: 1000,
  },
  {
    id: 'pescoco-pelado',
    name: 'Pescoço Pelado',
    desc: 'Feio que dói, mas aguenta pancada como ninguém.',
    rarity: 'raro',
    pattern: 'solido',
    colors: { body: '#2a2a2a', wing: '#1b1b1b', tail: '#121212', tail2: '#3a5a8c', neck: '#e46a6a', comb: '#d92b2b', legs: '#d8a24a' },
    base: { hp: 122, atk: 13, def: 15, spd: 8 },
    price: 2600,
  },
  {
    id: 'indio',
    name: 'Índio Gigante',
    desc: 'Alto, forte e com cara de poucos amigos.',
    rarity: 'raro',
    pattern: 'solido',
    colors: { body: '#7a3b1b', wing: '#5a2a12', tail: '#141414', tail2: '#2a4a3a', neck: '#b8642c', comb: '#c92a2a', legs: '#e3b14c' },
    base: { hp: 120, atk: 17, def: 12, spd: 9 },
    price: 3000,
  },
  {
    id: 'pintado',
    name: 'Pintadinho',
    desc: 'Cheio de bolinhas e de manhas.',
    rarity: 'raro',
    pattern: 'pintado',
    colors: { body: '#3d3d4a', wing: '#2b2b36', tail: '#1a1a22', tail2: '#5b5b74', neck: '#56566a', comb: '#e63946', legs: '#e7b24b' },
    base: { hp: 100, atk: 15, def: 11, spd: 14 },
    price: 2800,
  },
  {
    id: 'sedoso',
    name: 'Sedoso',
    desc: 'Parece um travesseiro. Bate como um martelo.',
    rarity: 'epico',
    pattern: 'solido',
    colors: { body: '#fafafa', wing: '#e8e8e8', tail: '#dcdcdc', tail2: '#c9c9c9', neck: '#ffffff', comb: '#7a2b54', legs: '#5a6a7a' },
    base: { hp: 112, atk: 17, def: 16, spd: 12 },
    price: 6500,
  },
  {
    id: 'aurora',
    name: 'Aurora',
    desc: 'Canta antes do sol nascer. Ninguém sabe como.',
    rarity: 'epico',
    pattern: 'dourado',
    colors: { body: '#e86a2e', wing: '#b8451c', tail: '#2c1b54', tail2: '#6a3cc0', neck: '#ffb347', comb: '#ff2f4f', legs: '#f2c14e' },
    base: { hp: 108, atk: 19, def: 12, spd: 15 },
    price: 7200,
  },
  {
    id: 'dourado',
    name: 'Galo de Ouro',
    desc: 'Lenda das feiras do interior. Brilha no escuro.',
    rarity: 'lendario',
    pattern: 'dourado',
    colors: { body: '#e3b23c', wing: '#c99a28', tail: '#d4a52c', tail2: '#f4d774', neck: '#f7d774', comb: '#e23b3b', legs: '#e3b23c' },
    base: { hp: 125, atk: 21, def: 17, spd: 15 },
    price: 18000,
  },
  {
    id: 'trovao',
    name: 'Trovão Azul',
    desc: 'Dizem que nasceu numa tempestade. Faz barulho de raio.',
    rarity: 'lendario',
    pattern: 'pintado',
    colors: { body: '#2e5aa8', wing: '#1f3f7a', tail: '#0f1d3a', tail2: '#44c4ff', neck: '#5d8fe0', comb: '#ffd23f', legs: '#c9d4e8' },
    base: { hp: 115, atk: 23, def: 14, spd: 18 },
    price: 20000,
  },
]

// Edição Eleições: os dois têm exatamente os mesmos atributos e preço.
const ELECTION_BASE = { hp: 118, atk: 19, def: 15, spd: 14 }
BREEDS.push(
  {
    id: 'lula',
    name: 'Barbudo Vermelho',
    desc: 'Barba grisalha, voz rouca e fôlego de sobra.',
    rarity: 'lendario',
    pattern: 'solido',
    special: true,
    colors: { body: '#d42a2a', wing: '#a51c1c', tail: '#7a1010', tail2: '#ff5a4a', neck: '#e04434', comb: '#ff3b3b', legs: '#e8b04a' },
    base: ELECTION_BASE,
    price: 99,
  },
  {
    id: 'bolsonaro',
    name: 'Capitão Verde-Amarelo',
    desc: 'Verde e amarelo da crista ao esporão.',
    rarity: 'lendario',
    pattern: 'solido',
    special: true,
    colors: { body: '#1f9d4a', wing: '#14783a', tail: '#ffd23f', tail2: '#1e4fa8', neck: '#2bb35a', comb: '#e23b3b', legs: '#e8b04a' },
    base: ELECTION_BASE,
    price: 99,
  },
)

// Galo Livre: grátis no cadastro, fraco e com potencial baixo (1 estrela).
BREEDS.push({
  id: 'livre',
  name: 'Galo Livre',
  desc: 'Veio da rua, magrelo e desconfiado. Com muita ração, quem sabe...',
  rarity: 'comum',
  pattern: 'solido',
  special: true,
  colors: { body: '#b8a98a', wing: '#9a8b6e', tail: '#5c5446', tail2: '#7a705c', neck: '#c9bb9c', comb: '#c94a4a', legs: '#c9a25a' },
  base: { hp: 72, atk: 9, def: 7, spd: 8 },
  price: 0,
})

export const ELECTION_ROOSTERS = [
  { breedId: 'lula', name: 'Barbudo Vermelho', emoji: '⭐' },
  { breedId: 'bolsonaro', name: 'Capitão Verde-Amarelo', emoji: '🇧🇷' },
]

export const BREED_BY_ID: Record<string, Breed> = Object.fromEntries(BREEDS.map((b) => [b.id, b]))

export const STYLES: Record<Style, { label: string; emoji: string; desc: string; special: string; mod: { atk: number; def: number; spd: number } }> = {
  agressivo: { label: 'Agressivo', emoji: '🔥', desc: 'Ataca sem parar, defende pouco.', special: 'Fúria Caipira', mod: { atk: 1.15, def: 0.9, spd: 1 } },
  defensivo: { label: 'Defensivo', emoji: '🛡️', desc: 'Segura pancada e contra-ataca.', special: 'Muralha de Penas', mod: { atk: 0.92, def: 1.2, spd: 0.95 } },
  equilibrado: { label: 'Equilibrado', emoji: '⚖️', desc: 'Um pouco de tudo, sem pontos fracos.', special: 'Canto da Vitória', mod: { atk: 1.03, def: 1.03, spd: 1.03 } },
  veloz: { label: 'Veloz', emoji: '💨', desc: 'Esquiva e bate primeiro.', special: 'Dança do Vento', mod: { atk: 0.97, def: 0.92, spd: 1.2 } },
}

export const RARITY: Record<Rarity, { label: string; color: string }> = {
  comum: { label: 'Comum', color: '#a8a29e' },
  raro: { label: 'Raro', color: '#4fa3ff' },
  epico: { label: 'Épico', color: '#b57bff' },
  lendario: { label: 'Lendário', color: '#ffb020' },
}

export const ACCESSORIES: Accessory[] = [
  // cabeça
  { id: 'bone', name: 'Boné de Aba Reta', slot: 'cabeca', emoji: '🧢', rarity: 'comum', price: 400, currency: 'milho', bonus: { spd: 1 }, desc: 'Estilo de quebrada.' },
  { id: 'chapeu-palha', name: 'Chapéu de Palha', slot: 'cabeca', emoji: '👒', rarity: 'comum', price: 450, currency: 'milho', bonus: { def: 1, hp: 4 }, desc: 'Direto da roça.' },
  { id: 'bandana', name: 'Bandana Ninja', slot: 'cabeca', emoji: '🥷', rarity: 'raro', price: 1400, currency: 'milho', bonus: { spd: 2, atk: 1 }, desc: 'Foco total.' },
  { id: 'cowboy', name: 'Chapéu de Peão', slot: 'cabeca', emoji: '🤠', rarity: 'raro', price: 1600, currency: 'milho', bonus: { atk: 2, hp: 6 }, desc: 'Segura, peão!' },
  { id: 'viking', name: 'Capacete Viking', slot: 'cabeca', emoji: '⛑️', rarity: 'epico', price: 60, currency: 'ovo', bonus: { def: 4, hp: 12 }, desc: 'Para os galos de Valhalla.' },
  { id: 'coroa', name: 'Coroa do Terreiro', slot: 'cabeca', emoji: '👑', rarity: 'lendario', price: 180, currency: 'ovo', bonus: { atk: 4, def: 3, hp: 15, spd: 2 }, desc: 'Só para o rei do galinheiro.' },
  // rosto
  { id: 'oculos', name: 'Óculos Escuros', slot: 'rosto', emoji: '🕶️', rarity: 'comum', price: 500, currency: 'milho', bonus: { spd: 1, atk: 1 }, desc: 'Muito descolado pra perder.' },
  { id: 'tapa-olho', name: 'Tapa-Olho Pirata', slot: 'rosto', emoji: '🏴‍☠️', rarity: 'raro', price: 1500, currency: 'milho', bonus: { atk: 3 }, desc: 'Arrr!' },
  { id: 'monoculo', name: 'Monóculo Chique', slot: 'rosto', emoji: '🧐', rarity: 'raro', price: 1700, currency: 'milho', bonus: { def: 2, spd: 1 }, desc: 'Analisa cada golpe.' },
  { id: 'visor', name: 'Visor Cibernético', slot: 'rosto', emoji: '🥽', rarity: 'epico', price: 70, currency: 'ovo', bonus: { atk: 3, spd: 3 }, desc: 'Mira assistida.' },
  { id: 'bigode', name: 'Bigodão de Respeito', slot: 'rosto', emoji: '🥸', rarity: 'comum', price: 350, currency: 'milho', bonus: { hp: 6 }, desc: 'Ninguém mexe com um galo de bigode.' },
  // corpo
  { id: 'cachecol', name: 'Cachecol do Time', slot: 'corpo', emoji: '🧣', rarity: 'comum', price: 450, currency: 'milho', bonus: { hp: 8 }, desc: 'Torcida organizada.' },
  { id: 'colete', name: 'Colete Acolchoado', slot: 'corpo', emoji: '🦺', rarity: 'raro', price: 1800, currency: 'milho', bonus: { def: 3, hp: 8 }, desc: 'Absorve as bicadas.' },
  { id: 'capa', name: 'Capa de Herói', slot: 'corpo', emoji: '🦸', rarity: 'epico', price: 80, currency: 'ovo', bonus: { spd: 3, atk: 2, hp: 8 }, desc: 'Nem todo herói usa capa. Esse usa.' },
  { id: 'cinturao', name: 'Cinturão de Campeão', slot: 'corpo', emoji: '🏆', rarity: 'lendario', price: 200, currency: 'ovo', bonus: { atk: 3, def: 4, hp: 20 }, desc: 'Peso de ouro na cintura.' },
  { id: 'gravata', name: 'Gravata Borboleta', slot: 'corpo', emoji: '🎀', rarity: 'comum', price: 380, currency: 'milho', bonus: { def: 1, spd: 1 }, desc: 'Elegância no ringue.' },
  // pés
  { id: 'tenis', name: 'Tênis de Corrida', slot: 'pes', emoji: '👟', rarity: 'comum', price: 500, currency: 'milho', bonus: { spd: 2 }, desc: 'Leve como uma pena.' },
  { id: 'botas', name: 'Botas de Couro', slot: 'pes', emoji: '🥾', rarity: 'raro', price: 1600, currency: 'milho', bonus: { def: 2, atk: 1 }, desc: 'Pisada firme.' },
  { id: 'patins', name: 'Patins Turbo', slot: 'pes', emoji: '🛼', rarity: 'epico', price: 65, currency: 'ovo', bonus: { spd: 5 }, desc: 'Vruuum.' },
  { id: 'chinelo', name: 'Chinelo da Vó', slot: 'pes', emoji: '🩴', rarity: 'lendario', price: 150, currency: 'ovo', bonus: { atk: 6, spd: 2 }, desc: 'Respeito instantâneo.' },
]

export const ACC_BY_ID: Record<string, Accessory> = Object.fromEntries(ACCESSORIES.map((a) => [a.id, a]))

export const SLOTS: Record<string, { label: string; emoji: string }> = {
  cabeca: { label: 'Cabeça', emoji: '🎩' },
  rosto: { label: 'Rosto', emoji: '😎' },
  corpo: { label: 'Corpo', emoji: '🦺' },
  pes: { label: 'Pés', emoji: '👟' },
}

export const ITEMS: Item[] = [
  { id: 'racao', name: 'Ração Turbinada', emoji: '🌽', price: 250, currency: 'milho', effect: 'energia', value: 40, desc: '+40 de energia para um galo.' },
  { id: 'racao-premium', name: 'Banquete do Rei', emoji: '🍗', price: 12, currency: 'ovo', effect: 'energia_total', value: 100, desc: 'Energia cheia na hora.' },
  { id: 'vitamina', name: 'Vitamina de Minhoca', emoji: '🪱', price: 600, currency: 'milho', effect: 'xp', value: 120, desc: '+120 XP para um galo.' },
  { id: 'livro', name: 'Manual do Campeão', emoji: '📕', price: 25, currency: 'ovo', effect: 'xp', value: 500, desc: '+500 XP. Leitura obrigatória.' },
  { id: 'trevo', name: 'Trevo de 4 Folhas', emoji: '🍀', price: 15, currency: 'ovo', effect: 'sorte', value: 3, desc: '+5% de crítico nas próximas 3 lutas.' },
]

export const ITEM_BY_ID: Record<string, Item> = Object.fromEntries(ITEMS.map((i) => [i.id, i]))

export const EGG_PACKS = [
  { id: 'p1', ovos: 50, bonus: 0, price: 4.9, tag: '' },
  { id: 'p2', ovos: 120, bonus: 10, price: 9.9, tag: '' },
  { id: 'p3', ovos: 300, bonus: 45, price: 22.9, tag: 'Mais vendido' },
  { id: 'p4', ovos: 700, bonus: 150, price: 49.9, tag: '' },
  { id: 'p5', ovos: 1600, bonus: 400, price: 99.9, tag: 'Melhor valor' },
]

export const VIP = { price: 19.9, days: 30, dailyOvos: 10, milhoBonus: 0.25 }

export const CORN_PACKS = [
  { id: 'c1', milho: 2000, ovos: 10 },
  { id: 'c2', milho: 11000, ovos: 50 },
  { id: 'c3', milho: 25000, ovos: 100 },
]

export const BOXES = [
  {
    id: 'caixa-comum',
    name: 'Caixa do Terreiro',
    emoji: '📦',
    price: 1200,
    currency: 'milho' as const,
    odds: { comum: 70, raro: 25, epico: 4.5, lendario: 0.5 },
  },
  {
    id: 'caixa-ouro',
    name: 'Baú de Ouro',
    emoji: '🎁',
    price: 40,
    currency: 'ovo' as const,
    odds: { comum: 20, raro: 50, epico: 25, lendario: 5 },
  },
]

export const ROOSTER_NAMES = [
  'Madrugada', 'Galo Cego', 'Tufão', 'Bicudo', 'Zé Pequeno', 'Esporão', 'Relâmpago', 'Cocoricó', 'Brutus', 'Pena Negra',
  'Faísca', 'Trovoada', 'Penacho', 'Capitão', 'Tornado', 'Marrento', 'Carcará', 'Pimenta', 'Sabiá Bravo', 'Rei do Milho',
  'Barão', 'Valente', 'Dom Galo', 'Tanajura', 'Coronel', 'Furacão', 'Gaguinho', 'Biscoito', 'Malandro', 'Torresmo',
  'Galileu', 'Galo Doido', 'Ventania', 'Pirulito', 'Chumbinho', 'Caçula', 'Bigorna', 'Fumaça', 'Jagunço', 'Xerife',
]

export const NPC_OWNERS = [
  'Seu Zé', 'Dona Cida', 'Tião do Sítio', 'Maria Galinha', 'Compadre Juca', 'Nhô Bento', 'Rosinha Brava', 'Mestre Tonho',
  'Dona Filó', 'Zé do Milho', 'Chico Bento', 'Lurdinha', 'Tonhão', 'Vó Nina',
]

export const AVATARS = ['🧑‍🌾', '👩‍🌾', '🤠', '🧔', '👵', '👴', '🦹', '🧙']

export const LEAGUE_TIERS = [
  { name: 'Bronze', emoji: '🥉', min: 0, reward: { milho: 1000, ovo: 5 } },
  { name: 'Prata', emoji: '🥈', min: 300, reward: { milho: 2500, ovo: 15 } },
  { name: 'Ouro', emoji: '🥇', min: 800, reward: { milho: 5000, ovo: 30 } },
  { name: 'Diamante', emoji: '💎', min: 1600, reward: { milho: 10000, ovo: 60 } },
  { name: 'Lenda do Terreiro', emoji: '🐓', min: 3000, reward: { milho: 25000, ovo: 150 } },
]

export const ACHIEVEMENTS = [
  { id: 'primeira-vitoria', name: 'Primeiro Cocoricó', desc: 'Vença sua primeira luta.', emoji: '🐣' },
  { id: '10-vitorias', name: 'Galo de Briga', desc: 'Vença 10 lutas.', emoji: '🥊' },
  { id: '50-vitorias', name: 'Lenda Viva', desc: 'Vença 50 lutas.', emoji: '🏅' },
  { id: 'primeiro-ko', name: 'Nocaute!', desc: 'Vença por K.O.', emoji: '💥' },
  { id: 'apostador', name: 'Palpiteiro', desc: 'Faça 10 apostas.', emoji: '🎲' },
  { id: 'zebra', name: 'Deu Zebra', desc: 'Ganhe uma aposta com odd acima de 3.0.', emoji: '🦓' },
  { id: 'colecionador', name: 'Galinheiro Cheio', desc: 'Tenha 5 galos.', emoji: '🏠' },
  { id: 'fashion', name: 'Galo Fashion', desc: 'Equipe 4 acessórios em um galo.', emoji: '💅' },
  { id: 'nivel-10', name: 'Veterano', desc: 'Leve um galo ao nível 10.', emoji: '⭐' },
  { id: 'lendario', name: 'Toque de Midas', desc: 'Tenha um galo lendário.', emoji: '✨' },
  { id: 'caixas', name: 'Caçador de Tesouro', desc: 'Abra 10 caixas.', emoji: '🎁' },
  { id: 'estiloso', name: 'Estiloso', desc: 'Tenha 3 skins.', emoji: '🎨' },
  { id: 'estrategista', name: 'Estrategista', desc: 'Vença uma luta usando 2 ferramentas.', emoji: '🧠' },
  { id: 'rico', name: 'Barão do Milho', desc: 'Junte 50.000 de milho.', emoji: '🌽' },
]

export const TITLES = [
  { min: 0, name: 'Criador Novato' },
  { min: 5, name: 'Criador Zeloso' },
  { min: 20, name: 'Criador Respeitado' },
  { min: 50, name: 'Mestre do Terreiro' },
  { min: 120, name: 'Lenda do Interior' },
]

// ---------- Skins (visual, compradas uma vez e usadas em qualquer galo) ----------
const C = (body: string, wing: string, tail: string, tail2: string, neck: string, comb: string, legs: string) => ({ body, wing, tail, tail2, neck, comb, legs })

export const SKINS: Skin[] = [
  { id: 'malhado', name: 'Malhado de Fazenda', emoji: '🐄', rarity: 'comum', price: 2500, currency: 'milho', fx: 'malhado', colors: C('#f2efe8', '#e2ddd2', '#1d1d1d', '#3a3a3a', '#f7f4ee', '#d93636', '#e8b04a'), desc: 'Cresceu no pasto e acha que é boi.' },
  { id: 'melancia', name: 'Melancia Brava', emoji: '🍉', rarity: 'comum', price: 3000, currency: 'milho', fx: 'melancia', colors: C('#3f8f3a', '#e5484d', '#2c6b28', '#5fb357', '#58a650', '#1f5c1b', '#d9b44a'), desc: 'Doce por fora, azedo na briga.' },
  { id: 'camuflado', name: 'Comando Camuflado', emoji: '🪖', rarity: 'raro', price: 6000, currency: 'milho', fx: 'camuflado', colors: C('#5b6b3a', '#43512a', '#2d351c', '#6f7f45', '#6a7b44', '#a33a2a', '#b89a5a'), desc: 'Ninguém vê ele chegando.' },
  { id: 'zumbi', name: 'Galo Zumbi', emoji: '🧟', rarity: 'raro', price: 45, currency: 'ovo', fx: 'zumbi', colors: C('#7d9a6a', '#5f7a52', '#3c4a34', '#6b7f5c', '#8fae7b', '#6b2a3a', '#9aa67a'), desc: 'Já perdeu uma luta. Voltou pra cobrar.' },
  { id: 'fantasma', name: 'Assombração', emoji: '👻', rarity: 'raro', price: 50, currency: 'ovo', fx: 'fantasma', colors: C('#e9e6ff', '#cfc9f5', '#b9b2ec', '#ddd8ff', '#f4f2ff', '#9b8cff', '#cfc9f5'), desc: 'Bica de outro mundo.' },
  { id: 'sombra', name: 'Sombra Noturna', emoji: '🌑', rarity: 'epico', price: 85, currency: 'ovo', fx: 'sombra', colors: C('#1b1b22', '#111117', '#0a0a0e', '#3b1f5c', '#26262f', '#b3122e', '#3a3a44'), desc: 'Olhos vermelhos no escuro do terreiro.' },
  { id: 'neon', name: 'Neon Cyberpunk', emoji: '🌃', rarity: 'epico', price: 90, currency: 'ovo', fx: 'neon', colors: C('#16121f', '#1f1830', '#ff2fd0', '#22e5ff', '#1c1628', '#ff2fd0', '#22e5ff'), desc: 'Brilha mais que o letreiro do bar.' },
  { id: 'gelo', name: 'Galo de Gelo', emoji: '🧊', rarity: 'epico', price: 90, currency: 'ovo', fx: 'gelo', colors: C('#bfe6ff', '#8cc9f2', '#5aa7e0', '#e8f7ff', '#d9f1ff', '#3d8fd6', '#a7d3f0'), desc: 'Sangue frio. Literalmente.' },
  { id: 'robo', name: 'Galo-Robô T-800', emoji: '🤖', rarity: 'epico', price: 110, currency: 'ovo', fx: 'robo', colors: C('#9aa3ad', '#6f7882', '#4b535c', '#c2c9d0', '#b0b8c0', '#e5484d', '#5d656e'), desc: 'Eu voltarei. Pra bicar.' },
  { id: 'arcoiris', name: 'Arco-Íris Furioso', emoji: '🌈', rarity: 'epico', price: 120, currency: 'ovo', fx: 'arcoiris', colors: C('#ff5e62', '#ffb347', '#4fa3ff', '#b57bff', '#ffd23f', '#ff2f4f', '#ffd23f'), desc: 'Colorido e com raiva de tudo.' },
  { id: 'lava', name: 'Magma Vulcânico', emoji: '🌋', rarity: 'lendario', price: 200, currency: 'ovo', fx: 'lava', colors: C('#2a1410', '#3a1a12', '#ff5a1f', '#ffb020', '#331811', '#ff3b1f', '#4a2216'), desc: 'Rachaduras de lava pelo corpo.' },
  { id: 'fogo', name: 'Fênix de Fogo', emoji: '🔥', rarity: 'lendario', price: 220, currency: 'ovo', fx: 'fogo', colors: C('#ff6a1f', '#e2401a', '#ffb020', '#ff3b1f', '#ff9a2f', '#ffe14a', '#ffb020'), desc: 'Renasce das cinzas a cada luta.' },
  { id: 'galaxia', name: 'Galáxia Sideral', emoji: '🌌', rarity: 'lendario', price: 250, currency: 'ovo', fx: 'galaxia', colors: C('#2a1a5e', '#1b1142', '#120b30', '#6a3cc0', '#3a2a78', '#ff4fd8', '#8a7ad8'), desc: 'Carrega o universo nas penas.' },
  { id: 'ouro', name: 'Ouro Maciço 24k', emoji: '💰', rarity: 'lendario', price: 300, currency: 'ovo', fx: 'ouro', colors: C('#f5c542', '#d9a520', '#c48f12', '#ffe07a', '#ffd75e', '#ffef9a', '#d9a520'), desc: 'Vale mais que a fazenda inteira.' },
]
export const SKIN_BY_ID: Record<string, Skin> = Object.fromEntries(SKINS.map((s) => [s.id, s]))

export const SKIN_BUNDLES = [
  { id: 'elementos', name: 'Pacote Elementos', emoji: '⚡', skins: ['fogo', 'gelo', 'lava'], price: 380, desc: 'Fogo, gelo e magma juntos.' },
  { id: 'trevas', name: 'Pacote Trevas', emoji: '🦇', skins: ['sombra', 'zumbi', 'fantasma'], price: 135, desc: 'Para quem gosta de assustar o adversário.' },
  { id: 'futuro', name: 'Pacote Futuro', emoji: '🚀', skins: ['neon', 'robo', 'galaxia'], price: 340, desc: 'Direto do ano 3000.' },
]

// ---------- Ferramentas de luta (consumidas ao lutar) ----------
export const TOOLS: Tool[] = [
  { id: 'energetico', name: 'Energético de Milho', emoji: '🥤', rarity: 'comum', price: 300, currency: 'milho', effect: 'atk', value: 0.15, desc: '+15% de ataque durante a luta.' },
  { id: 'escudo', name: 'Escudo de Couro', emoji: '🛡️', rarity: 'comum', price: 350, currency: 'milho', effect: 'def', value: 0.2, desc: 'Recebe 20% menos dano.' },
  { id: 'apito', name: 'Apito do Treinador', emoji: '📯', rarity: 'comum', price: 250, currency: 'milho', effect: 'sta', value: 0.5, desc: 'Recupera 50% mais fôlego e começa com fôlego extra.' },
  { id: 'curativo', name: 'Kit Curativo', emoji: '🩹', rarity: 'raro', price: 500, currency: 'milho', effect: 'cura', value: 0.3, desc: 'Cura 30% da vida quando ficar abaixo de 30% (1x).' },
  { id: 'espelho', name: 'Espelho Hipnótico', emoji: '🪞', rarity: 'raro', price: 600, currency: 'milho', effect: 'esquiva', value: 0.12, desc: '+12% de chance de esquiva.' },
  { id: 'pimenta', name: 'Pimenta Malagueta', emoji: '🌶️', rarity: 'raro', price: 6, currency: 'ovo', effect: 'especial', value: 1, desc: 'Golpe especial liberado desde o início e mais forte.' },
  { id: 'amuleto', name: 'Amuleto Olho Grego', emoji: '🧿', rarity: 'epico', price: 8, currency: 'ovo', effect: 'critico', value: 0.12, desc: '+12% de chance de golpe crítico.' },
  { id: 'banda', name: 'Banda do Terreiro', emoji: '🥁', rarity: 'epico', price: 12, currency: 'ovo', effect: 'tudo', value: 0.08, desc: 'A torcida empurra: +8% em todos os atributos.' },
  { id: 'fenix', name: 'Pena de Fênix', emoji: '🪶', rarity: 'lendario', price: 20, currency: 'ovo', effect: 'fenix', value: 0.35, desc: 'Ao levar K.O., levanta com 35% da vida (1x).' },
]
export const TOOL_BY_ID: Record<string, Tool> = Object.fromEntries(TOOLS.map((t) => [t.id, t]))
export const MAX_TOOLS = 2

export const TOOL_KITS = [
  { id: 'kit-basico', name: 'Kit Iniciante', emoji: '🧰', tools: { energetico: 3, escudo: 3, apito: 3 }, price: 2200, currency: 'milho' as const, desc: '9 ferramentas comuns com 20% de desconto.' },
  { id: 'kit-pro', name: 'Kit Profissional', emoji: '💼', tools: { curativo: 3, espelho: 3, pimenta: 3, amuleto: 2 }, price: 40, currency: 'ovo' as const, desc: 'Ferramentas raras e épicas para lutas difíceis.' },
  { id: 'kit-campeao', name: 'Kit Campeão', emoji: '🏆', tools: { banda: 3, fenix: 2, amuleto: 3, curativo: 3 }, price: 75, currency: 'ovo' as const, desc: 'Tudo que um campeão leva para a arena.' },
]
