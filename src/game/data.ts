import { lang, locale, t } from '../i18n'
import { NPC_OWNERS_EN, NPC_OWNERS_PT, ROOSTER_NAMES_EN, ROOSTER_NAMES_PT } from './names'
import type { Accessory, Breed, Item, Rarity, Skin, Style, Tool } from './types'

export const BREEDS: Breed[] = [
  {
    id: 'caipira',
    name: t('Caipira'),
    desc: t('Criado no quintal, come de tudo e nunca desiste.'),
    rarity: 'comum',
    pattern: 'solido',
    colors: { body: '#c4622d', wing: '#9c4a1f', tail: '#1f2a24', tail2: '#2f6b4f', neck: '#e08a3c', comb: '#e23b3b', legs: '#e8b04a' },
    base: { hp: 100, atk: 14, def: 10, spd: 10 },
    price: 800,
  },
  {
    id: 'garnize',
    name: t('Garnizé'),
    desc: t('Pequeno, marrento e rápido como um raio.'),
    rarity: 'comum',
    pattern: 'solido',
    colors: { body: '#f1e3c6', wing: '#d9c39a', tail: '#3b3b3b', tail2: '#6b6b6b', neck: '#fff3dd', comb: '#ff4040', legs: '#f2c14e' },
    base: { hp: 82, atk: 12, def: 9, spd: 16 },
    price: 900,
  },
  {
    id: 'carijo',
    name: t('Carijó'),
    desc: t('Plumagem listrada que confunde o adversário.'),
    rarity: 'comum',
    pattern: 'carijo',
    colors: { body: '#d9d9d9', wing: '#9a9a9a', tail: '#2b2f36', tail2: '#3d6e74', neck: '#efefef', comb: '#e03131', legs: '#e8b04a' },
    base: { hp: 104, atk: 12, def: 13, spd: 10 },
    price: 1000,
  },
  {
    id: 'pescoco-pelado',
    name: t('Pescoço Pelado'),
    desc: t('Feio que dói, mas aguenta pancada como ninguém.'),
    rarity: 'raro',
    pattern: 'solido',
    colors: { body: '#2a2a2a', wing: '#1b1b1b', tail: '#121212', tail2: '#3a5a8c', neck: '#e46a6a', comb: '#d92b2b', legs: '#d8a24a' },
    base: { hp: 122, atk: 13, def: 15, spd: 8 },
    price: 2600,
  },
  {
    id: 'indio',
    name: t('Índio Gigante'),
    desc: t('Alto, forte e com cara de poucos amigos.'),
    rarity: 'raro',
    pattern: 'solido',
    colors: { body: '#7a3b1b', wing: '#5a2a12', tail: '#141414', tail2: '#2a4a3a', neck: '#b8642c', comb: '#c92a2a', legs: '#e3b14c' },
    base: { hp: 120, atk: 17, def: 12, spd: 9 },
    price: 3000,
  },
  {
    id: 'pintado',
    name: t('Pintadinho'),
    desc: t('Cheio de bolinhas e de manhas.'),
    rarity: 'raro',
    pattern: 'pintado',
    colors: { body: '#3d3d4a', wing: '#2b2b36', tail: '#1a1a22', tail2: '#5b5b74', neck: '#56566a', comb: '#e63946', legs: '#e7b24b' },
    base: { hp: 100, atk: 15, def: 11, spd: 14 },
    price: 2800,
  },
  {
    id: 'sedoso',
    name: t('Sedoso'),
    desc: t('Parece um travesseiro. Bate como um martelo.'),
    rarity: 'epico',
    pattern: 'solido',
    colors: { body: '#fafafa', wing: '#e8e8e8', tail: '#dcdcdc', tail2: '#c9c9c9', neck: '#ffffff', comb: '#7a2b54', legs: '#5a6a7a' },
    base: { hp: 112, atk: 17, def: 16, spd: 12 },
    price: 6500,
  },
  {
    id: 'aurora',
    name: t('Aurora'),
    desc: t('Canta antes do sol nascer. Ninguém sabe como.'),
    rarity: 'epico',
    pattern: 'dourado',
    colors: { body: '#e86a2e', wing: '#b8451c', tail: '#2c1b54', tail2: '#6a3cc0', neck: '#ffb347', comb: '#ff2f4f', legs: '#f2c14e' },
    base: { hp: 108, atk: 19, def: 12, spd: 15 },
    price: 7200,
  },
  {
    id: 'dourado',
    name: t('Galo de Ouro'),
    desc: t('Lenda das feiras do interior. Brilha no escuro.'),
    rarity: 'lendario',
    pattern: 'dourado',
    colors: { body: '#e3b23c', wing: '#c99a28', tail: '#d4a52c', tail2: '#f4d774', neck: '#f7d774', comb: '#e23b3b', legs: '#e3b23c' },
    base: { hp: 125, atk: 21, def: 17, spd: 15 },
    price: 18000,
  },
  {
    id: 'trovao',
    name: t('Trovão Azul'),
    desc: t('Dizem que nasceu numa tempestade. Faz barulho de raio.'),
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
    name: t('Barbudo Vermelho'),
    desc: t('Barba grisalha, voz rouca e fôlego de sobra.'),
    rarity: 'lendario',
    pattern: 'solido',
    special: true,
    colors: { body: '#d42a2a', wing: '#a51c1c', tail: '#7a1010', tail2: '#ff5a4a', neck: '#e04434', comb: '#ff3b3b', legs: '#e8b04a' },
    base: ELECTION_BASE,
    price: 99,
  },
  {
    id: 'bolsonaro',
    name: t('Capitão Verde-Amarelo'),
    desc: t('Verde e amarelo da crista ao esporão.'),
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
  name: t('Galo Livre'),
  desc: t('Veio da rua, magrelo e desconfiado. Com muita ração, quem sabe...'),
  rarity: 'comum',
  pattern: 'solido',
  special: true,
  colors: { body: '#b8a98a', wing: '#9a8b6e', tail: '#5c5446', tail2: '#7a705c', neck: '#c9bb9c', comb: '#c94a4a', legs: '#c9a25a' },
  base: { hp: 72, atk: 9, def: 7, spd: 8 },
  price: 0,
})

