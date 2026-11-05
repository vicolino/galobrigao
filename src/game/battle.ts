import { STYLES, TOOL_BY_ID } from './data'
import { finalStats, rng } from './rooster'
import { t } from '../i18n'
import type { BattleEvent, BattleResult, Rooster, ToolProc } from './types'

export const MAX_STA = 60
const ROUNDS = 3
const EXCHANGES = 4

interface Move {
  name: string
  cost: number
  mult: number
  acc: number
  lines: string[]
}

const MOVES: Record<string, Move> = {
  bicada: {
    name: t('Bicada'),
    cost: 8,
    mult: 1,
    acc: 1,
    lines: [t('{a} acerta uma bicada certeira em {d}.'), t('{a} dá uma bicada na crista de {d}!'), t('Toc! {a} bica {d} sem dó.')],
  },
  voadora: {
    name: t('Voadora'),
    cost: 16,
    mult: 1.55,
    acc: 0.85,
    lines: [t('{a} sai voando e acerta uma VOADORA em {d}!'), t('Que voadora! {a} decola e pousa em cima de {d}!'), t('{a} manda uma voadora digna de filme!')],
  },
  rasteira: {
    name: t('Rasteira'),
    cost: 11,
    mult: 1.15,
    acc: 0.95,
    lines: [t('{a} passa uma rasteira e {d} quase cai!'), t('{a} rasteja e derruba {d} de bico no chão.'), t('Rasteira de {a}! {d} perde o equilíbrio.')],
  },
  asada: {
    name: t('Asada'),
    cost: 6,
    mult: 0.75,
    acc: 1,
    lines: [t('{a} dá uma asada na cara de {d}.'), t('Paf! Asada de {a}!'), t('{a} abana as asas e acerta {d}.')],
  },
}

const MISS_LINES = [t('{d} desvia na hora H!'), t('{d} pula de lado e {a} acerta o vento.'), t('Errou! {d} é liso que nem sabão.'), t('{d} se abaixa e {a} passa direto.')]
const CRIT_LINES = [t('💥 GOLPE CRÍTICO! '), t('🎯 NA MOSCA! '), t('⚡ QUE PANCADA! ')]
const DEFEND_LINES = [t('{a} levanta as asas para se defender.'), t('{a} fica na retranca, estudando o adversário.'), t('{a} se encolhe e espera o próximo ataque.')]
const REST_LINES = [t('{a} está ofegante e recupera o fôlego.'), t('{a} para pra respirar. Cansou!'), t('{a} dá uma ciscada pra recuperar as forças.')]

interface Side {
  ro: Rooster
  maxHp: number
  hp: number
  sta: number
  atk: number
  def: number
  spd: number
  guard: boolean
  fury: number
  dodgeBuff: number
  usedSpecial: boolean
  crit: number
  dmgTaken: number
  dodgeBonus: number
  staMult: number
  cura: number
  fenix: number
  pimenta: boolean
  tools: string[]
}

function fill(line: string, a: string, d: string) {
  return line.replace(/\{a\}/g, a).replace(/\{d\}/g, d)
}

