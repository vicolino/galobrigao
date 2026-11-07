// 💵 Depositar USDC → 🥚 ovos de ouro (card da Carteira). Só ida: ovos não voltam a ser USDC.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { encode } from 'uqr'
import { api, ApiError, type DepositInfo } from '../api'
import { Modal } from '../components/ui'
import { fmt } from '../game/rooster'
import { useGame } from '../game/store'
import { locale, t, tn, tx } from '../i18n'
import { errMsg, shortAddr, usdc, type PanelProps } from './Carteira'


/** QR code em SVG gerado aqui mesmo (sem serviço externo). */
function QrSvg({ text, size = 168 }: { text: string; size?: number }) {
  const path = useMemo(() => {
    const qr = encode(text, { ecc: 'M', border: 2 })
    let d = ''
    qr.data.forEach((row, y) => row.forEach((on, x) => on && (d += `M${x} ${y}h1v1h-1z`)))
    return { d, n: qr.size }
  }, [text])
  return (
    <svg className="dep-qr" width={size} height={size} viewBox={`0 0 ${path.n} ${path.n}`} shapeRendering="crispEdges" role="img" aria-label={t('QR code do seu endereço')}>
      <rect width={path.n} height={path.n} fill="#fff" />
      <path d={path.d} fill="#000" />
    </svg>
  )
}

function Copy({ text, label }: { text: string; label: string }) {
  const { toast } = useGame()
  return (
    <button
      className="btn btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          toast(label, 'ok')
        } catch {
          toast(t('Não deu para copiar. Selecione e copie manualmente.'), 'erro')
        }
      }}
    >
      📋 {t('Copiar')}
    </button>
  )
}

/** Texto digitado → valor em USDC (aceita vírgula, até 6 casas). */
const parseUsdc = (v: string) => (/^\d{1,9}([.,]\d{1,6})?$/.test(v.trim()) ? Number(v.trim().replace(',', '.')) : NaN)