export const ELECTION_ROOSTERS = [
  { breedId: 'lula', name: t('Barbudo Vermelho'), emoji: '⭐' },
  { breedId: 'bolsonaro', name: t('Capitão Verde-Amarelo'), emoji: '🇧🇷' },
]

export const BREED_BY_ID: Record<string, Breed> = Object.fromEntries(BREEDS.map((b) => [b.id, b]))

export const STYLES: Record<Style, { label: string; emoji: string; desc: string; special: string; mod: { atk: number; def: number; spd: number } }> = {
  agressivo: { label: t('Agressivo'), emoji: '🔥', desc: t('Ataca sem parar, defende pouco.'), special: t('Fúria Caipira'), mod: { atk: 1.15, def: 0.9, spd: 1 } },
  defensivo: { label: t('Defensivo'), emoji: '🛡️', desc: t('Segura pancada e contra-ataca.'), special: t('Muralha de Penas'), mod: { atk: 0.92, def: 1.2, spd: 0.95 } },
  equilibrado: { label: t('Equilibrado'), emoji: '⚖️', desc: t('Um pouco de tudo, sem pontos fracos.'), special: t('Canto da Vitória'), mod: { atk: 1.03, def: 1.03, spd: 1.03 } },
  veloz: { label: t('Veloz'), emoji: '💨', desc: t('Esquiva e bate primeiro.'), special: t('Dança do Vento'), mod: { atk: 0.97, def: 0.92, spd: 1.2 } },
}

export const RARITY: Record<Rarity, { label: string; color: string }> = {
  comum: { label: t('Comum'), color: '#a8a29e' },
  raro: { label: t('Raro'), color: '#4fa3ff' },
  epico: { label: t('Épico'), color: '#b57bff' },
  lendario: { label: t('Lendário'), color: '#ffb020' },
}