export function simulate(r0: Rooster, r1: Rooster, seed: number, tools: [string[], string[]] = [[], []]): BattleResult {
  const r = rng(seed)
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)]
  const mk = (ro: Rooster, tl: string[]): Side => {
    const s = finalStats(ro)
    const side: Side = {
      ro,
      maxHp: s.hp,
      hp: s.hp,
      sta: MAX_STA,
      atk: s.atk,
      def: s.def,
      spd: s.spd,
      guard: false,
      fury: 0,
      dodgeBuff: 0,
      usedSpecial: false,
      crit: 0.08 + (ro.lucky && ro.lucky > 0 ? 0.05 : 0),
      dmgTaken: 1,
      dodgeBonus: 0,
      staMult: 1,
      cura: 0,
      fenix: 0,
      pimenta: false,
      tools: tl.filter((id) => TOOL_BY_ID[id]),
    }
    for (const id of tl) {
      const t = TOOL_BY_ID[id]
      if (!t) continue
      if (t.effect === 'atk') side.atk *= 1 + t.value
      else if (t.effect === 'def') side.dmgTaken *= 1 - t.value
      else if (t.effect === 'sta') {
        side.staMult += t.value
        side.sta += 15
      } else if (t.effect === 'cura') side.cura = t.value
      else if (t.effect === 'esquiva') side.dodgeBonus += t.value
      else if (t.effect === 'critico') side.crit += t.value
      else if (t.effect === 'fenix') side.fenix = t.value
      else if (t.effect === 'especial') side.pimenta = true
      else if (t.effect === 'tudo') {
        side.atk *= 1 + t.value
        side.def *= 1 + t.value
        side.spd *= 1 + t.value
        side.maxHp = Math.round(side.maxHp * (1 + t.value))
        side.hp = side.maxHp
      }
    }
    return side
  }
  const S: [Side, Side] = [mk(r0, tools[0]), mk(r1, tools[1])]
  /** Ferramentas de um lado com certos efeitos (só para mostrar na tela; não usa o sorteio). */
  const procs = (side: 0 | 1, effects: string[]): ToolProc[] =>
    S[side].tools.filter((id) => effects.includes(TOOL_BY_ID[id].effect)).map((tool) => ({ side, tool }))
  const events: BattleEvent[] = []
  const hp = (): [number, number] => [Math.max(0, Math.round(S[0].hp)), Math.max(0, Math.round(S[1].hp))]
  const sta = (): [number, number] => [Math.round(S[0].sta), Math.round(S[1].sta)]

  events.push({ t: 'intro', text: t('🔔 {a} x {b}! Lá vem briga!', { a: r0.name, b: r1.name }) })
  ;([0, 1] as const).forEach((i) => {
    for (const id of tools[i]) {
      const tl = TOOL_BY_ID[id]
      if (tl) events.push({ t: 'tool', side: i, emoji: tl.emoji, hp: hp(), sta: sta(), text: t('{emoji} {nome} entra com {tool}! {desc}', { emoji: tl.emoji, nome: S[i].ro.name, tool: tl.name, desc: tl.desc }) })
    }
  })

  let ko: 0 | 1 | null = null
  let roundsPlayed = 0

  for (let round = 1; round <= ROUNDS && ko === null; round++) {
    roundsPlayed = round
    if (round > 1) {
      for (const s of S) s.sta = Math.min(Math.max(MAX_STA, s.sta), s.sta + 20 * s.staMult)
      events.push({ t: 'round', round, text: t('🔔 Round {round}! Os galos voltam ao centro.', { round }) })
      ;([0, 1] as const).forEach((i) => {
        if (S[i].tools.includes('banda'))
          events.push({ t: 'tool', side: i, emoji: '🥁', hp: hp(), sta: sta(), text: t('🥁 A Banda do Terreiro toca mais alto e a torcida empurra {nome}!', { nome: S[i].ro.name }) })
      })
    }
    for (let ex = 0; ex < EXCHANGES && ko === null; ex++) {
      const init0 = S[0].spd * (0.75 + r() * 0.5)
      const init1 = S[1].spd * (0.75 + r() * 0.5)
      const order: (0 | 1)[] = init0 >= init1 ? [0, 1] : [1, 0]
      for (const i of order) {
        if (ko !== null) break
        const me = S[i]
        const foe = S[(1 - i) as 0 | 1]
        me.guard = false

        // Especial: uma vez por luta, quando aperta
        if (!me.usedSpecial && ((me.hp < me.maxHp * 0.5 && r() < 0.55) || (me.pimenta && r() < 0.3))) {
          me.usedSpecial = true
          const st = STYLES[me.ro.style]
          let text = ''
          if (me.ro.style === 'agressivo') {
            me.fury = me.pimenta ? 3 : 2
            text = t('🔥 {nome} usa {special}! Os olhos ficam vermelhos de raiva!', { nome: me.ro.name, special: st.special })
          } else if (me.ro.style === 'defensivo') {
            me.hp = Math.min(me.maxHp, me.hp + me.maxHp * 0.15)
            me.def *= 1.25
            text = t('🛡️ {nome} usa {special}! Recupera vida e fica duro que nem pedra.', { nome: me.ro.name, special: st.special })
          } else if (me.ro.style === 'equilibrado') {
            me.hp = Math.min(me.maxHp, me.hp + me.maxHp * 0.1)
            me.atk *= 1.2
            text = t('🎶 {nome} solta o {special}! COCORICÓÓÓ! A torcida vai à loucura.', { nome: me.ro.name, special: st.special })
          } else {
            me.dodgeBuff = 3
            text = t('💨 {nome} usa {special}! Fica impossível de acertar.', { nome: me.ro.name, special: st.special })
          }
          if (me.pimenta) {
            me.atk *= 1.1
            text += t(' 🌶️ Turbinado pela pimenta!')
          }
          me.sta = Math.min(MAX_STA, me.sta + 10)
          events.push({ t: 'special', side: i, move: st.special, hp: hp(), sta: sta(), text })
          continue
        }

        // Cansado: descansa
        if (me.sta < 8) {
          me.sta = Math.min(MAX_STA, me.sta + 22 * me.staMult)
          const ap = procs(i, ['sta'])
          events.push({ t: 'rest', side: i, boost: ap, hp: hp(), sta: sta(), text: fill(pick(REST_LINES), me.ro.name, foe.ro.name) + (ap.length ? t(' 📯 O apito do treinador dá fôlego extra!') : '') })
          continue
        }

        // Escolha de ação conforme o estilo
        const defendChance = me.ro.style === 'defensivo' ? 0.22 : me.ro.style === 'agressivo' ? 0.05 : 0.12
        if (r() < defendChance && me.sta < MAX_STA - 5) {
          me.guard = true
          me.sta = Math.min(MAX_STA, me.sta + 12 * me.staMult)
          events.push({ t: 'defend', side: i, hp: hp(), sta: sta(), text: fill(pick(DEFEND_LINES), me.ro.name, foe.ro.name) })
          continue
        }

        const roll = r()
        const wantsBig = me.ro.style === 'agressivo' ? 0.4 : me.ro.style === 'veloz' ? 0.2 : 0.28
        let mv: Move
        if (roll < wantsBig && me.sta >= MOVES.voadora.cost) mv = MOVES.voadora
        else if (roll < wantsBig + 0.25 && me.sta >= MOVES.rasteira.cost) mv = MOVES.rasteira
        else if (me.sta >= MOVES.bicada.cost) mv = MOVES.bicada
        else mv = MOVES.asada
        me.sta -= mv.cost

        // Esquiva
        let dodge = 0.05 + (foe.spd - me.spd) * 0.012
        if (foe.dodgeBuff > 0) {
          dodge += 0.35
          foe.dodgeBuff--
        }
        dodge = Math.max(0.03, Math.min(0.6, dodge + foe.dodgeBonus)) + (1 - mv.acc)
        if (r() < dodge) {
          events.push({
            t: 'attack',
            side: i,
            move: mv.name,
            dmg: 0,
            crit: false,
            dodged: true,
            boost: procs((1 - i) as 0 | 1, ['esquiva']),
            hp: hp(),
            sta: sta(),
            text: fill(pick(MISS_LINES), me.ro.name, foe.ro.name) + (procs((1 - i) as 0 | 1, ['esquiva']).length ? t(' 🪞 O espelho hipnótico confundiu o golpe!') : ''),
          })
          continue
        }

        const crit = r() < me.crit
        let dmg = me.atk * mv.mult * (0.85 + r() * 0.3) * (32 / (32 + foe.def))
        if (crit) dmg *= 1.7
        if (me.fury > 0) {
          dmg *= 1.5
          me.fury--
        }
        if (foe.guard) dmg *= 0.5
        dmg *= foe.dmgTaken
        dmg = Math.max(1, Math.round(dmg))
        foe.hp -= dmg
        let text = (crit ? pick(CRIT_LINES) : '') + fill(pick(mv.lines), me.ro.name, foe.ro.name) + ` (-${dmg})`
        if (foe.guard) text += t(' A defesa segurou metade!')
        const fi = (1 - i) as 0 | 1
        const boost = [...procs(i, crit ? ['atk', 'tudo', 'critico'] : ['atk', 'tudo']), ...procs(fi, ['def', 'tudo'])]
        if (crit && procs(i, ['critico']).length) text += t(' 🧿 O amuleto brilhou!')
        events.push({ t: 'attack', side: i, move: mv.name, dmg, crit, dodged: false, boost, hp: hp(), sta: sta(), text })

        if (foe.hp <= 0 && foe.fenix > 0) {
          foe.hp = foe.maxHp * foe.fenix
          foe.fenix = 0
          events.push({ t: 'tool', side: (1 - i) as 0 | 1, emoji: '🪶', hp: hp(), sta: sta(), text: t('🪶 PENA DE FÊNIX! {nome} se levanta do chão! A torcida não acredita!', { nome: foe.ro.name }) })
        } else if (foe.hp > 0 && foe.cura > 0 && foe.hp < foe.maxHp * 0.3) {
          foe.hp += foe.maxHp * foe.cura
          foe.cura = 0
          events.push({ t: 'tool', side: (1 - i) as 0 | 1, emoji: '🩹', hp: hp(), sta: sta(), text: t('🩹 {nome} usa o Kit Curativo e volta pra briga!', { nome: foe.ro.name }) })
        }

        if (foe.hp <= 0) {
          ko = i
          events.push({ t: 'ko', winner: i, text: t('🏆 K.O.! {perdedor} vê estrelinhas. {vencedor} vence!', { perdedor: foe.ro.name, vencedor: me.ro.name }) })
        }
      }
    }
  }

  let winner: 0 | 1
  let method: 'ko' | 'decisao'
  if (ko !== null) {
    winner = ko
    method = 'ko'
  } else {
    const p0 = S[0].hp / S[0].maxHp
    const p1 = S[1].hp / S[1].maxHp
    winner = p0 === p1 ? (r() < 0.5 ? 0 : 1) : p0 > p1 ? 0 : 1
    method = 'decisao'
    events.push({
      t: 'decision',
      winner,
      text: t('⚖️ Fim dos {n} rounds! Os juízes dão a vitória para {nome} por pontos.', { n: ROUNDS, nome: S[winner].ro.name }),
    })
  }

  return { events, winner, method, maxHp: [S[0].maxHp, S[1].maxHp], maxSta: MAX_STA, rounds: roundsPlayed }
}

/** Estima probabilidades rodando várias simulações. Usado para calcular as odds. */
export function estimate(a: Rooster, b: Rooster, runs = 240, tools: [string[], string[]] = [[], []]) {
  let winsA = 0
  let ko = 0
  for (let i = 0; i < runs; i++) {
    const res = simulate(a, b, 1000 + i * 7919, tools)
    if (res.winner === 0) winsA++
    if (res.method === 'ko') ko++
  }
  return { pA: winsA / runs, pKo: ko / runs }
}

export const HOUSE_EDGE = 0.07

export function toOdds(p: number) {
  const clamped = Math.max(0.04, Math.min(0.96, p))
  return Math.max(1.05, Math.round(((1 - HOUSE_EDGE) / clamped) * 100) / 100)
}
