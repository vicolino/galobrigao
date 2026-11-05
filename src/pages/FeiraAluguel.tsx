// 🔑 Aba "Aluguel" da Feira: alugar galos de outros criadores, pôr os seus para alugar e acompanhar os contratos.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { RoosterSvg } from '../components/RoosterSvg'
import { Empty, Modal, Price, RoosterCard } from '../components/ui'
import { ALUGUEL, type AluguelData, type AluguelListing } from '../game/aluguel'
import { FEIRA, feiraFee, feiraPriceOk, suggested, suggestedMilho } from '../game/feira'
import { fmt } from '../game/rooster'
import { useGame } from '../game/store'
import type { Currency, LentRooster, Rooster } from '../game/types'
import { locale, t, tn, tp, tx } from '../i18n'

const coin = (c: Currency) => (c === 'milho' ? '🌽' : '🥚')
const money = (v: number, c: Currency) => `${coin(c)} ${fmt(v)}`
const ddmm = (ms: number) => new Date(ms).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' })

/** Tempo que falta, curto: "2d", "5h", "12min". */
export function leftShort(until: number) {
  const ms = Math.max(0, until - Date.now())
  if (ms >= 86400_000) return t('{n}d', { n: Math.floor(ms / 86400_000) })
  if (ms >= 3600_000) return t('{n}h', { n: Math.floor(ms / 3600_000) })
  return t('{n}min', { n: Math.max(1, Math.ceil(ms / 60_000)) })
}

/** Selo do galo alugado (Galinheiro). */
export function RentBadge({ ro }: { ro: Rooster }) {
  if (!ro.rental) return null
  return (
    <div className="alu-badge" title={t('Alugado de {nome} até {data}', { nome: ro.rental.ownerName, data: ddmm(ro.rental.until) })}>
      {t('🔑 Alugado · volta em {t}', { t: leftShort(ro.rental.until) })}
    </div>
  )
}

/** Cartão no lugar do galo que está fora, no galinheiro do dono. */
export function LentCard({ l }: { l: LentRooster }) {
  return (
    <div className="card rooster-card alu-lent">
      <div className="rc-art">
        <RoosterSvg breedId={l.breedId} size={110} anim="none" />
      </div>
      <div className="rc-name">{l.name}</div>
      <div className="rc-sub">{t('Nv {n}', { n: l.level })}</div>
      <div className="alu-badge">
        {l.status === 'alugado' && l.until
          ? t('🔑 Alugado para {nome} até {data}', { nome: l.borrowerName ?? '?', data: ddmm(l.until) })
          : t('🔑 Na Feira, esperando quem alugue')}
      </div>
      <a className="tiny" href="#/feira/aluguel">
        {t('Ver aluguéis →')}
      </a>
    </div>
  )
}

type Sub = 'alugar' | 'oferecer' | 'meus'

export function Aluguel() {
  const [data, setData] = useState<AluguelData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [sub, setSub] = useState<Sub>('alugar')

  const load = useCallback(() => {
    api.aluguel
      .get()
      .then((d) => {
        setData(d)
        setErr(null)
      })
      .catch((e) => setErr(tx((e as Error).message)))
  }, [])
  useEffect(() => {
    load()
    const timer = setInterval(load, 20_000)
    return () => clearInterval(timer)
  }, [load])

  const mineActive = data ? data.mine.filter((l) => l.status === 'ativo' || l.status === 'alugado').length + data.borrowed.filter((l) => l.status === 'alugado').length : 0
  return (
    <>
      <p className="muted">{t('Alugue galos fortes de outros criadores para lutar na Arena, ou ponha os seus para trabalhar e ganhe enquanto descansa. O galo volta com todo o XP que ganhou.')}</p>
      <div className="chips">
        {(
          [
            ['alugar', t('🔑 Para alugar')],
            ['oferecer', t('📢 Colocar para alugar')],
            ['meus', mineActive ? t('📋 Meus aluguéis ({n})', { n: mineActive }) : t('📋 Meus aluguéis')],
          ] as [Sub, string][]
        ).map(([id, label]) => (
          <button key={id} className={`chip clickable ${sub === id ? 'active' : ''}`} onClick={() => setSub(id)}>
            {label}
          </button>
        ))}
      </div>
      {err && <div className="warn">{err}</div>}
      {!data && !err && <div className="spinner" />}
      {data && sub === 'alugar' && <ParaAlugar data={data} reload={load} />}
      {data && sub === 'oferecer' && <Oferecer data={data} reload={load} done={() => setSub('meus')} />}
      {data && sub === 'meus' && <MeusAlugueis data={data} reload={load} />}
    </>
  )
}