export const ACCESSORIES: Accessory[] = [
  // cabeça
  { id: 'bone', name: t('Boné de Aba Reta'), slot: 'cabeca', emoji: '🧢', rarity: 'comum', price: 400, currency: 'milho', bonus: { spd: 1 }, desc: t('Estilo de quebrada.') },
  { id: 'chapeu-palha', name: t('Chapéu de Palha'), slot: 'cabeca', emoji: '👒', rarity: 'comum', price: 450, currency: 'milho', bonus: { def: 1, hp: 4 }, desc: t('Direto da roça.') },
  { id: 'bandana', name: t('Bandana Ninja'), slot: 'cabeca', emoji: '🥷', rarity: 'raro', price: 1400, currency: 'milho', bonus: { spd: 2, atk: 1 }, desc: t('Foco total.') },
  { id: 'cowboy', name: t('Chapéu de Peão'), slot: 'cabeca', emoji: '🤠', rarity: 'raro', price: 1600, currency: 'milho', bonus: { atk: 2, hp: 6 }, desc: t('Segura, peão!') },
  { id: 'viking', name: t('Capacete Viking'), slot: 'cabeca', emoji: '⛑️', rarity: 'epico', price: 60, currency: 'ovo', bonus: { def: 4, hp: 12 }, desc: t('Para os galos de Valhalla.') },
  { id: 'coroa', name: t('Coroa do Terreiro'), slot: 'cabeca', emoji: '👑', rarity: 'lendario', price: 180, currency: 'ovo', bonus: { atk: 4, def: 3, hp: 15, spd: 2 }, desc: t('Só para o rei do galinheiro.') },
  // rosto
  { id: 'oculos', name: t('Óculos Escuros'), slot: 'rosto', emoji: '🕶️', rarity: 'comum', price: 500, currency: 'milho', bonus: { spd: 1, atk: 1 }, desc: t('Muito descolado pra perder.') },
  { id: 'tapa-olho', name: t('Tapa-Olho Pirata'), slot: 'rosto', emoji: '🏴‍☠️', rarity: 'raro', price: 1500, currency: 'milho', bonus: { atk: 3 }, desc: t('Arrr!') },
  { id: 'monoculo', name: t('Monóculo Chique'), slot: 'rosto', emoji: '🧐', rarity: 'raro', price: 1700, currency: 'milho', bonus: { def: 2, spd: 1 }, desc: t('Analisa cada golpe.') },
  { id: 'visor', name: t('Visor Cibernético'), slot: 'rosto', emoji: '🥽', rarity: 'epico', price: 70, currency: 'ovo', bonus: { atk: 3, spd: 3 }, desc: t('Mira assistida.') },
  { id: 'bigode', name: t('Bigodão de Respeito'), slot: 'rosto', emoji: '🥸', rarity: 'comum', price: 350, currency: 'milho', bonus: { hp: 6 }, desc: t('Ninguém mexe com um galo de bigode.') },
  // corpo
  { id: 'cachecol', name: t('Cachecol do Time'), slot: 'corpo', emoji: '🧣', rarity: 'comum', price: 450, currency: 'milho', bonus: { hp: 8 }, desc: t('Torcida organizada.') },
  { id: 'colete', name: t('Colete Acolchoado'), slot: 'corpo', emoji: '🦺', rarity: 'raro', price: 1800, currency: 'milho', bonus: { def: 3, hp: 8 }, desc: t('Absorve as bicadas.') },
  { id: 'capa', name: t('Capa de Herói'), slot: 'corpo', emoji: '🦸', rarity: 'epico', price: 80, currency: 'ovo', bonus: { spd: 3, atk: 2, hp: 8 }, desc: t('Nem todo herói usa capa. Esse usa.') },
  { id: 'cinturao', name: t('Cinturão de Campeão'), slot: 'corpo', emoji: '🏆', rarity: 'lendario', price: 200, currency: 'ovo', bonus: { atk: 3, def: 4, hp: 20 }, desc: t('Peso de ouro na cintura.') },
  { id: 'gravata', name: t('Gravata Borboleta'), slot: 'corpo', emoji: '🎀', rarity: 'comum', price: 380, currency: 'milho', bonus: { def: 1, spd: 1 }, desc: t('Elegância no ringue.') },
  // pés
  { id: 'tenis', name: t('Tênis de Corrida'), slot: 'pes', emoji: '👟', rarity: 'comum', price: 500, currency: 'milho', bonus: { spd: 2 }, desc: t('Leve como uma pena.') },
  { id: 'botas', name: t('Botas de Couro'), slot: 'pes', emoji: '🥾', rarity: 'raro', price: 1600, currency: 'milho', bonus: { def: 2, atk: 1 }, desc: t('Pisada firme.') },
  { id: 'patins', name: t('Patins Turbo'), slot: 'pes', emoji: '🛼', rarity: 'epico', price: 65, currency: 'ovo', bonus: { spd: 5 }, desc: t('Vruuum.') },
  { id: 'chinelo', name: t('Chinelo da Vó'), slot: 'pes', emoji: '🩴', rarity: 'lendario', price: 150, currency: 'ovo', bonus: { atk: 6, spd: 2 }, desc: t('Respeito instantâneo.') },
]

