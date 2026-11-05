// 🏪 Feira: compra e venda entre jogadores + presentes.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { RoosterSvg } from '../components/RoosterSvg'
import { Empty, Modal, PageHead, Price, RarityTag, RoosterCard, Tabs, go } from '../components/ui'
import { ACC_BY_ID, SKIN_BY_ID } from '../game/data'
import { FEIRA, feiraFee, feiraPriceOk, suggested, suggestedMilho, type FeiraData, type FeiraKind, type FeiraListing, type FeiraPlayer } from '../game/feira'
import { fmt } from '../game/rooster'
import { useGame } from '../game/store'
import type { Currency, GameState, Rooster } from '../game/types'
import { OVO_EM_MILHO } from '../game/worth'
import { locale, t, tn, tp, tx } from '../i18n'
import { Aluguel } from './FeiraAluguel'
import { roosterLock } from '../game/galonft'

type Tab = 'comprar' | 'vender' | 'meus' | 'presentes' | 'aluguel'
const TABS: Tab[] = ['comprar', 'vender', 'meus', 'presentes', 'aluguel']

const coin = (c: Currency) => (c === 'milho' ? '🌽' : '🥚')
const money = (v: number, c: Currency) => `${coin(c)} ${fmt(v)}`
const hoursLeft = (ms: number) => Math.max(0, Math.ceil((ms - Date.now()) / 3600_000))
const when = (ms: number) => new Date(ms).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })

const KIND_LABEL = (): Record<FeiraKind, string> => ({ galo: t('🐓 Galos'), acessorio: t('🎩 Acessórios'), skin: t('🎨 Skins') })

/** Nome do item para mostrar (galo, acessório ou skin). */
function itemName(kind: FeiraKind, id: string, ro?: Rooster) {
  if (kind === 'galo') return ro?.name ?? t('Galo')
  const it = kind === 'acessorio' ? ACC_BY_ID[id] : SKIN_BY_ID[id]
  return it ? `${it.emoji} ${it.name}` : id
}

/** Desenho do acessório ou da skin (o galo usa o RoosterCard). */
function ItemArt({ kind, id, size = 110 }: { kind: FeiraKind; id: string; size?: number }) {
  if (kind === 'acessorio') {
    const a = ACC_BY_ID[id]
    return <div className="shop-art">{a ? <RoosterSvg breedId="caipira" equipped={{ [a.slot]: a.id }} size={size} anim="none" /> : null}</div>
  }
  return (
    <div className="shop-art">
      <RoosterSvg breedId="caipira" skin={id} size={size} anim="none" />
    </div>
  )
}

