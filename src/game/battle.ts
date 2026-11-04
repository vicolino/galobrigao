import { STYLES, TOOL_BY_ID } from './data'
import { finalStats, rng } from './rooster'
import type { BattleEvent, BattleResult, Rooster } from './types'

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
    name: 'Bicada',
    cost: 8,
    mult: 1,
    acc: 1,
    lines: ['{a} acerta uma bicada certeira em {d}.', '{a} dá uma bicada na crista de {d}!', 'Toc! {a} bica {d} sem dó.'],
  },
  voadora: {
    name: 'Voadora',
    cost: 16,
    mult: 1.55,
    acc: 0.85,
    lines: ['{a} sai voando e acerta uma VOADORA em {d}!', 'Que voadora! {a} decola e pousa em cima de {d}!', '{a} manda uma voadora digna de filme!'],
  },
  rasteira: {
    name: 'Rasteira',
    cost: 11,
    mult: 1.15,
    acc: 0.95,
    lines: ['{a} passa uma rasteira e {d} quase cai!', '{a} rasteja e derruba {d} de bico no chão.', 'Rasteira de {a}! {d} perde o equilíbrio.'],
  },
  asada: {
    name: 'Asada',
    cost: 6,
    mult: 0.75,
    acc: 1,
    lines: ['{a} dá uma asada na cara de {d}.', 'Paf! Asada de {a}!', '{a} abana as asas e acerta {d}.'],
  },
}

const MISS_LINES = ['{d} desvia na hora H!', '{d} pula de lado e {a} acerta o vento.', 'Errou! {d} é liso que nem sabão.', '{d} se abaixa e {a} passa direto.']
const CRIT_LINES = ['💥 GOLPE CRÍTICO! ', '🎯 NA MOSCA! ', '⚡ QUE PANCADA! ']
const DEFEND_LINES = ['{a} levanta as asas para se defender.', '{a} fica na retranca, estudando o adversário.', '{a} se encolhe e espera o próximo ataque.']
const REST_LINES = ['{a} está ofegante e recupera o fôlego.', '{a} para pra respirar. Cansou!', '{a} dá uma ciscada pra recuperar as forças.']

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
  const events: BattleEvent[] = []
  const hp = (): [number, number] => [Math.max(0, Math.round(S[0].hp)), Math.max(0, Math.round(S[1].hp))]
  const sta = (): [number, number] => [Math.round(S[0].sta), Math.round(S[1].sta)]

  events.push({ t: 'intro', text: `🔔 ${r0.name} x ${r1.name}! Lá vem briga!` })
  ;([0, 1] as const).forEach((i) => {
    for (const id of tools[i]) {
      const t = TOOL_BY_ID[id]
      if (t) events.push({ t: 'tool', side: i, emoji: t.emoji, hp: hp(), sta: sta(), text: `${t.emoji} ${S[i].ro.name} entra com ${t.name}!` })
    }
  })

  let ko: 0 | 1 | null = null
  let roundsPlayed = 0

  for (let round = 1; round <= ROUNDS && ko === null; round++) {
    roundsPlayed = round
    if (round > 1) {
      for (const s of S) s.sta = Math.min(Math.max(MAX_STA, s.sta), s.sta + 20 * s.staMult)
      events.push({ t: 'round', round, text: `🔔 Round ${round}! Os galos voltam ao centro.` })
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
            text = `🔥 ${me.ro.name} usa ${st.special}! Os olhos ficam vermelhos de raiva!`
          } else if (me.ro.style === 'defensivo') {
            me.hp = Math.min(me.maxHp, me.hp + me.maxHp * 0.15)
            me.def *= 1.25
            text = `🛡️ ${me.ro.name} usa ${st.special}! Recupera vida e fica duro que nem pedra.`
          } else if (me.ro.style === 'equilibrado') {
            me.hp = Math.min(me.maxHp, me.hp + me.maxHp * 0.1)
            me.atk *= 1.2
            text = `🎶 ${me.ro.name} solta o ${st.special}! COCORICÓÓÓ! A torcida vai à loucura.`
          } else {
            me.dodgeBuff = 3
            text = `💨 ${me.ro.name} usa ${st.special}! Fica impossível de acertar.`
          }
          if (me.pimenta) {
            me.atk *= 1.1
            text += ' 🌶️ Turbinado pela pimenta!'
          }
          me.sta = Math.min(MAX_STA, me.sta + 10)
          events.push({ t: 'special', side: i, move: st.special, hp: hp(), sta: sta(), text })
          continue
        }

        // Cansado: descansa
        if (me.sta < 8) {
          me.sta = Math.min(MAX_STA, me.sta + 22 * me.staMult)
          events.push({ t: 'rest', side: i, hp: hp(), sta: sta(), text: fill(pick(REST_LINES), me.ro.name, foe.ro.name) })
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
            hp: hp(),
            sta: sta(),
            text: fill(pick(MISS_LINES), me.ro.name, foe.ro.name),
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
        if (foe.guard) text += ' A defesa segurou metade!'
        events.push({ t: 'attack', side: i, move: mv.name, dmg, crit, dodged: false, hp: hp(), sta: sta(), text })

        if (foe.hp <= 0 && foe.fenix > 0) {
          foe.hp = foe.maxHp * foe.fenix
          foe.fenix = 0
          events.push({ t: 'tool', side: (1 - i) as 0 | 1, emoji: '🪶', hp: hp(), sta: sta(), text: `🪶 PENA DE FÊNIX! ${foe.ro.name} se levanta do chão! A torcida não acredita!` })
        } else if (foe.hp > 0 && foe.cura > 0 && foe.hp < foe.maxHp * 0.3) {
          foe.hp += foe.maxHp * foe.cura
          foe.cura = 0
          events.push({ t: 'tool', side: (1 - i) as 0 | 1, emoji: '🩹', hp: hp(), sta: sta(), text: `🩹 ${foe.ro.name} usa o Kit Curativo e volta pra briga!` })
        }

        if (foe.hp <= 0) {
          ko = i
          events.push({ t: 'ko', winner: i, text: `🏆 K.O.! ${foe.ro.name} vê estrelinhas. ${me.ro.name} vence!` })
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
      text: `⚖️ Fim dos ${ROUNDS} rounds! Os juízes dão a vitória para ${S[winner].ro.name} por pontos.`,
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