export const ACC_BY_ID: Record<string, Accessory> = Object.fromEntries(ACCESSORIES.map((a) => [a.id, a]))

export const SLOTS: Record<string, { label: string; emoji: string }> = {
  cabeca: { label: t('Cabeça'), emoji: '🎩' },
  rosto: { label: t('Rosto'), emoji: '😎' },
  corpo: { label: t('Corpo'), emoji: '🦺' },
  pes: { label: t('Pés'), emoji: '👟' },
}

export const ITEMS: Item[] = [
  { id: 'racao', name: t('Ração Turbinada'), emoji: '🌽', price: 250, currency: 'milho', effect: 'energia', value: 40, desc: t('+{n} de energia para um galo.', { n: 40 }) },
  { id: 'racao-premium', name: t('Banquete do Rei'), emoji: '🍗', price: 12, currency: 'ovo', effect: 'energia_total', value: 100, desc: t('Energia cheia na hora.') },
  { id: 'vitamina', name: t('Vitamina de Minhoca'), emoji: '🪱', price: 600, currency: 'milho', effect: 'xp', value: 120, desc: t('+{n} XP para um galo.', { n: 120 }) },
  { id: 'livro', name: t('Manual do Campeão'), emoji: '📕', price: 25, currency: 'ovo', effect: 'xp', value: 500, desc: t('+{n} XP. Leitura obrigatória.', { n: 500 }) },
  { id: 'trevo', name: t('Trevo de 4 Folhas'), emoji: '🍀', price: 15, currency: 'ovo', effect: 'sorte', value: 3, desc: t('+{p}% de crítico nas próximas {n} lutas.', { p: 5, n: 3 }) },
]

export const ITEM_BY_ID: Record<string, Item> = Object.fromEntries(ITEMS.map((i) => [i.id, i]))

export const EGG_PACKS = [
  { id: 'p1', ovos: 50, bonus: 0, price: 4.9, tag: '' },
  { id: 'p2', ovos: 120, bonus: 10, price: 9.9, tag: '' },
  { id: 'p3', ovos: 300, bonus: 45, price: 22.9, tag: t('Mais vendido') },
  { id: 'p4', ovos: 700, bonus: 150, price: 49.9, tag: '' },
  { id: 'p5', ovos: 1600, bonus: 400, price: 99.9, tag: t('Melhor valor') },
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
    name: t('Caixa do Terreiro'),
    emoji: '📦',
    price: 1200,
    currency: 'milho' as const,
    odds: { comum: 70, raro: 25, epico: 4.5, lendario: 0.5 },
  },
  {
    id: 'caixa-ouro',
    name: t('Baú de Ouro'),
    emoji: '🎁',
    price: 40,
    currency: 'ovo' as const,
    odds: { comum: 20, raro: 50, epico: 25, lendario: 5 },
  },
]

// Funções (não constantes) para o servidor poder gerar nomes no idioma do jogador com withLang()
export const roosterNames = () => (lang() === 'en' ? ROOSTER_NAMES_EN : ROOSTER_NAMES_PT)
export const npcOwners = () => (lang() === 'en' ? NPC_OWNERS_EN : NPC_OWNERS_PT)

export const AVATARS = ['🧑‍🌾', '👩‍🌾', '🤠', '🧔', '👵', '👴', '🦹', '🧙']

export const LEAGUE_TIERS = [
  { name: 'Bronze', label: t('Bronze'), emoji: '🥉', min: 0, reward: { milho: 1000, ovo: 5 } },
  { name: 'Prata', label: t('Prata'), emoji: '🥈', min: 300, reward: { milho: 2500, ovo: 15 } },
  { name: 'Ouro', label: t('Ouro'), emoji: '🥇', min: 800, reward: { milho: 5000, ovo: 30 } },
  { name: 'Diamante', label: t('Diamante'), emoji: '💎', min: 1600, reward: { milho: 10000, ovo: 60 } },
  { name: 'Lenda do Terreiro', label: t('Lenda do Terreiro'), emoji: '🐓', min: 3000, reward: { milho: 25000, ovo: 150 } },
]