// ---------------- Para alugar ----------------

function ParaAlugar({ data, reload }: { data: AluguelData; reload: () => void }) {
  const { state, actions, toast } = useGame()
  const s = state!
  const [sel, setSel] = useState<AluguelListing | null>(null)
  const [busy, setBusy] = useState(false)
  const [days, setDays] = useState<number | 'todos'>('todos')

  const list = useMemo(() => data.listings.filter((l) => days === 'todos' || l.days === days), [data.listings, days])
  const borrowing = data.borrowed.filter((l) => l.status === 'alugado').length
  const blocked = (l: AluguelListing) =>
    borrowing >= ALUGUEL.maxBorrowed
      ? t('Limite de {n} alugados', { n: ALUGUEL.maxBorrowed })
      : s.roosters.length >= FEIRA.maxRoosters
        ? t('Galinheiro lotado')
        : (l.currency === 'milho' ? s.milho : s.ovos) < l.price
          ? l.currency === 'milho'
            ? t('Milho insuficiente 🌽')
            : t('Ovos de ouro insuficientes 🥚')
          : null

  const rent = async () => {
    if (!sel) return
    setBusy(true)
    const r = await actions.feiraOp(() => api.aluguel.rent(sel.id, sel.price, sel.currency))
    setBusy(false)
    if (r.ok) toast(t('🔑 {nome} é seu por {n} dia(s)! Bora pra Arena.', { nome: sel.rooster.name, n: sel.days }), 'ok')
    else toast(tx(r.error), 'erro')
    setSel(null)
    reload()
  }

  return (
    <>
      <div className="chips">
        {(['todos', ...ALUGUEL.days] as const).map((d) => (
          <button key={d} className={`chip clickable ${days === d ? 'active' : ''}`} onClick={() => setDays(d)}>
            {d === 'todos' ? t('Todos') : tp('{n} dia', '{n} dias', d)}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty emoji="🔑" title={t('Nenhum galo para alugar agora')} text={t('Volte mais tarde, ou ponha um dos seus para alugar.')} />
      ) : (
        <div className="grid-shop feira-grid">
          {list.map((l) => {
            const why = blocked(l)
            return (
              <RoosterCard
                key={l.id}
                ro={l.rooster}
                compact
                footer={
                  <div className="feira-foot">
                    <span className="tiny muted">
                      {l.ownerAvatar} {l.owner}
                    </span>
                    <div className="alu-terms">
                      <span className="chip">⏳ {tp('{n} dia', '{n} dias', l.days)}</span>
                      {l.sharePct > 0 && <span className="chip">{t('🤝 {p}% da Arena', { p: l.sharePct })}</span>}
                    </div>
                    <button
                      className="btn btn-primary full"
                      disabled={!!why}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSel(l)
                      }}
                    >
                      {why ?? (
                        <>
                          {t('Alugar')} · <Price value={l.price} currency={l.currency} />
                        </>
                      )}
                    </button>
                  </div>
                }
              />
            )
          })}
        </div>
      )}

      <Modal open={!!sel} onClose={() => setSel(null)} title={t('🔑 Confirmar aluguel')}>
        {sel && (
          <div className="center">
            <p>
              {tn('Alugar {nome} de {dono} por {dias} pagando {preco}?', {
                nome: <b>{sel.rooster.name}</b>,
                dono: <b>{sel.owner}</b>,
                dias: <b>{tp('{n} dia', '{n} dias', sel.days)}</b>,
                preco: <b>{money(sel.price, sel.currency)}</b>,
              })}
            </p>
            {sel.sharePct > 0 && <p className="tiny">{t('🤝 {p}% do milho que ele ganhar na Arena vai para o dono.', { p: sel.sharePct })}</p>}
            <p className="tiny muted">{t('Você pode lutar, treinar e alimentar. Não dá para vender, dar, cruzar nem anunciar. No fim do prazo ele volta sozinho para o dono.')}</p>
            <p className="tiny muted">{t('Seu saldo: {saldo}', { saldo: money(sel.currency === 'milho' ? s.milho : s.ovos, sel.currency) })}</p>
            <div className="row gap center-row">
              <button className="btn" onClick={() => setSel(null)}>
                {t('Cancelar')}
              </button>
              <button className="btn btn-primary" disabled={busy || !!blocked(sel)} onClick={rent}>
                {t('Alugar')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

// ---------------- Colocar para alugar ----------------

function Oferecer({ data, reload, done }: { data: AluguelData; reload: () => void; done: () => void }) {
  const { state, actions, toast } = useGame()
  const s = state!
  const mine = s.roosters.filter((r) => !r.rental && !r.nft)
  const [pick, setPick] = useState<Rooster | null>(null)
  const [days, setDays] = useState<number>(3)
  const [currency, setCurrency] = useState<Currency>('milho')
  const [price, setPrice] = useState('')
  const [share, setShare] = useState(0)
  const [busy, setBusy] = useState(false)

  // Sugestão: ~3% do valor do galo por dia
  const sug = pick ? suggested(Math.round((suggestedMilho('galo', pick.id, pick) * 0.03 * days) / 10) * 10, currency) : 0
  useEffect(() => {
    if (pick) setPrice(String(sug))
  }, [pick?.id, currency, days]) // eslint-disable-line react-hooks/exhaustive-deps

  const n = Number(price)
  const ok = feiraPriceOk(n, currency)
  const fee = ok ? feiraFee(n) : 0
  const out = data.mine.filter((l) => l.status === 'ativo' || l.status === 'alugado').length
  const full = out >= ALUGUEL.maxLent

  const submit = async () => {
    if (!pick || !ok) return
    setBusy(true)
    const r = await actions.feiraOp(() => api.aluguel.list(pick.id, days, n, currency, share))
    setBusy(false)
    if (r.ok) {
      toast(t('🔑 {nome} está na Feira para alugar!', { nome: pick.name }), 'ok')
      setPick(null)
      reload()
      done()
    } else toast(tx(r.error), 'erro')
  }

  return (
    <div className="feira-sell">
      <div>
        <h3 className="section-title">{t('1. Escolha o galo')}</h3>
        {s.roosters.length <= 1 ? (
          <p className="muted">{t('Você precisa ter pelo menos um galo. Arrume outro antes de alugar este.')}</p>
        ) : (
          <div className="grid-cards">
            {mine.map((r) => (
              <RoosterCard key={r.id} ro={r} compact selected={pick?.id === r.id} onClick={() => setPick(r)} />
            ))}
          </div>
        )}
      </div>
      <div className="card card-form feira-form">
        <h3>{t('2. Condições')}</h3>
        {!pick ? (
          <p className="muted">{t('Escolha um galo ao lado.')}</p>
        ) : (
          <>
            <div className="row gap">
              <RoosterSvg breedId={pick.breedId} tint={pick.tint} size={70} anim="none" />
              <b>{pick.name}</b>
            </div>
            <span className="tiny muted">{t('Prazo')}</span>
            <div className="chips">
              {ALUGUEL.days.map((d) => (
                <button key={d} className={`chip clickable ${days === d ? 'active' : ''}`} onClick={() => setDays(d)}>
                  {tp('{n} dia', '{n} dias', d)}
                </button>
              ))}
            </div>
            <div className="chips">
              {(['milho', 'ovo'] as const).map((c) => (
                <button key={c} className={`chip clickable ${currency === c ? 'active' : ''}`} onClick={() => setCurrency(c)}>
                  {c === 'milho' ? t('🌽 Milho') : t('🥚 Ovos de ouro')}
                </button>
              ))}
            </div>
            <label className="field">
              <span>
                {t('Preço do aluguel')} <span className="tiny muted">· {t('sugerido: {v}', { v: money(sug, currency) })}</span>
              </span>
              <input type="number" min={FEIRA.min[currency]} max={FEIRA.max[currency]} step={1} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
            {price !== '' && !ok && <p className="tiny neg">{t('Preço entre {min} e {max}.', { min: money(FEIRA.min[currency], currency), max: money(FEIRA.max[currency], currency) })}</p>}
            <label className="field">
              <span>
                {t('🤝 Sua parte do milho da Arena')}: <b>{share}%</b>
              </span>
              <input type="range" min={0} max={ALUGUEL.maxSharePct} step={5} value={share} onChange={(e) => setShare(Number(e.target.value))} />
            </label>
            {ok && <p className="feira-net">{tn('Você recebe {v} adiantado, após a taxa de {p}%', { v: <b>{money(n - fee, currency)}</b>, p: FEIRA.feePct * 100 })}</p>}
            <p className="tiny muted">{t('Os acessórios voltam para o seu inventário e a skin fica com você. O galo sai do galinheiro até alguém alugar (ou {n}h) e, alugado, volta no fim do prazo com o XP que ganhou.', { n: ALUGUEL.ttlHours })}</p>
            {full && <p className="tiny neg">{t('Você já tem {n} galos no aluguel. Espere algum voltar.', { n: ALUGUEL.maxLent })}</p>}
            <button className="btn btn-primary full" disabled={!ok || busy || full} onClick={submit}>
              {t('🔑 Pôr para alugar por {v}', { v: ok ? money(n, currency) : '—' })}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------- Meus aluguéis ----------------

const STATUS = (): Record<AluguelListing['status'], string> => ({
  ativo: t('🟢 Esperando quem alugue'),
  alugado: t('🔑 Alugado'),
  devolvido: t('✅ Voltou'),
  cancelado: t('↩️ Cancelado'),
  vencido: t('⌛ Ninguém alugou'),
  excluido: t('🚫 Encerrado'),
})

function MeusAlugueis({ data, reload }: { data: AluguelData; reload: () => void }) {
  const { actions, toast } = useGame()
  const [busy, setBusy] = useState<string | null>(null)
  const [giveBack, setGiveBack] = useState<AluguelListing | null>(null)

  const run = async (l: AluguelListing, fn: () => Promise<{ rev: number; state: import('../game/types').GameState }>, msg: string) => {
    setBusy(l.id)
    const r = await actions.feiraOp(fn)
    setBusy(null)
    if (r.ok) toast(msg, 'ok')
    else toast(tx(r.error), 'erro')
    reload()
  }

  const ownerRow = (l: AluguelListing) => (
    <div key={l.id} className="list-row">
      <RoosterSvg breedId={l.rooster.breedId} tint={l.rooster.tint} size={44} anim="none" />
      <div className="grow">
        <b>{l.rooster.name}</b>
        <div className="tiny muted">
          {STATUS()[l.status]}
          {l.status === 'alugado' && l.until && ` · ${t('com {nome}, volta em {t}', { nome: l.borrower ?? '?', t: leftShort(l.until) })}`}
          {l.status === 'ativo' && ` · ${tp('{n} dia', '{n} dias', l.days)}`}
          {l.sharePct > 0 && ` · ${t('🤝 {p}%', { p: l.sharePct })}`}
        </div>
      </div>
      <div className="right">
        <Price value={l.price} currency={l.currency} />
        {l.rentedAt && <div className="tiny pos">{t('+{v} líquido', { v: money(l.price - (l.fee ?? 0), l.currency) })}</div>}
        {l.shareEarned > 0 && <div className="tiny pos">{t('+🌽 {n} da Arena', { n: fmt(l.shareEarned) })}</div>}
      </div>
      {l.status === 'ativo' && (
        <button className="btn btn-sm" disabled={busy === l.id} onClick={() => run(l, () => api.aluguel.cancel(l.id), t('{nome} voltou para você.', { nome: l.rooster.name }))}>
          {t('Cancelar')}
        </button>
      )}
    </div>
  )

  const borrowerRow = (l: AluguelListing) => (
    <div key={l.id} className="list-row">
      <RoosterSvg breedId={l.rooster.breedId} tint={l.rooster.tint} size={44} anim="none" />
      <div className="grow">
        <b>{l.rooster.name}</b>
        <div className="tiny muted">
          {t('de {nome}', { nome: l.owner })}
          {l.status === 'alugado' && l.until ? ` · ${t('⏳ volta em {t} ({data})', { t: leftShort(l.until), data: ddmm(l.until) })}` : ` · ${STATUS()[l.status]}`}
          {l.sharePct > 0 && ` · ${t('🤝 {p}% da Arena para o dono', { p: l.sharePct })}`}
        </div>
      </div>
      {l.status === 'alugado' && (
        <>
          <a className="btn btn-sm btn-primary" href={`#/galinheiro/${l.rooster.id}`}>
            {t('⚔️ Usar')}
          </a>
          <button className="btn btn-sm" disabled={busy === l.id} onClick={() => setGiveBack(l)}>
            {t('Devolver')}
          </button>
        </>
      )}
    </div>
  )

  const owner = data.mine
  const borrowed = data.borrowed
  const earned = (c: Currency) => owner.filter((l) => l.rentedAt && l.currency === c).reduce((a, l) => a + l.price - (l.fee ?? 0), 0)
  const shareTotal = owner.reduce((a, l) => a + l.shareEarned, 0)
  return (
    <>
      <h3 className="section-title">{t('🔑 Galos que aluguei ({n}/{max})', { n: borrowed.filter((l) => l.status === 'alugado').length, max: ALUGUEL.maxBorrowed })}</h3>
      {borrowed.length === 0 ? <p className="muted">{t('Você não alugou nenhum galo.')}</p> : <div className="list">{borrowed.map(borrowerRow)}</div>}
      <h3 className="section-title">{t('📢 Meus galos no aluguel ({n}/{max})', { n: owner.filter((l) => l.status === 'ativo' || l.status === 'alugado').length, max: ALUGUEL.maxLent })}</h3>
      {owner.length > 0 && (
        <p className="tiny">
          {t('Ganho nos últimos 30 dias: {m} · {o} · {s} da Arena', { m: money(earned('milho'), 'milho'), o: money(earned('ovo'), 'ovo'), s: money(shareTotal, 'milho') })}
        </p>
      )}
      {owner.length === 0 ? <p className="muted">{t('Nenhum galo seu no aluguel.')}</p> : <div className="list">{owner.map(ownerRow)}</div>}

      <Modal open={!!giveBack} onClose={() => setGiveBack(null)} title={t('🔑 Devolver antes do prazo?')}>
        {giveBack && (
          <div className="center">
            <p>{tn('Devolver {nome} para {dono} agora? Não tem reembolso.', { nome: <b>{giveBack.rooster.name}</b>, dono: <b>{giveBack.owner}</b> })}</p>
            <div className="row gap center-row">
              <button className="btn" onClick={() => setGiveBack(null)}>
                {t('Cancelar')}
              </button>
              <button
                className="btn btn-danger"
                disabled={busy === giveBack.id}
                onClick={() => {
                  const l = giveBack
                  setGiveBack(null)
                  run(l, () => api.aluguel.giveBack(l.id), t('{nome} voltou para o dono.', { nome: l.rooster.name }))
                }}
              >
                {t('Devolver')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