export function Feira({ tab: tabParam }: { tab?: string }) {
  const tab = (TABS.includes(tabParam as Tab) ? tabParam : 'comprar') as Tab
  const [data, setData] = useState<FeiraData | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(() => {
    api.feira
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

  const active = data?.mine.filter((l) => l.status === 'ativo').length ?? 0
  return (
    <>
      <PageHead title={t('🏪 Feira')} subtitle={t('Compre e venda galos, acessórios e skins com outros criadores. A Feira fica com {n}% de cada venda.', { n: FEIRA.feePct * 100 })} />
      <Tabs
        value={tab}
        onChange={(v) => go(`/feira/${v}`)}
        tabs={[
          { id: 'comprar', label: t('🛒 Comprar') },
          { id: 'vender', label: t('💰 Vender') },
          { id: 'meus', label: active ? t('📋 Meus anúncios ({n})', { n: active }) : t('📋 Meus anúncios') },
          { id: 'presentes', label: t('🎁 Presentes') },
          { id: 'aluguel', label: t('🔑 Aluguel') },
        ]}
      />
      {err && <div className="warn">{err}</div>}
      {!data && !err && <div className="spinner" />}
      {data && tab === 'comprar' && <Comprar data={data} reload={load} />}
      {data && tab === 'vender' && <Vender data={data} reload={load} />}
      {data && tab === 'meus' && <Meus data={data} reload={load} />}
      {data && tab === 'presentes' && <Presentes data={data} reload={load} />}
      {tab === 'aluguel' && <Aluguel />}
    </>
  )
}

// ---------------- Comprar ----------------

function Comprar({ data, reload }: { data: FeiraData; reload: () => void }) {
  const { state, actions, toast } = useGame()
  const s = state!
  const [kind, setKind] = useState<FeiraKind | 'todos'>('todos')
  const [cur, setCur] = useState<Currency | 'todos'>('todos')
  const [sort, setSort] = useState<'novos' | 'baratos'>('novos')
  const [buying, setBuying] = useState<FeiraListing | null>(null)
  const [busy, setBusy] = useState(false)

  const list = useMemo(() => {
    const l = data.listings.filter((x) => (kind === 'todos' || x.kind === kind) && (cur === 'todos' || x.currency === cur))
    const val = (x: FeiraListing) => (x.currency === 'ovo' ? x.price * OVO_EM_MILHO : x.price)
    return [...l].sort((a, b) => (sort === 'novos' ? b.createdAt - a.createdAt : val(a) - val(b)))
  }, [data.listings, kind, cur, sort])

  const buy = async () => {
    if (!buying) return
    setBusy(true)
    const r = await actions.feiraOp(() => api.feira.buy(buying.id, buying.price, buying.currency))
    setBusy(false)
    if (r.ok) toast(t('🏪 Negócio fechado! {item} é seu.', { item: itemName(buying.kind, buying.itemId, buying.rooster) }), 'ok')
    else toast(tx(r.error), 'erro')
    setBuying(null)
    reload()
  }

  const canAfford = (l: FeiraListing) => (l.currency === 'milho' ? s.milho : s.ovos) >= l.price
  const blocked = (l: FeiraListing) =>
    l.kind === 'galo' && s.roosters.length >= FEIRA.maxRoosters ? t('Galinheiro lotado') : l.kind === 'skin' && s.skins.includes(l.itemId) ? t('Você já tem') : null

  return (
    <>
      <div className="chips">
        {(['todos', 'galo', 'acessorio', 'skin'] as const).map((k) => (
          <button key={k} className={`chip clickable ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>
            {k === 'todos' ? t('Todos') : KIND_LABEL()[k]}
          </button>
        ))}
        <span className="feira-sep" />
        {(['todos', 'milho', 'ovo'] as const).map((c) => (
          <button key={c} className={`chip clickable ${cur === c ? 'active' : ''}`} onClick={() => setCur(c)}>
            {c === 'todos' ? t('🌽+🥚') : c === 'milho' ? t('🌽 Milho') : t('🥚 Ovos')}
          </button>
        ))}
        <span className="feira-sep" />
        <button className={`chip clickable ${sort === 'novos' ? 'active' : ''}`} onClick={() => setSort('novos')}>
          {t('🆕 Mais novos')}
        </button>
        <button className={`chip clickable ${sort === 'baratos' ? 'active' : ''}`} onClick={() => setSort('baratos')}>
          {t('💸 Mais baratos')}
        </button>
      </div>

      {list.length === 0 ? (
        <Empty
          emoji="🏪"
          title={t('Nenhum anúncio por aqui')}
          text={t('Seja o primeiro a vender! Anuncie um galo, acessório ou skin.')}
          action={
            <button className="btn btn-primary" onClick={() => go('/feira/vender')}>
              {t('💰 Vender na Feira')}
            </button>
          }
        />
      ) : (
        <div className="grid-shop feira-grid">
          {list.map((l) => {
            const why = blocked(l)
            const foot = (
              <div className="feira-foot">
                <span className="tiny muted">
                  {l.sellerAvatar} {l.seller} · {tp('{n}h restante', '{n}h restantes', hoursLeft(l.expiresAt))}
                </span>
                <button
                  className="btn btn-primary full"
                  disabled={!!why}
                  onClick={(e) => {
                    e.stopPropagation()
                    setBuying(l)
                  }}
                >
                  {why ?? (
                    <>
                      {t('Comprar')} · <Price value={l.price} currency={l.currency} />
                    </>
                  )}
                </button>
              </div>
            )
            if (l.kind === 'galo' && l.rooster) return <RoosterCard key={l.id} ro={l.rooster} compact footer={foot} />
            const it = l.kind === 'acessorio' ? ACC_BY_ID[l.itemId] : SKIN_BY_ID[l.itemId]
            return (
              <div key={l.id} className={`card shop-item rar-${it?.rarity ?? 'comum'}`}>
                <ItemArt kind={l.kind} id={l.itemId} />
                <b>{itemName(l.kind, l.itemId)}</b>
                <div className="row-between">
                  {it && <RarityTag rarity={it.rarity} />}
                  <span className="tiny muted">{l.kind === 'acessorio' ? t('Acessório') : t('Skin')}</span>
                </div>
                {foot}
              </div>
            )
          })}
        </div>
      )}

      <Modal open={!!buying} onClose={() => setBuying(null)} title={t('🏪 Confirmar compra')}>
        {buying && (
          <div className="center">
            <p>
              {tn('Comprar {item} de {nome} por {preco}?', {
                item: <b>{itemName(buying.kind, buying.itemId, buying.rooster)}</b>,
                nome: <b>{buying.seller}</b>,
                preco: <b>{money(buying.price, buying.currency)}</b>,
              })}
            </p>
            <p className="tiny muted">
              {t('Seu saldo: {saldo}', { saldo: money(buying.currency === 'milho' ? s.milho : s.ovos, buying.currency) })}
              {' · '}
              {t('Valor de loja: {v}', { v: money(suggested(suggestedMilho(buying.kind, buying.itemId, buying.rooster), buying.currency), buying.currency) })}
            </p>
            {!canAfford(buying) && <p className="neg tiny">{buying.currency === 'milho' ? t('Milho insuficiente 🌽') : t('Ovos de ouro insuficientes 🥚')}</p>}
            <div className="row gap center-row">
              <button className="btn" onClick={() => setBuying(null)}>
                {t('Cancelar')}
              </button>
              <button className="btn btn-primary" disabled={busy || !canAfford(buying)} onClick={buy}>
                {t('Comprar')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

// ---------------- Escolher item (vender / presentear) ----------------

interface Pick {
  kind: FeiraKind
  id: string
  rooster?: Rooster
}

function ItemPicker({ s, value, onPick }: { s: GameState; value: Pick | null; onPick: (p: Pick | null) => void }) {
  const [kind, setKind] = useState<FeiraKind>(value?.kind ?? 'galo')
  const accs = Object.entries(s.accessories).filter(([id, n]) => n > 0 && ACC_BY_ID[id])
  const skins = s.skins.filter((id) => SKIN_BY_ID[id] && !s.roosters.some((r) => r.skin === id))
  return (
    <>
      <div className="chips">
        {(['galo', 'acessorio', 'skin'] as const).map((k) => (
          <button
            key={k}
            className={`chip clickable ${kind === k ? 'active' : ''}`}
            onClick={() => {
              setKind(k)
              onPick(null)
            }}
          >
            {KIND_LABEL()[k]}
          </button>
        ))}
      </div>
      {kind === 'galo' &&
        (s.roosters.length <= 1 ? (
          <p className="muted">{t('Você precisa ter pelo menos um galo. Arrume outro antes de vender este.')}</p>
        ) : (
          <div className="grid-cards">
            {s.roosters.map((r) => {
              // Ninho, NFT ou aluguel: não dá para vender aqui
              const lockWhy = roosterLock(s, r)
              return (
                <RoosterCard key={r.id} ro={r} compact selected={value?.id === r.id} onClick={lockWhy ? undefined : () => onPick({ kind: 'galo', id: r.id, rooster: r })} footer={lockWhy ? <div className="tiny muted">🔒 {lockWhy}</div> : undefined} />
              )
            })}
          </div>
        ))}
      {kind === 'acessorio' &&
        (accs.length === 0 ? (
          <p className="muted">{t('Nenhum acessório guardado. Tire do galo no Galinheiro para poder vender.')}</p>
        ) : (
          <div className="apply-grid">
            {accs.map(([id, n]) => (
              <button key={id} className={`apply-item ${value?.id === id ? 'selected' : ''}`} onClick={() => onPick({ kind: 'acessorio', id })}>
                <span className="shop-emoji">{ACC_BY_ID[id].emoji}</span>
                <b className="tiny">{ACC_BY_ID[id].name}</b>
                <span className="tiny muted">×{n}</span>
              </button>
            ))}
          </div>
        ))}
      {kind === 'skin' &&
        (skins.length === 0 ? (
          <p className="muted">{t('Nenhuma skin livre. Tire a skin do galo para poder vender.')}</p>
        ) : (
          <div className="apply-grid">
            {skins.map((id) => (
              <button key={id} className={`apply-item ${value?.id === id ? 'selected' : ''}`} onClick={() => onPick({ kind: 'skin', id })}>
                <RoosterSvg breedId="caipira" skin={id} size={80} anim="none" />
                <b className="tiny">
                  {SKIN_BY_ID[id].emoji} {SKIN_BY_ID[id].name}
                </b>
              </button>
            ))}
          </div>
        ))}
    </>
  )
}

// ---------------- Vender ----------------

function Vender({ data, reload }: { data: FeiraData; reload: () => void }) {
  const { state, actions, toast } = useGame()
  const s = state!
  // Atalho do Galinheiro: #/feira/vender?galo=ID
  const pre = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('galo')
  const preRo = pre ? s.roosters.find((r) => r.id === pre) : undefined
  const [pick, setPick] = useState<Pick | null>(preRo && s.roosters.length > 1 ? { kind: 'galo', id: preRo.id, rooster: preRo } : null)
  const [currency, setCurrency] = useState<Currency>('milho')
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)

  const sugMilho = pick ? suggestedMilho(pick.kind, pick.id, pick.rooster) : 0
  const sug = suggested(sugMilho, currency)
  useEffect(() => {
    if (pick) setPrice(String(sug))
  }, [pick?.id, currency]) // eslint-disable-line react-hooks/exhaustive-deps

  const n = Number(price)
  const ok = feiraPriceOk(n, currency)
  const fee = ok ? feiraFee(n) : 0
  const active = data.mine.filter((l) => l.status === 'ativo').length
  const full = active >= FEIRA.maxListings

  const submit = async () => {
    if (!pick || !ok) return
    setBusy(true)
    const r = await actions.feiraOp(() => api.feira.list(pick.kind, pick.id, n, currency))
    setBusy(false)
    if (r.ok) {
      toast(t('🏪 Anúncio publicado! Fica {n}h na Feira.', { n: FEIRA.ttlHours }), 'ok')
      setPick(null)
      reload()
      go('/feira/meus')
    } else toast(tx(r.error), 'erro')
  }

  return (
    <div className="feira-sell">
      <div>
        <h3 className="section-title">{t('1. Escolha o que vender')}</h3>
        <ItemPicker s={s} value={pick} onPick={setPick} />
      </div>
      <div className="card card-form feira-form">
        <h3>{t('2. Defina o preço')}</h3>
        {!pick ? (
          <p className="muted">{t('Escolha um item ao lado.')}</p>
        ) : (
          <>
            <div className="row gap">
              {pick.kind === 'galo' && pick.rooster ? <RoosterSvg breedId={pick.rooster.breedId} size={70} anim="none" /> : <ItemArt kind={pick.kind} id={pick.id} size={70} />}
              <b>{itemName(pick.kind, pick.id, pick.rooster)}</b>
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
                {t('Preço')} <span className="tiny muted">· {t('sugerido: {v}', { v: money(sug, currency) })}</span>
              </span>
              <div className="copy-row">
                <input type="number" min={FEIRA.min[currency]} max={FEIRA.max[currency]} step={1} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
                <button className="btn btn-sm" onClick={() => setPrice(String(sug))}>
                  {t('Sugerido')}
                </button>
              </div>
            </label>
            {price !== '' && !ok && <p className="tiny neg">{t('Preço entre {min} e {max}.', { min: money(FEIRA.min[currency], currency), max: money(FEIRA.max[currency], currency) })}</p>}
            {ok && <p className="feira-net">{tn('Você recebe {v} após a taxa de {p}%', { v: <b>{money(n - fee, currency)}</b>, p: FEIRA.feePct * 100 })}</p>}
            {pick.kind === 'galo' && <p className="tiny muted">{t('Os acessórios voltam para o seu inventário e a skin fica com você.')}</p>}
            <p className="tiny muted">{t('O item sai do seu galinheiro enquanto está à venda. Se ninguém comprar em {n}h, ele volta.', { n: FEIRA.ttlHours })}</p>
            {full && <p className="tiny neg">{t('Você já tem {n} anúncios ativos. Cancele algum ou espere vender.', { n: FEIRA.maxListings })}</p>}
            <button className="btn btn-primary full" disabled={!ok || busy || full} onClick={submit}>
              {t('🏪 Anunciar por {v}', { v: ok ? money(n, currency) : '—' })}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------- Meus anúncios ----------------

const STATUS = (): Record<FeiraListing['status'], string> => ({ ativo: t('🟢 À venda'), vendido: t('✅ Vendido'), cancelado: t('↩️ Cancelado'), devolvido: t('⌛ Venceu') })

function Meus({ data, reload }: { data: FeiraData; reload: () => void }) {
  const { actions, toast } = useGame()
  const [busy, setBusy] = useState<string | null>(null)
  const active = data.mine.filter((l) => l.status === 'ativo')
  const past = data.mine.filter((l) => l.status !== 'ativo')

  const cancel = async (l: FeiraListing) => {
    setBusy(l.id)
    const r = await actions.feiraOp(() => api.feira.cancel(l.id))
    setBusy(null)
    if (r.ok) toast(t('{item} voltou para você.', { item: itemName(l.kind, l.itemId, l.rooster) }), 'ok')
    else toast(tx(r.error), 'erro')
    reload()
  }

  const row = (l: FeiraListing) => (
    <div key={l.id} className="list-row">
      <span className="big-emoji">{l.kind === 'galo' ? '🐓' : l.kind === 'acessorio' ? ACC_BY_ID[l.itemId]?.emoji : SKIN_BY_ID[l.itemId]?.emoji}</span>
      <div className="grow">
        <b>{itemName(l.kind, l.itemId, l.rooster)}</b>
        <div className="tiny muted">
          {STATUS()[l.status]}
          {l.status === 'ativo' && (l.expiresAt > Date.now() ? ` · ${tp('{n}h restante', '{n}h restantes', hoursLeft(l.expiresAt))}` : ` · ${t('venceu, volta quando houver espaço')}`)}
          {l.status === 'vendido' && l.buyer && ` · ${t('para {nome}', { nome: l.buyer })}`}
          {l.closedAt && ` · ${when(l.closedAt)}`}
        </div>
      </div>
      <div className="right">
        <Price value={l.price} currency={l.currency} />
        {l.status === 'vendido' && <div className="tiny pos">{t('+{v} líquido', { v: money(l.price - feiraFee(l.price), l.currency) })}</div>}
      </div>
      {l.status === 'ativo' && (
        <button className="btn btn-sm" disabled={busy === l.id} onClick={() => cancel(l)}>
          {t('Cancelar')}
        </button>
      )}
    </div>
  )

  return (
    <>
      <h3 className="section-title">{t('À venda ({n}/{max})', { n: active.length, max: FEIRA.maxListings })}</h3>
      {active.length === 0 ? <p className="muted">{t('Nada à venda agora.')}</p> : <div className="list">{active.map(row)}</div>}
      <h3 className="section-title">{t('Histórico')}</h3>
      {past.length === 0 ? <p className="muted">{t('Nenhuma venda ainda.')}</p> : <div className="list">{past.map(row)}</div>}
      {data.notices.length > 0 && (
        <>
          <h3 className="section-title">{t('🔔 Avisos')}</h3>
          <div className="list">
            {data.notices.map((n) => (
              <div key={n.id} className="list-row">
                <div className="grow">{tx(n.text)}</div>
                <span className="tiny muted">{when(n.at)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

// ---------------- Presentes ----------------

function Presentes({ data, reload }: { data: FeiraData; reload: () => void }) {
  const { state, actions, toast } = useGame()
  const s = state!
  const [q, setQ] = useState('')
  const [found, setFound] = useState<FeiraPlayer[]>([])
  const [to, setTo] = useState<FeiraPlayer | null>(null)
  const [pick, setPick] = useState<Pick | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) return setFound([])
    const timer = setTimeout(() => {
      api.feira
        .players(q.trim())
        .then((r) => setFound(r.players))
        .catch(() => setFound([]))
    }, 300)
    return () => clearTimeout(timer)
  }, [q])

  const left = FEIRA.giftsPerDay - data.giftsToday
  const send = async () => {
    if (!to || !pick) return
    setBusy(true)
    const r = await actions.feiraOp(() => api.feira.gift(to.id, pick.kind, pick.id))
    setBusy(false)
    setConfirm(false)
    if (r.ok) {
      toast(t('🎁 Presente enviado para {nome}!', { nome: to.name }), 'ok')
      setPick(null)
      reload()
    } else toast(tx(r.error), 'erro')
  }

  return (
    <div className="feira-sell">
      <div>
        <h3 className="section-title">{t('1. Para quem?')}</h3>
        <label className="field">
          <span>{t('Nome do criador ou ID do jogador')}</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Ex.: Zé do Galo')} spellCheck={false} />
        </label>
        <div className="list">
          {found.map((p) => (
            <button key={p.id} className={`list-row clickable-row feira-player ${to?.id === p.id ? 'current' : ''}`} onClick={() => setTo(p)}>
              <span className="big-emoji">{p.avatar}</span>
              <div className="grow">
                <b>{p.name}</b>
                <div className="tiny muted mono">
                  {t('ID {id}', { id: p.id.slice(0, 8) })} · {tp('{n} galo', '{n} galos', p.roosters)}
                </div>
              </div>
              {to?.id === p.id && <span>✅</span>}
            </button>
          ))}
          {q.trim().length >= 2 && found.length === 0 && <p className="tiny muted">{t('Ninguém com esse nome.')}</p>}
        </div>
        <h3 className="section-title">{t('2. O que mandar?')}</h3>
        <ItemPicker s={s} value={pick} onPick={setPick} />
      </div>
      <div className="card card-form feira-form">
        <h3>{t('🎁 Embrulhar presente')}</h3>
        <p className="tiny muted">{t('O presente chega na hora. O embrulho custa 🥚 {n}. Até {max} presentes por dia.', { n: FEIRA.giftFee, max: FEIRA.giftsPerDay })}</p>
        <p className="tiny">{tp('Você ainda pode mandar {n} presente hoje.', 'Você ainda pode mandar {n} presentes hoje.', Math.max(0, left))}</p>
        <p>
          {to ? (
            <>
              {t('Para:')} <b>{to.avatar} {to.name}</b>
            </>
          ) : (
            <span className="muted">{t('Escolha um criador.')}</span>
          )}
        </p>
        <p>{pick ? <b>{itemName(pick.kind, pick.id, pick.rooster)}</b> : <span className="muted">{t('Escolha um item.')}</span>}</p>
        <button className="btn btn-gold full" disabled={!to || !pick || left <= 0 || s.ovos < FEIRA.giftFee} onClick={() => setConfirm(true)}>
          {t('🎁 Enviar presente (🥚 {n})', { n: FEIRA.giftFee })}
        </button>
        {s.ovos < FEIRA.giftFee && <p className="tiny neg">{t('Ovos de ouro insuficientes 🥚')}</p>}
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title={t('🎁 Confirmar presente')}>
        {to && pick && (
          <div className="center">
            <p>{tn('Mandar {item} para {nome}? Não dá para desfazer.', { item: <b>{itemName(pick.kind, pick.id, pick.rooster)}</b>, nome: <b>{to.name}</b> })}</p>
            <p className="tiny muted">{t('Embrulho: 🥚 {n}', { n: FEIRA.giftFee })}</p>
            <div className="row gap center-row">
              <button className="btn" onClick={() => setConfirm(false)}>
                {t('Cancelar')}
              </button>
              <button className="btn btn-gold" disabled={busy} onClick={send}>
                {t('Enviar')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
