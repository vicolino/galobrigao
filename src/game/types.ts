export type Currency = 'milho' | 'ovo'
export type Style = 'agressivo' | 'defensivo' | 'equilibrado' | 'veloz'
export type Slot = 'cabeca' | 'rosto' | 'corpo' | 'pes'
export type Rarity = 'comum' | 'raro' | 'epico' | 'lendario'
export type Pattern = 'solido' | 'carijo' | 'pintado' | 'dourado'

export interface Stats {
  hp: number
  atk: number
  def: number
  spd: number
}

export interface Breed {
  id: string
  name: string
  desc: string
  rarity: Rarity
  pattern: Pattern
  colors: {
    body: string
    wing: string
    tail: string
    tail2: string
    neck: string
    comb: string
    legs: string
  }
  base: Stats
  price: number
  special?: boolean
}

export interface Accessory {
  id: string
  name: string
  slot: Slot
  emoji: string
  rarity: Rarity
  price: number
  currency: Currency
  bonus: Partial<Stats>
  desc: string
}

export type ItemEffect = 'energia' | 'xp' | 'energia_total' | 'sorte'

export type SkinFx =
  | 'neon' | 'fogo' | 'gelo' | 'galaxia' | 'arcoiris' | 'zumbi' | 'robo' | 'ouro' | 'fantasma'
  | 'malhado' | 'camuflado' | 'melancia' | 'sombra' | 'lava'

export interface Skin {
  id: string
  name: string
  emoji: string
  rarity: Rarity
  price: number
  currency: Currency
  fx?: SkinFx
  /** Exclusiva (ex.: Passe da Temporada): não é vendida na loja. */
  exclusive?: boolean
  colors: Breed['colors']
  desc: string
}

export type ToolEffect = 'atk' | 'def' | 'sta' | 'cura' | 'esquiva' | 'critico' | 'fenix' | 'especial' | 'tudo'

export interface Tool {
  id: string
  name: string
  emoji: string
  price: number
  currency: Currency
  effect: ToolEffect
  value: number
  desc: string
  rarity: Rarity
}

export interface Item {
  id: string
  name: string
  emoji: string
  price: number
  currency: Currency
  effect: ItemEffect
  value: number
  desc: string
}

export interface Rooster {
  id: string
  name: string
  breedId: string
  level: number
  xp: number
  base: Stats
  style: Style
  stars: number
  wins: number
  losses: number
  kos: number
  energy: number
  energyAt: number
  equipped: Partial<Record<Slot, string>>
  owner: string
  lucky?: number
  skin?: string
  fedAt?: number
  /** Pelagem rara (cruzamento): cores próprias que substituem as da raça. */
  tint?: { body: string; wing: string; neck: string; tail: string; tail2: string }
  /** Nomes dos pais (cruzamento). */
  parents?: [string, string]
  /** Quantas vezes já cruzou (máx. 7). Só o servidor mexe. */
  breedCount?: number
  /** Galo NFT (carteira custodial). Só o servidor mexe. */
  nft?: { tokenId: string }
  /** 🔑 Galo alugado de outro jogador (só o servidor mexe; src/game/aluguel.ts). */
  rental?: RoosterRental
}

/** 🔑 Aluguel: dados do contrato no galo que está com quem alugou. */
export interface RoosterRental {
  owner: string
  ownerName: string
  until: number
  sharePct: number
  listingId: string
}

/** 🔑 Aluguel: galo do dono que está fora (anunciado para alugar ou alugado). */
export interface LentRooster {
  listingId: string
  roosterId: string
  name: string
  breedId: string
  level: number
  stars: number
  status: 'anunciado' | 'alugado'
  borrowerName?: string
  until?: number
}

/** Ninho do cruzamento: só o servidor mexe. */
export interface Nest {
  /** Fim do descanso de cada galo que cruzou (id → timestamp). */
  cooldowns: Record<string, number>
  egg?: { id: string; parents: [Pick<Rooster, 'id' | 'name' | 'breedId' | 'base' | 'stars'>, Pick<Rooster, 'id' | 'name' | 'breedId' | 'base' | 'stars'>]; startedAt: number; readyAt: number }
}

export interface Fighter {
  rooster: Rooster
  stats: Stats
}

/** Uma ferramenta agindo em um lado da luta. */
export interface ToolProc {
  side: 0 | 1
  tool: string
}