export function DepositoUsdc({ info, busy, run, okTx }: PanelProps) {
  const { toast } = useGame()
  const [d, setD] = useState<DepositInfo | null>(null)
  const [amount, setAmount] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [gettingTest, setGettingTest] = useState(false)

  const load = useCallback(async () => {
    try {
      setD(await api.deposit())
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 503)) toast(errMsg(e), 'erro')
    }
  }, [toast])
  useEffect(() => {
    load()
  }, [load, info])

  if (!d) return null
  const address = d.address ?? info.wallet?.address ?? ''
  const bal = d.balance ?? 0
  const left = Math.max(0, d.cap - d.usedToday)
  const max = Math.floor(Math.min(bal, left) * 1e6) / 1e6
  const n = parseUsdc(amount)
  const eggs = Number.isFinite(n) ? Math.floor(n * d.rate + 1e-9) : 0
  const valid = Number.isFinite(n) && n >= d.min && n <= max && eggs >= 1
  const net = d.network.name
  const pending = d.recent.filter((r) => r.status === 'pending').length

  const errText = !amount
    ? null
    : !Number.isFinite(n)
      ? t('Digite um valor válido (até 6 casas).')
      : n < d.min
        ? t('Mínimo: {n} USDC.', { n: d.min })
        : n > bal
          ? t('Saldo de USDC insuficiente na carteira.')
          : n > left
            ? t('Passa do limite diário ({n} USDC por dia).', { n: d.cap })
            : null

  return (
    <>
      <h3 className="section-title">💵 {t('Depositar USDC')}</h3>
      <div className="card dep-card">
        <div className="dep-top">
          {address && <QrSvg text={address} />}
          <div className="dep-info">
            <span className="tiny muted">{t('Seu endereço de depósito')}</span>
            <div className="copy-row">
              <input readOnly className="mono" value={address} onFocus={(e) => e.target.select()} aria-label={t('Seu endereço de depósito')} />
              <Copy text={address} label={t('Endereço copiado!')} />
            </div>
            <div className="stats-list">
              <div><span>🌐 {t('Rede')}</span><b>{net}{d.network.testnet ? ` · ${t('teste')}` : ''}</b></div>
              <div>
                <span>🪙 {t('Contrato do USDC')}</span>
                <span className="row gap">
                  <span className="mono tiny" title={d.usdc}>{shortAddr(d.usdc)}</span>
                  <Copy text={d.usdc} label={t('Contrato copiado!')} />
                </span>
              </div>
              <div><span>💵 {t('USDC na carteira')}</span><b>{d.balance == null ? '—' : usdc(d.balance)}</b></div>
            </div>
          </div>
        </div>
        <div className="warn tiny">
          ⚠️ {tn('Envie SOMENTE {usdc} na rede {rede}. Outras moedas, outras redes ou outro contrato se perdem para sempre.', { usdc: <b>USDC</b>, rede: <b>{net}</b> })}
          {d.network.testnet && <> {t('Esta é uma rede de teste: não envie fundos reais.')}</>}
        </div>
        {d.network.testnet && (
          d.testUsdcClaimed ? (
            <p className="tiny muted">✅ {t('Você já pegou seus 20 USDC de teste (uma vez por conta).')}</p>
          ) : (
            <div className="row gap wrap">
              <button
                className="btn btn-sm"
                disabled={gettingTest}
                onClick={async () => {
                  setGettingTest(true)
                  try {
                    await api.testUsdc()
                    toast(t('💵 20 USDC de teste chegaram na sua carteira!'), 'ok')
                    await load()
                  } catch (e) {
                    toast(tx((e as Error).message), 'erro')
                  } finally {
                    setGettingTest(false)
                  }
                }}
              >
                {gettingTest ? <span className="spinner" /> : <>💵 {t('Receber 20 USDC de teste (uma vez)')}</>}
              </button>
              <span className="tiny muted">{t('A taxa de rede é por nossa conta: você não precisa de POL.')}</span>
            </div>
          )
        )}

        <h3 className="dep-sub">🥚 {t('Converter em ovos')}</h3>
        <p className="tiny muted">{t('1 USDC = {n} ovos de ouro. Só ida: ovos não voltam a ser USDC.', { n: fmt(d.rate) })}</p>
        {d.kycRequired ? (
          <p className="tiny neg">🪪 {t('Para depositar, verifique sua identidade (KYC) no painel Enviar.')}</p>
        ) : (
          <>
            <label className="field">
              <span>{t('Valor em USDC')} <span className="tiny muted">· {t('disponível: {n}', { n: usdc(bal) })}</span></span>
              <div className="copy-row">
                <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(d.min)} />
                <button className="btn btn-sm" onClick={() => setAmount(String(max))} disabled={max < d.min}>{t('Máx.')}</button>
              </div>
            </label>
            {errText && <p className="tiny neg">{errText}</p>}
            <p className="dep-preview">
              {Number.isFinite(n) && n > 0 ? <>{usdc(n)} USDC → <b className="gold">🥚 {fmt(eggs)}</b></> : <span className="muted">{t('{n} USDC → {m} ovos', { n: usdc(d.min), m: fmt(Math.floor(d.min * d.rate)) })}</span>}
            </p>
            <button className="btn btn-gold full" disabled={!valid || busy || pending > 0} onClick={() => setConfirm(true)}>
              🥚 {t('Converter em ovos')}
            </button>
            <p className="tiny muted">
              {t('Mínimo {min} USDC · limite diário: {usado} de {n} USDC', { min: d.min, usado: usdc(d.usedToday), n: d.cap })}
            </p>
          </>
        )}
        {pending > 0 && <p className="tiny status-pendente">⏳ {t('Depósito aguardando a rede confirmar. Os ovos entram sozinhos.')}</p>}
        {d.recent.length > 0 && (
          <div className="list dep-recent">
            {d.recent.map((r) => (
              <div key={r.id} className="list-row">
                <span className="grow tiny">
                  {usdc(r.usdc)} USDC → 🥚 {fmt(r.eggs)} <span className="muted">· {new Date(r.at).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })}</span>
                </span>
                <span className={`tiny status-${r.status === 'done' ? 'ganhou' : r.status === 'pending' ? 'pendente' : 'perdeu'}`}>{/* i18n-ok */}
                  {r.status === 'done' ? t('creditado') : r.status === 'pending' ? t('pendente') : r.status === 'failed' ? t('falhou') : t('em análise pelo suporte')}
                </span>
                {r.url && <a className="tiny" href={r.url} target="_blank" rel="noreferrer">↗</a>}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title={'💵 ' + t('Confirmar depósito')}>
        <div className="center">
          <p className="reward-big">{usdc(n)} USDC → 🥚 {fmt(eggs)}</p>
          <p className="muted">{t('{n} USDC saem da sua carteira para o jogo e viram {m} ovos de ouro assim que a rede confirmar.', { n: usdc(n), m: fmt(eggs) })}</p>
          <div className="warn tiny">⚠️ {t('Não dá para desfazer: ovos não voltam a ser USDC.')}</div>
          <div className="row-center gap" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setConfirm(false)}>{t('Cancelar')}</button>
            <button
              className="btn btn-gold"
              disabled={busy}
              onClick={async () => {
                const ok = await run(
                  () => api.depositEggs(amount.trim().replace(',', '.')),
                  (r) => (r.pending ? toast(t('Depósito enviado! Os ovos entram assim que a rede confirmar.'), 'info') : okTx(t('🥚 +{n} ovos de ouro!', { n: fmt(r.deposit.eggs) }), r.deposit.hash)),
                  true,
                )
                setConfirm(false)
                if (ok) setAmount('')
                load()
              }}
            >
              {busy ? t('Aguarde...') : t('Confirmar')}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
