import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError, type GaloLook, type KycStatus, type Web3Asset, type Web3Info, type Web3Nft, type Web3Tx } from '../api'
import { Empty, Modal, PageHead, Picker, RarityTag, Tabs } from '../components/ui'
import { ACC_BY_ID, BREED_BY_ID, SKIN_BY_ID } from '../game/data'
import { GaloNftPanel, NftArt } from './GaloNft'
import { DepositoUsdc } from './Deposito'
import { TokenPrizes } from './Torneios'
import { fmt } from '../game/rooster'
import { useGame } from '../game/store'
import type { Rarity } from '../game/types'
import { locale, t, tn, tx } from '../i18n'

// ---------- Utilitários compartilhados com o Mercado ----------

/** Nome/emoji/raridade do item de um NFT a partir das tabelas do jogo. */
export function nftItem(kind: 'acc' | 'skin' | 'galo', itemId: string, ro?: GaloLook): { emoji: string; name: string; rarity: Rarity; kindLabel: string } {
  if (kind === 'galo') return { emoji: '🐓', name: ro?.name ?? t('Galo'), rarity: BREED_BY_ID[ro?.breedId ?? '']?.rarity ?? 'comum', kindLabel: t('Galo NFT') }
  const it = kind === 'acc' ? ACC_BY_ID[itemId] : SKIN_BY_ID[itemId]
  return {
    emoji: it?.emoji ?? '❔',
    name: it?.name ?? itemId,
    rarity: it?.rarity ?? 'lendario',
    kindLabel: kind === 'acc' ? t('Acessório') : t('Skin'),
  }
}

export const num = (v: number | string | null | undefined) => {
  const n = typeof v === 'string' ? Number(v) : (v ?? 0)
  return Number.isFinite(n) ? n : 0
}
export const usdc = (v: number | string | null | undefined) => num(v).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const eth = (v: number | string | null | undefined) => num(v).toLocaleString(locale(), { maximumFractionDigits: 5 })
export const txHash = (tx: Web3Tx | undefined): string | null => (!tx ? null : typeof tx === 'string' ? tx : tx.hash)
export const shortAddr = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)
export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : tx((e as Error)?.message) || t('Erro de conexão'))

export function TestnetBadge() {
  return (
    <span className="testnet-badge" title={t('Rede de teste: os tokens não têm valor real.')}>
      🧪 {t('TESTNET')}
    </span>
  )
}

/** Toast com link para a transação no explorador. */
export function useTxToast() {
  const { toast } = useGame()
  return useCallback((msg: string, tx?: Web3Tx) => {
    const h = txHash(tx)
    toast(h ? `${msg} · ${shortAddr(h)}` : msg, 'ok')
  }, [toast])
}

const KYC_LABEL: Record<KycStatus, string> = {
  none: t('Não verificado'),
  pending: t('Verificação em análise'),
  verified: t('Verificado'),
  rejected: t('Verificação recusada'),
}
export function KycBadge({ status }: { status: KycStatus }) {
  const cls = status === 'verified' ? 'good' : status === 'rejected' ? 'bad' : status === 'pending' ? 'wait' : ''
  return <span className={`ud-badge kyc-badge ${cls}`}>{status === 'verified' ? '✅' : status === 'pending' ? '⏳' : status === 'rejected' ? '⛔' : '🪪'} {KYC_LABEL[status] ?? status}</span>
}

const TX_KIND: Record<string, string> = {
  'bridge-out': t('🌉 Jogo → Carteira'),
  'bridge-in': t('🌉 Carteira → Jogo'),
  send: t('📤 Envio'),
  mint: t('✨ NFT criado'),
  unmint: t('🐓 Galo NFT de volta ao jogo'),
  list: t('🏷️ Posto à venda'),
  cancel: t('↩️ Venda cancelada'),
  buy: t('🛒 Compra no Mercado'),
  deposit: t('💵 Depósito → ovos'),
}
const TX_STATUS: Record<string, string> = { ok: t('concluída'), pending: t('pendente'), failed: t('falhou'), 'burned-uncredited': t('em análise pelo suporte'), 'paid-unmoved': t('em análise pelo suporte') }
const ASSET_LABEL: Record<Web3Asset, string> = { egg: t('🥚 Ovos de ouro (EGG)'), corn: t('🌽 Milho (CORN)'), usdc: t('💵 USDC') }

// ---------- Página ----------