export const ACHIEVEMENTS = [
  { id: 'primeira-vitoria', name: t('Primeiro Cocoricó'), desc: t('Vença sua primeira luta.'), emoji: '🐣' },
  { id: '10-vitorias', name: t('Galo de Briga'), desc: t('Vença {n} lutas.', { n: 10 }), emoji: '🥊' },
  { id: '50-vitorias', name: t('Lenda Viva'), desc: t('Vença {n} lutas.', { n: 50 }), emoji: '🏅' },
  { id: 'primeiro-ko', name: t('Nocaute!'), desc: t('Vença por K.O.'), emoji: '💥' },
  { id: 'apostador', name: t('Palpiteiro'), desc: t('Faça {n} apostas.', { n: 10 }), emoji: '🎲' },
  { id: 'zebra', name: t('Deu Zebra'), desc: t('Ganhe uma aposta com odd acima de {n}.', { n: (3).toLocaleString(locale(), { minimumFractionDigits: 1 }) }), emoji: '🦓' },
  { id: 'colecionador', name: t('Galinheiro Cheio'), desc: t('Tenha {n} galos.', { n: 5 }), emoji: '🏠' },
  { id: 'fashion', name: t('Galo Fashion'), desc: t('Equipe {n} acessórios em um galo.', { n: 4 }), emoji: '💅' },
  { id: 'nivel-10', name: t('Veterano'), desc: t('Leve um galo ao nível {n}.', { n: 10 }), emoji: '⭐' },
  { id: 'lendario', name: t('Toque de Midas'), desc: t('Tenha um galo lendário.'), emoji: '✨' },
  { id: 'caixas', name: t('Caçador de Tesouro'), desc: t('Abra {n} caixas.', { n: 10 }), emoji: '🎁' },
  { id: 'estiloso', name: t('Estiloso'), desc: t('Tenha {n} skins.', { n: 3 }), emoji: '🎨' },
  { id: 'estrategista', name: t('Estrategista'), desc: t('Vença uma luta usando {n} ferramentas.', { n: 2 }), emoji: '🧠' },
  { id: 'rico', name: t('Barão do Milho'), desc: t('Junte {n} de milho.', { n: (50000).toLocaleString(locale()) }), emoji: '🌽' },
]

export const TITLES = [
  { min: 0, name: t('Criador Novato') },
  { min: 5, name: t('Criador Zeloso') },
  { min: 20, name: t('Criador Respeitado') },
  { min: 50, name: t('Mestre do Terreiro') },
  { min: 120, name: t('Lenda do Interior') },
]

// ---------- Skins (visual, compradas uma vez e usadas em qualquer galo) ----------
const C = (body: string, wing: string, tail: string, tail2: string, neck: string, comb: string, legs: string) => ({ body, wing, tail, tail2, neck, comb, legs })