export type BattleEvent =
  | { t: 'intro'; text: string }
  | { t: 'round'; round: number; text: string }
  | {
      t: 'attack'
      side: 0 | 1
      move: string
      dmg: number
      crit: boolean
      dodged: boolean
      /** Ferramentas que fizeram diferença neste golpe (só visual). */
      boost?: ToolProc[]
      hp: [number, number]
      sta: [number, number]
      text: string
    }
  | { t: 'defend'; side: 0 | 1; hp: [number, number]; sta: [number, number]; text: string }
  | { t: 'rest'; side: 0 | 1; boost?: ToolProc[]; hp: [number, number]; sta: [number, number]; text: string }
  | { t: 'special'; side: 0 | 1; move: string; hp: [number, number]; sta: [number, number]; text: string }
  | { t: 'tool'; side: 0 | 1; emoji: string; hp: [number, number]; sta: [number, number]; text: string }
  | { t: 'ko'; winner: 0 | 1; text: string }
  | { t: 'decision'; winner: 0 | 1; text: string }

export interface BattleResult {
  events: BattleEvent[]
  winner: 0 | 1
  method: 'ko' | 'decisao'
  maxHp: [number, number]
  maxSta: number
  rounds: number
}

export interface HouseFight {
  id: string
  a: Rooster
  b: Rooster
  oddsA: number
  oddsB: number
  oddsKo: number
  seed: number
  status: 'aberta' | 'encerrada'
  winner?: 0 | 1
  method?: 'ko' | 'decisao'
  featured?: boolean
}

export type BetPick = 'a' | 'b' | 'ko'

export interface Bet {
  id: string
  fightId: string
  pick: BetPick
  amount: number
  odds: number
  label: string
  status: 'pendente' | 'ganhou' | 'perdeu'
  payout: number
  at: number
}

export interface Mission {
  id: string
  kind: MissionKind
  text: string
  goal: number
  progress: number
  reward: { milho: number; ovo: number }
  claimed: boolean
}

export type MissionKind =
  | 'vencer'
  | 'lutar'
  | 'apostar'
  | 'ganhar_aposta'
  | 'treinar'
  | 'comprar'
  | 'equipar'
  | 'assistir'
  | 'ko'

export interface LeagueRow {
  id: string
  name: string
  points: number
  isPlayer?: boolean
}

export interface Transaction {
  id: string
  at: number
  text: string
  milho: number
  ovo: number
  /** Fichas de aposta (só existem para apostar; não são moeda). */
  fichas?: number
}

export interface GameState {
  version: number
  player: { name: string; avatar: string; createdAt: number }
  milho: number
  ovos: number
  /** 🎟️ Fichas: só servem para apostar. Ganha jogando; não compra, não troca, não transfere. */
  fichas: number
  roosters: Rooster[]
  accessories: Record<string, number>
  items: Record<string, number>
  skins: string[]
  tools: Record<string, number>
  market: { at: number; roosters: Rooster[] }
  card: { at: number; fights: HouseFight[] }
  bets: Bet[]
  missions: { day: string; list: Mission[] }
  daily: { last: string; streak: number }
  league: { season: number; points: number; rows: LeagueRow[]; day: string; claimed: string[] }
  stats: {
    fights: number
    wins: number
    kos: number
    betsPlaced: number
    betsWon: number
    biggestWin: number
    milhoEarned: number
    boxesOpened: number
    purchases: number
    toolsUsed: number
    toolWins: number
  }
  vip: { until: number }
  /** Itens lendários comprados com ovos ou dinheiro que ainda podem virar NFT (chave 'acc:id' | 'skin:id'). Só o servidor mexe. */
  mintable?: Record<string, number>
  /** Ofertas relâmpago (só o servidor cria e marca como compradas). */
  offers?: Offer[]
  /** Recargas de energia com ovos no dia (preço sobe a cada uma). Só o servidor mexe. */
  refills?: { day: string; n: number }
  /** Ninho do cruzamento (servidor). */
  nest?: Nest
  /** 🔑 Galos emprestados no Aluguel da Feira (servidor). */
  lent?: LentRooster[]
  /** Passe da Temporada (mês UTC). `premium` e `claimed` só o servidor mexe. */
  pass?: { season: string; xp: number; premium: boolean; claimed: { free: number[]; premium: number[] }; day?: string; dayXp?: number }
  /** 🏟️ Troféus de torneio (só o servidor dá). */
  trophies?: { id: string; kind: 'diario' | 'semanal'; place: number; at: number }[]
  achievements: string[]
  history: Transaction[]
  /** newsSeen: id da última nota de Novidades que o jogador já viu. */
  settings: { volume: number; muted: boolean; newsSeen?: string }
}

/** Oferta relâmpago personalizada (preço em ovos, vence em 60 min). */
export interface Offer {
  id: string
  kind: 'treino' | 'revanche' | 'banquete'
  items: Record<string, number>
  tools: Record<string, number>
  full: number
  price: number
  at: number
  until: number
  boughtAt?: number
}