export function Carteira() {
  const { wallet, actions, toast } = useGame()
  const [info, setInfo] = useState<Web3Info | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const okTx = useTxToast()

  const load = useCallback(async () => {
    try {
      setInfo(await api.web3())
      setFailed(false)
    } catch (e) {
      if (e instanceof ApiError && (e.status === 503 || e.status === 404)) setInfo({ enabled: false })
      else setFailed(true)
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  /** Roda uma operação: sincroniza o save antes, recarrega tudo depois. */
  const run = useCallback(
    async <R,>(fn: () => Promise<R>, ok: (r: R) => void, touchesSave: boolean): Promise<boolean> => {
      setBusy(true)
      try {
        if (touchesSave) await actions.reloadFromServer() // envia progresso pendente antes do servidor mexer no save
        const r = await fn()
        ok(r)
        if (touchesSave) await actions.reloadFromServer()
        await load()
        return true
      } catch (e) {
        toast(errMsg(e), 'erro')
        return false
      } finally {
        setBusy(false)
      }
    },
    [actions, load, toast],
  )

  if (!info)
    return (
      <>
        <PageHead title={t('👛 Carteira')} right={<TestnetBadge />} />
        {failed ? (
          <Empty emoji="📡" title={t('Não deu para carregar a carteira.')} action={<button className="btn" onClick={load}>{t('Tentar de novo')}</button>} />
        ) : (
          <div className="center"><div className="spinner big" /></div>
        )}
      </>
    )

  if (!info.enabled || !info.wallet)
    return (
      <>
        <PageHead title={t('👛 Carteira')} right={<TestnetBadge />} />
        <div className="card center web3-soon">
          <div className="empty-emoji">🚧</div>
          <h2>{t('Em breve!')}</h2>
          <p className="muted">{t('A carteira cripto está chegando: leve seus Ovos de ouro e Milho para fora do jogo como tokens, transforme itens lendários em NFT e negocie no Mercado.')}</p>
          <p className="tiny muted">{t('Por enquanto tudo vai rodar numa rede de teste, sem valor real.')}</p>
        </div>
      </>
    )

  const w = info.wallet
  const explorer = info.chain?.explorer?.replace(/\/$/, '') ?? ''
  const kyc = info.kyc ?? 'none'
  const feeBps = info.feeBps ?? 1000

  return (
    <>
      <PageHead
        title={t('👛 Carteira')}
        subtitle={tn('Sua carteira na rede {rede}. Os tokens são de teste e não têm valor real.', { rede: <b>{info.chain?.name ?? 'Polygon Amoy'}</b> })}
        right={<TestnetBadge />}
      />

      {/* 💎 NFTs em destaque no topo — é o que o jogador mais quer ver ao abrir a carteira. */}
      <GaloNftPanel info={info} busy={busy} run={run} okTx={okTx} />

      <MyItems info={info} busy={busy} run={run} okTx={okTx} feeBps={feeBps} />

      {/* Endereço + saldos */}
      <div className="card web3-address">
        <span className="tiny muted">{t('Seu endereço')}</span>
        <div className="copy-row">
          <input readOnly value={w.address} onFocus={(e) => e.target.select()} aria-label={t('Seu endereço')} />
          <CopyBtn text={w.address} />
        </div>
        {explorer && (
          <a className="tiny" href={`${explorer}/address/${w.address}`} target="_blank" rel="noreferrer">
            🔎 {t('Ver no explorador')} ↗
          </a>
        )}
      </div>

      <div className="two-col web3-balances">
        <div className="card">
          <h3>⛓️ {t('Na carteira (on-chain)')}</h3>
          <div className="stats-list">
            <div><span>🥚 EGG</span><b>{fmt(num(w.egg))}</b></div>
            <div><span>🌽 CORN</span><b>{fmt(num(w.corn))}</b></div>
            <div><span>💵 USDC</span><b>{usdc(w.usdc)}</b></div>
            <div className="tiny muted"><span>⛽ {t('POL para taxa de rede')}</span><span>{eth(w.eth)}</span></div>
          </div>
        </div>
        <div className="card">
          <h3>🎮 {t('No jogo')}</h3>
          <div className="stats-list">
            <div><span>🥚 {t('Ovos de ouro')}</span><b>{fmt(wallet?.ovos ?? 0)}</b></div>
            <div><span>🌽 {t('Milho')}</span><b>{fmt(wallet?.milho ?? 0)}</b></div>
          </div>
          <p className="tiny muted">{t('Use a ponte abaixo para mover entre o jogo e a carteira.')}</p>
        </div>
      </div>
      <TokenPrizes />

      <div className="two-col web3-panels">
        <Bridge info={info} busy={busy} run={run} okTx={okTx} />
        <Send info={info} kyc={kyc} busy={busy} run={run} okTx={okTx} />
      </div>

      {/* 💵 Depósito USDC → ovos (src/pages/Deposito.tsx) */}
      <DepositoUsdc info={info} busy={busy} run={run} okTx={okTx} />

      {(info.recent?.length ?? 0) > 0 && (
        <>
          <h3 className="section-title">🧾 {t('Últimas transações')}</h3>
          <div className="list">
            {info.recent!.map((r) => (
              <div key={r.id} className="list-row web3-tx">
                <span className="grow">
                  <b>{TX_KIND[r.kind] ?? r.kind}</b> <span className="tiny muted">{r.amount} {r.asset.startsWith('nft:') ? `NFT #${r.asset.slice(4)}` : r.asset.toUpperCase()}</span>
                  <br />
                  <span className="tiny muted">{new Date(r.at).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })}</span>
                </span>
                <span className={`tiny status-${r.status === 'ok' ? 'ganhou' : r.status === 'pending' ? 'pendente' : 'perdeu'}`}>{TX_STATUS[r.status] ?? r.status}</span>{/* i18n-ok */}
                {r.url && (
                  <a className="tiny" href={r.url} target="_blank" rel="noreferrer">↗</a>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

type Run = <R>(fn: () => Promise<R>, ok: (r: R) => void, touchesSave: boolean) => Promise<boolean>
export type PanelProps = { info: Web3Info; busy: boolean; run: Run; okTx: (msg: string, tx?: Web3Tx) => void }

function CopyBtn({ text }: { text: string }) {
  const { toast } = useGame()
  return (
    <button
      className="btn btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          toast(t('Endereço copiado!'), 'ok')
        } catch {
          toast(t('Não deu para copiar. Selecione e copie manualmente.'), 'erro')
        }
      }}
    >
      📋 {t('Copiar')}
    </button>
  )
}

/** Converte o texto digitado em quantidade (aceita vírgula). */
const parseAmount = (v: string) => Number(v.replace(',', '.'))

// ---------- Ponte jogo ⇄ carteira ----------

function Bridge({ info, busy, run, okTx }: PanelProps) {
  const { wallet } = useGame()
  const [dir, setDir] = useState<'out' | 'in'>('out')
  const [token, setToken] = useState<'egg' | 'corn'>('egg')
  const [amount, setAmount] = useState('')
  const [confirm, setConfirm] = useState(false)
  const w = info.wallet!
  const max = dir === 'out' ? (token === 'egg' ? (wallet?.ovos ?? 0) : (wallet?.milho ?? 0)) : num(token === 'egg' ? w.egg : w.corn)
  const n = Math.floor(parseAmount(amount))
  const valid = Number.isFinite(n) && n > 0 && n <= max
  const cap = dir === 'out' ? capFor(info.caps, 'bridgeOut', token) : null
  const sym = token === 'egg' ? 'EGG' : 'CORN'
  const label = token === 'egg' ? t('🥚 Ovos de ouro') : t('🌽 Milho')

  return (
    <div className="card">
      <h3>🌉 {t('Ponte')}</h3>
      <Tabs
        value={dir}
        onChange={(v) => {
          setDir(v)
          setAmount('')
        }}
        tabs={[
          { id: 'out', label: t('Jogo → Carteira') },
          { id: 'in', label: t('Carteira → Jogo') },
        ]}
      />
      <div className="chips">
        {(['egg', 'corn'] as const).map((k) => (
          <button key={k} className={`chip clickable ${token === k ? 'active' : ''}`} onClick={() => setToken(k)}>
            {k === 'egg' ? t('🥚 Ovos de ouro') : t('🌽 Milho')}
          </button>
        ))}
      </div>
      <label className="field">
        <span>{t('Quantidade')} <span className="tiny muted">· {t('disponível: {n}', { n: fmt(max) })}</span></span>
        <div className="copy-row">
          <input type="number" min={1} step={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          <button className="btn btn-sm" onClick={() => setAmount(String(Math.floor(max)))} disabled={max <= 0}>
            {t('Máx.')}
          </button>
        </div>
      </label>
      {amount !== '' && !valid && <p className="tiny neg">{n > max ? t('Saldo insuficiente.') : t('Digite uma quantidade válida.')}</p>}
      <button className="btn btn-primary full" disabled={!valid || busy} onClick={() => setConfirm(true)}>
        {dir === 'out' ? t('Enviar para a carteira') : t('Trazer para o jogo')}
      </button>
      <p className="tiny muted">{dir === 'out' ? t('Os itens saem do jogo e viram tokens na sua carteira.') : t('Os tokens são queimados e voltam como saldo no jogo.')}</p>
      {cap && <p className="tiny muted">{t('Limite diário: {usado} de {n}', { usado: fmt(cap.used), n: fmt(cap.cap) })}</p>}

      <Modal open={confirm} onClose={() => setConfirm(false)} title={'🌉 ' + t('Confirmar ponte')}>
        <div className="center">
          <p className="reward-big">
            {dir === 'out' ? `${label} ${fmt(n)} → ${fmt(n)} ${sym}` : `${fmt(n)} ${sym} → ${label} ${fmt(n)}`}
          </p>
          <p className="muted">
            {dir === 'out'
              ? t('{n} sairão do seu saldo no jogo e virarão {n} {sym}, um token na rede de teste Polygon Amoy, na sua carteira. Dá para trazer de volta quando quiser.', { n: fmt(n), sym })
              : t('{n} {sym} serão retirados da sua carteira (queimados) e voltarão como saldo no jogo.', { n: fmt(n), sym })}
          </p>
          <p className="tiny muted"><TestnetBadge /> {t('Rede de teste: os tokens não têm valor real.')}</p>
          <div className="row-center gap" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setConfirm(false)}>{t('Cancelar')}</button>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                const ok = await run(() => api.bridge(token, dir, n), (r) => okTx(t('Ponte concluída!'), r.tx), true)
                if (ok) {
                  setConfirm(false)
                  setAmount('')
                }
              }}
            >
              {busy ? t('Aguarde...') : t('Confirmar')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ---------- Enviar para endereço externo ----------

/** Limite diário e quanto já foi usado hoje (null = sem limite informado). */
function capFor(caps: Web3Info['caps'], kind: 'send' | 'bridgeOut', asset: Web3Asset): { cap: number; used: number } | null {
  const cap = caps?.[kind]?.[asset]
  return typeof cap === 'number' ? { cap, used: num(caps?.usedToday?.[kind]?.[asset]) } : null
}

function Send({ info, kyc, busy, run, okTx }: PanelProps & { kyc: KycStatus }) {
  const [asset, setAsset] = useState<Web3Asset>('egg')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [confirm, setConfirm] = useState(false)
  const w = info.wallet!
  const bal = num(asset === 'egg' ? w.egg : asset === 'corn' ? w.corn : w.usdc)
  const n = parseAmount(amount)
  const addrOk = /^0x[0-9a-fA-F]{40}$/.test(to.trim())
  const amtOk = Number.isFinite(n) && n > 0 && n <= bal && (asset === 'usdc' || Number.isInteger(n))
  const cap = capFor(info.caps, 'send', asset)
  const fmtAmt = (v: number) => (asset === 'usdc' ? usdc(v) : fmt(v))
  const verified = kyc === 'verified'

  return (
    <div className="card">
      <div className="row-between">
        <h3>📤 {t('Enviar')}</h3>
        <KycBadge status={kyc} />
      </div>
      {!verified ? (
        <div className="web3-gate">
          <p className="muted">{t('Para enviar tokens para fora (outro endereço), sua conta precisa ser verificada.')}</p>
          {kyc === 'pending' ? (
            <p className="tiny muted">⏳ {t('Recebemos seu pedido. Avisaremos quando a verificação terminar.')}</p>
          ) : (
            <>
              {kyc === 'rejected' && <p className="tiny neg">{t('A verificação anterior foi recusada. Você pode pedir de novo.')}</p>}
              <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api.kyc(), () => okTx(t('Pedido de verificação enviado!')), false)}>
                🪪 {t('Pedir verificação')}
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <label className="field">
            <span>{t('Moeda')}</span>
            <Picker
              value={asset}
              options={(['egg', 'corn', 'usdc'] as const).map((a) => ({ value: a, label: ASSET_LABEL[a] }))}
              onChange={(v) => { setAsset(v as Web3Asset); setAmount('') }}
            />
          </label>
          <label className="field">
            <span>{t('Para o endereço')}</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" spellCheck={false} autoCapitalize="off" autoCorrect="off" className="mono" />
          </label>
          {to !== '' && !addrOk && <p className="tiny neg">{t('Endereço inválido (precisa começar com 0x e ter 42 caracteres).')}</p>}
          <p className="tiny muted">{t('💡 Pode ser a carteira de outro jogador — o endereço dele fica em "Seu endereço". Ele recebe um aviso quando chegar.')}</p>
          <label className="field">
            <span>{t('Quantidade')} <span className="tiny muted">· {t('disponível: {n}', { n: fmtAmt(bal) })}</span></span>
            <div className="copy-row">
              <input type="number" min={0} step={asset === 'usdc' ? 0.01 : 1} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
              <button className="btn btn-sm" onClick={() => setAmount(String(bal))} disabled={bal <= 0}>{t('Máx.')}</button>
            </div>
          </label>
          {cap && <p className="tiny muted">{t('Limite diário de envio: {usado} de {n}', { usado: fmtAmt(cap.used), n: fmtAmt(cap.cap) })}</p>}
          <button className="btn btn-primary full" disabled={!addrOk || !amtOk || busy} onClick={() => setConfirm(true)}>
            {t('Revisar envio')}
          </button>
        </>
      )}

      <Modal open={confirm} onClose={() => setConfirm(false)} title={'📤 ' + t('Confirmar envio')}>
        <div className="center">
          <p className="reward-big">{fmtAmt(n)} {asset.toUpperCase()}</p>
          <p className="muted">{t('Para:')}</p>
          <p className="mono tiny web3-break">{to.trim()}</p>
          <div className="warn tiny">⚠️ {t('Transações na blockchain não podem ser desfeitas. Confira o endereço.')}</div>
          <div className="row-center gap" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setConfirm(false)}>{t('Cancelar')}</button>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                const ok = await run(() => api.send(asset, to.trim(), n), (r) => okTx(t('Envio feito!'), r.tx), false)
                if (ok) {
                  setConfirm(false)
                  setAmount('')
                }
              }}
            >
              {busy ? t('Aguarde...') : t('Enviar')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ---------- Meus itens: mint + venda ----------

function MyItems({ info, busy, run, okTx, feeBps }: PanelProps & { feeBps: number }) {
  const [mintKey, setMintKey] = useState<string | null>(null)
  const [sell, setSell] = useState<Web3Nft | null>(null)
  const [price, setPrice] = useState('')
  const mintable = (info.mintable ?? []).filter((m) => m.count > 0)
  const nfts = info.nfts ?? []
  const mintItem = mintable.find((m) => m.key === mintKey)
  const p = parseAmount(price)
  const sellFloor = sell?.floor ?? 0
  const sellSuggested = sell?.suggested ?? 0
  const priceOk = Number.isFinite(p) && p > 0 && (sellFloor <= 0 || p >= sellFloor)
  const fee = priceOk ? (p * feeBps) / 10000 : 0
  const feePct = (feeBps / 100).toLocaleString(locale(), { maximumFractionDigits: 2 })

  const card = (kind: 'acc' | 'skin' | 'galo', itemId: string, extra: ReactNode, key: string, ro?: GaloLook) => {
    const it = nftItem(kind, itemId, ro)
    return (
      <div key={key} className={`card shop-item web3-item rar-${it.rarity}`}>
        <NftArt kind={kind} itemId={itemId} rooster={ro} />
        <b>{it.name}</b>
        <div className="row gap wrap">
          <RarityTag rarity={it.rarity} />
          <span className="tiny muted">{it.kindLabel}</span>
        </div>
        {extra}
      </div>
    )
  }

  return (
    <>
      <h3 className="section-title">💎 {t('Meus itens')}</h3>
      <p className="tiny muted">{t('Itens lendários comprados com Ovos de ouro ou dinheiro podem virar NFT. Você continua usando o item no jogo enquanto o NFT for seu.')}</p>
      {mintable.length === 0 && nfts.length === 0 ? (
        <Empty emoji="🗝️" title={t('Nenhum item elegível ainda.')} text={t('Compre acessórios ou skins lendárias com Ovos de ouro para poder transformá-los em NFT.')} />
      ) : (
        <div className="grid-shop">
          {mintable.map((m) =>
            card(
              m.kind,
              m.itemId,
              <>
                {m.count > 1 && <span className="tiny muted">{t('{n} disponíveis para NFT', { n: m.count })}</span>}
                <div className="w3-actions">
                  <button className="btn btn-gold full" disabled={busy} onClick={() => setMintKey(m.key)}>
                    ✨ {t('Virar NFT')}
                  </button>
                </div>
              </>,
              'm-' + m.key,
            ),
          )}
          {nfts.map((nf) =>
            card(
              nf.kind,
              nf.itemId,
              <>
                <span className="tiny">
                  <span className="muted">NFT #{nf.tokenId}</span> ·{' '}
                  {nf.status === 'listed' ? <b className="status-pendente">{t('À venda por {p} USDC', { p: usdc(nf.price) })}</b> : <span className="pos">{t('Na carteira')}</span>}
                </span>
                <div className="w3-actions">
                {nf.status === 'listed' ? (
                  <button className="btn full" disabled={busy} onClick={() => run(() => api.marketCancel(nf.tokenId), (r) => okTx(t('Venda cancelada.'), r.tx), false)}>
                    {t('Cancelar venda')}
                  </button>
                ) : (
                  <button className="btn btn-primary full" disabled={busy} onClick={() => { setSell(nf); setPrice(nf.suggested ? String(nf.suggested) : '') }}>
                    🏷️ {t('Vender')}
                  </button>
                )}
                {nf.kind === 'galo' && nf.status !== 'listed' && (
                  <button className="btn btn-ghost btn-sm full w3-back" title={t('Trazer de volta para o jogo')} disabled={busy} onClick={() => run(() => api.unmintGalo(nf.tokenId), (r) => okTx(t('🐓 Galo de volta ao jogo (NFT queimado).'), r.tx), true)}>
                    ↩️ {t('Voltar ao jogo')}
                  </button>
                )}
                </div>
              </>,
              'n-' + nf.tokenId,
              nf.rooster,
            ),
          )}
        </div>
      )}

      <Modal open={!!mintItem} onClose={() => setMintKey(null)} title={'✨ ' + t('Transformar em NFT')}>
        {mintItem && (
          <div className="center">
            <div className="shop-emoji">{nftItem(mintItem.kind, mintItem.itemId).emoji}</div>
            <h3>{nftItem(mintItem.kind, mintItem.itemId).name}</h3>
            <p className="muted">{t('O item vira um NFT na sua carteira (rede de teste Polygon Amoy). Ele continua no seu jogo e você pode vendê-lo no Mercado por USDC.')}</p>
            <p className="tiny muted"><TestnetBadge /></p>
            <div className="row-center gap" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => setMintKey(null)}>{t('Cancelar')}</button>
              <button
                className="btn btn-gold"
                disabled={busy}
                onClick={async () => {
                  const ok = await run(() => api.mint(mintItem.key), (r) => okTx(t('NFT #{id} criado!', { id: r.tokenId }), r.tx), true)
                  if (ok) setMintKey(null)
                }}
              >
                {busy ? t('Aguarde...') : t('Transformar em NFT')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!sell} onClose={() => setSell(null)} title={'🏷️ ' + t('Vender no Mercado')}>
        {sell && (
          <div>
            <p className="center">
              <NftArt kind={sell.kind} itemId={sell.itemId} rooster={sell.rooster} />
              <br />
              <b>{nftItem(sell.kind, sell.itemId, sell.rooster).name}</b> <span className="mono tiny muted">#{sell.tokenId}</span>
            </p>
            <label className="field">
              <span>{t('Preço (USDC)')}</span>
              <input autoFocus type="number" min={sellFloor || 0} step={0.5} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={sellSuggested ? String(sellSuggested) : '10'} />
              {sellSuggested > 0 && (
                <span className="tiny muted">
                  {t('💡 Sugerido pelo valor do item: ~{s} USDC', { s: usdc(sellSuggested) })}
                  {sellFloor > 0 ? ' · ' + t('mínimo {f}', { f: usdc(sellFloor) }) : ''}
                </span>
              )}
            </label>
            <div className="stats-list">
              <div><span>{t('Taxa da plataforma ({p}%)', { p: feePct })}</span><span>−{usdc(fee)} USDC</span></div>
              <div><span>{t('Você recebe')}</span><b className="pos">{usdc(priceOk ? p - fee : 0)} USDC</b></div>
            </div>
            <p className="tiny muted">{t('O NFT fica guardado no Mercado até ser vendido ou você cancelar. Quando vender, o item sai do seu jogo e vai para o comprador.')}</p>
            <div className="row-center gap" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => setSell(null)}>{t('Cancelar')}</button>
              <button
                className="btn btn-primary"
                disabled={!priceOk || busy}
                onClick={async () => {
                  const ok = await run(() => api.marketList(sell.tokenId, Math.round(p * 1e6) / 1e6), (r) => okTx(t('Item à venda no Mercado!'), r.tx), false)
                  if (ok) setSell(null)
                }}
              >
                {busy ? t('Aguarde...') : t('Colocar à venda')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