export const SKINS: Skin[] = [
  { id: 'malhado', name: t('Malhado de Fazenda'), emoji: '🐄', rarity: 'comum', price: 2500, currency: 'milho', fx: 'malhado', colors: C('#f2efe8', '#e2ddd2', '#1d1d1d', '#3a3a3a', '#f7f4ee', '#d93636', '#e8b04a'), desc: t('Cresceu no pasto e acha que é boi.') },
  { id: 'melancia', name: t('Melancia Brava'), emoji: '🍉', rarity: 'comum', price: 3000, currency: 'milho', fx: 'melancia', colors: C('#3f8f3a', '#e5484d', '#2c6b28', '#5fb357', '#58a650', '#1f5c1b', '#d9b44a'), desc: t('Doce por fora, azedo na briga.') },
  { id: 'camuflado', name: t('Comando Camuflado'), emoji: '🪖', rarity: 'raro', price: 6000, currency: 'milho', fx: 'camuflado', colors: C('#5b6b3a', '#43512a', '#2d351c', '#6f7f45', '#6a7b44', '#a33a2a', '#b89a5a'), desc: t('Ninguém vê ele chegando.') },
  { id: 'zumbi', name: t('Galo Zumbi'), emoji: '🧟', rarity: 'raro', price: 45, currency: 'ovo', fx: 'zumbi', colors: C('#7d9a6a', '#5f7a52', '#3c4a34', '#6b7f5c', '#8fae7b', '#6b2a3a', '#9aa67a'), desc: t('Já perdeu uma luta. Voltou pra cobrar.') },
  { id: 'fantasma', name: t('Assombração'), emoji: '👻', rarity: 'raro', price: 50, currency: 'ovo', fx: 'fantasma', colors: C('#e9e6ff', '#cfc9f5', '#b9b2ec', '#ddd8ff', '#f4f2ff', '#9b8cff', '#cfc9f5'), desc: t('Bica de outro mundo.') },
  { id: 'sombra', name: t('Sombra Noturna'), emoji: '🌑', rarity: 'epico', price: 85, currency: 'ovo', fx: 'sombra', colors: C('#1b1b22', '#111117', '#0a0a0e', '#3b1f5c', '#26262f', '#b3122e', '#3a3a44'), desc: t('Olhos vermelhos no escuro do terreiro.') },
  { id: 'neon', name: t('Neon Cyberpunk'), emoji: '🌃', rarity: 'epico', price: 90, currency: 'ovo', fx: 'neon', colors: C('#16121f', '#1f1830', '#ff2fd0', '#22e5ff', '#1c1628', '#ff2fd0', '#22e5ff'), desc: t('Brilha mais que o letreiro do bar.') },
  { id: 'gelo', name: t('Galo de Gelo'), emoji: '🧊', rarity: 'epico', price: 90, currency: 'ovo', fx: 'gelo', colors: C('#bfe6ff', '#8cc9f2', '#5aa7e0', '#e8f7ff', '#d9f1ff', '#3d8fd6', '#a7d3f0'), desc: t('Sangue frio. Literalmente.') },
  { id: 'robo', name: t('Galo-Robô T-800'), emoji: '🤖', rarity: 'epico', price: 110, currency: 'ovo', fx: 'robo', colors: C('#9aa3ad', '#6f7882', '#4b535c', '#c2c9d0', '#b0b8c0', '#e5484d', '#5d656e'), desc: t('Eu voltarei. Pra bicar.') },
  { id: 'arcoiris', name: t('Arco-Íris Furioso'), emoji: '🌈', rarity: 'epico', price: 120, currency: 'ovo', fx: 'arcoiris', colors: C('#ff5e62', '#ffb347', '#4fa3ff', '#b57bff', '#ffd23f', '#ff2f4f', '#ffd23f'), desc: t('Colorido e com raiva de tudo.') },
  { id: 'lava', name: t('Magma Vulcânico'), emoji: '🌋', rarity: 'lendario', price: 200, currency: 'ovo', fx: 'lava', colors: C('#2a1410', '#3a1a12', '#ff5a1f', '#ffb020', '#331811', '#ff3b1f', '#4a2216'), desc: t('Rachaduras de lava pelo corpo.') },
  { id: 'fogo', name: t('Fênix de Fogo'), emoji: '🔥', rarity: 'lendario', price: 220, currency: 'ovo', fx: 'fogo', colors: C('#ff6a1f', '#e2401a', '#ffb020', '#ff3b1f', '#ff9a2f', '#ffe14a', '#ffb020'), desc: t('Renasce das cinzas a cada luta.') },
  { id: 'galaxia', name: t('Galáxia Sideral'), emoji: '🌌', rarity: 'lendario', price: 250, currency: 'ovo', fx: 'galaxia', colors: C('#2a1a5e', '#1b1142', '#120b30', '#6a3cc0', '#3a2a78', '#ff4fd8', '#8a7ad8'), desc: t('Carrega o universo nas penas.') },
  { id: 'ouro', name: t('Ouro Maciço 24k'), emoji: '💰', rarity: 'lendario', price: 300, currency: 'ovo', fx: 'ouro', colors: C('#f5c542', '#d9a520', '#c48f12', '#ffe07a', '#ffd75e', '#ffef9a', '#d9a520'), desc: t('Vale mais que a fazenda inteira.') },
]
export const SKIN_BY_ID: Record<string, Skin> = Object.fromEntries(SKINS.map((s) => [s.id, s]))

export const SKIN_BUNDLES = [
  { id: 'elementos', name: t('Pacote Elementos'), emoji: '⚡', skins: ['fogo', 'gelo', 'lava'], price: 380, desc: t('Fogo, gelo e magma juntos.') },
  { id: 'trevas', name: t('Pacote Trevas'), emoji: '🦇', skins: ['sombra', 'zumbi', 'fantasma'], price: 135, desc: t('Para quem gosta de assustar o adversário.') },
  { id: 'futuro', name: t('Pacote Futuro'), emoji: '🚀', skins: ['neon', 'robo', 'galaxia'], price: 340, desc: t('Direto do ano 3000.') },
]

// ---------- Ferramentas de luta (consumidas ao lutar) ----------
export const TOOLS: Tool[] = [
  { id: 'energetico', name: t('Energético de Milho'), emoji: '🥤', rarity: 'comum', price: 300, currency: 'milho', effect: 'atk', value: 0.15, desc: t('+{n}% de ataque durante a luta.', { n: 15 }) },
  { id: 'escudo', name: t('Escudo de Couro'), emoji: '🛡️', rarity: 'comum', price: 350, currency: 'milho', effect: 'def', value: 0.2, desc: t('Recebe {n}% menos dano.', { n: 20 }) },
  { id: 'apito', name: t('Apito do Treinador'), emoji: '📯', rarity: 'comum', price: 250, currency: 'milho', effect: 'sta', value: 0.5, desc: t('Recupera {n}% mais fôlego e começa com fôlego extra.', { n: 50 }) },
  { id: 'curativo', name: t('Kit Curativo'), emoji: '🩹', rarity: 'raro', price: 500, currency: 'milho', effect: 'cura', value: 0.3, desc: t('Cura {n}% da vida quando ficar abaixo de {p}% (1x).', { n: 30, p: 30 }) },
  { id: 'espelho', name: t('Espelho Hipnótico'), emoji: '🪞', rarity: 'raro', price: 600, currency: 'milho', effect: 'esquiva', value: 0.12, desc: t('+{n}% de chance de esquiva.', { n: 12 }) },
  { id: 'pimenta', name: t('Pimenta Malagueta'), emoji: '🌶️', rarity: 'raro', price: 6, currency: 'ovo', effect: 'especial', value: 1, desc: t('Golpe especial liberado desde o início e mais forte.') },
  { id: 'amuleto', name: t('Amuleto Olho Grego'), emoji: '🧿', rarity: 'epico', price: 8, currency: 'ovo', effect: 'critico', value: 0.12, desc: t('+{n}% de chance de golpe crítico.', { n: 12 }) },
  { id: 'banda', name: t('Banda do Terreiro'), emoji: '🥁', rarity: 'epico', price: 12, currency: 'ovo', effect: 'tudo', value: 0.08, desc: t('A torcida empurra: +{n}% em todos os atributos.', { n: 8 }) },
  { id: 'fenix', name: t('Pena de Fênix'), emoji: '🪶', rarity: 'lendario', price: 20, currency: 'ovo', effect: 'fenix', value: 0.35, desc: t('Ao levar K.O., levanta com {n}% da vida (1x).', { n: 35 }) },
]
export const TOOL_BY_ID: Record<string, Tool> = Object.fromEntries(TOOLS.map((t) => [t.id, t]))
export const MAX_TOOLS = 2

export const TOOL_KITS = [
  { id: 'kit-basico', name: t('Kit Iniciante'), emoji: '🧰', tools: { energetico: 3, escudo: 3, apito: 3 }, price: 2200, currency: 'milho' as const, desc: t('{n} ferramentas comuns com {p}% de desconto.', { n: 9, p: 20 }) },
  { id: 'kit-pro', name: t('Kit Profissional'), emoji: '💼', tools: { curativo: 3, espelho: 3, pimenta: 3, amuleto: 2 }, price: 40, currency: 'ovo' as const, desc: t('Ferramentas raras e épicas para lutas difíceis.') },
  { id: 'kit-campeao', name: t('Kit Campeão'), emoji: '🏆', tools: { banda: 3, fenix: 2, amuleto: 3, curativo: 3 }, price: 75, currency: 'ovo' as const, desc: t('Tudo que um campeão leva para a arena.') },
]
