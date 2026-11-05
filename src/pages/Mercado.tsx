import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type MarketListing, type Web3Info } from '../api'
import { Empty, Modal, PageHead, RarityTag, Tabs, go } from '../components/ui'
import { useGame } from '../game/store'
import { t } from '../i18n'
import { TestnetBadge, errMsg, nftItem, num, usdc, useTxToast } from './Carteira'

type Filter = 'todos' | 'acc' | 'skin'

export function Mercado() {
  const { actions, toast } = useGame()
  const [info, setInfo] = useState<Web3Info | null>(null)
  const [listings, setListings] = useState<MarketListing[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState<Filter>('todos')
  const [buy, setBuy] = useState<MarketListing | null>(null)
  const [busy, setBusy] = useState(false)
  const okTx = useTxToast()

  const load = useCallback(async () => {
    try {
      const w = await api.web3()
      setInfo(w)
      if (!w.enabled) return
      const m = await api.market()
      setListings(m.listings)
      setFailed(false)
    } catch (e) {
      if (e instanceof ApiError && (e.status === 503 || e.status === 404)) setInfo({ enabled: false })
      else setFailed(true)
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const head = <PageHead title={t('🏪 Mercado')} subtitle={t('Compre e venda itens lendários como NFT, pagando em USDC.')} right={<TestnetBadge />} />

  if (info && !info.enabled)
    return (
      <>
        {head}
        <div className="card center web3-soon">
          <div className="empty-emoji">🚧</div>
          <h2>{t('Em breve!')}</h2>
          <p className="muted">{t('O Mercado de itens lendários está chegando. Por enquanto tudo vai rodar numa rede de teste, sem valor real.')}</p>
        </div>
      </>
    )
  if (!info || !listings)
    return (
      <>
        {head}
        {failed ? (
          <Empty emoji="📡" title={t('Não deu para carregar o Mercado.')} action={<button className="btn" onClick={load}>{t('Tentar de novo')}</button>} />
        ) : (
          <div className="center"><div className="spinner big" /></div>
        )}
      </>
    )

  const myUsdc = num(info.wallet?.usdc)
  const shown = listings.filter((l) => filter === 'todos' || l.kind === filter)

  const doBuy = async (l: MarketListing) => {
    setBusy(true)
    try {
      await actions.reloadFromServer() // envia progresso pendente antes
      const r = await api.marketBuy(l.tokenId)
      okTx(t('Compra feita! {nome} já está no seu jogo.', { nome: nftItem(l.kind, l.itemId).name }), r.tx)
      await actions.reloadFromServer()
      setBuy(null)
    } catch (e) {
      toast(errMsg(e), 'erro')
    } finally {
      setBusy(false)
      load()
    }
  }

  const cancel = async (l: MarketListing) => {
    setBusy(true)
    try {
      const r = await api.marketCancel(l.tokenId)
      okTx(t('Venda cancelada.'), r.tx)
    } catch (e) {
      toast(errMsg(e), 'erro')
    } finally {
      setBusy(false)
      load()
    }
  }

  return (
    <>
      {head}
      <div className="row-between wrap web3-market-bar">
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: 'todos', label: t('Todos') },
            { id: 'acc', label: t('Acessórios') },
            { id: 'skin', label: t('Skins') },
          ]}
        />
        <span className="pill" title={t('Saldo de USDC na sua carteira')}>
          💵 {usdc(myUsdc)} USDC
        </span>
      </div>

      {shown.length === 0 ? (
        <Empty
          emoji="🏪"
          title={t('Nenhum item à venda agora.')}
          text={t('Transforme seus itens lendários em NFT na Carteira e seja o primeiro a vender.')}
          action={<button className="btn btn-primary" onClick={() => go('/carteira')}>👛 {t('Ir para a Carteira')}</button>}
        />
      ) : (
        <div className="grid-shop">
          {shown.map((l) => {
            const it = nftItem(l.kind, l.itemId)
            const short = !l.mine && myUsdc < num(l.price)
            return (
              <div key={l.tokenId} className={`card shop-item web3-item rar-${it.rarity}`}>
                {l.mine && <span className="corner-tag web3-mine">{t('Seu')}</span>}
                <div className="shop-emoji">{it.emoji}</div>
                <b>{it.name}</b>
                <div className="row gap wrap">
                  <RarityTag rarity={it.rarity} />
                  <span className="tiny muted">{it.kindLabel}</span>
                </div>
                <span className="tiny muted">{t('Vendedor: {nome}', { nome: l.seller })} · <span className="mono">#{l.tokenId}</span></span>
                <span className="price web3-price">💵 {usdc(l.price)} USDC</span>
                {l.mine ? (
                  <button className="btn full" disabled={busy} onClick={() => cancel(l)}>
                    {t('Cancelar venda')}
                  </button>
                ) : (
                  <>
                    <button className="btn btn-primary full" disabled={busy || short} onClick={() => setBuy(l)}>
                      {t('Comprar')}
                    </button>
                    {short && <span className="tiny neg">{t('USDC insuficiente na carteira.')}</span>}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
      <p className="tiny muted center">{t('Rede de teste: os tokens não têm valor real.')}</p>

      <Modal open={!!buy} onClose={() => setBuy(null)} title={'🛒 ' + t('Confirmar compra')}>
        {buy && (
          <div className="center">
            <div className="shop-emoji">{nftItem(buy.kind, buy.itemId).emoji}</div>
            <h3>{nftItem(buy.kind, buy.itemId).name}</h3>
            <RarityTag rarity={nftItem(buy.kind, buy.itemId).rarity} />
            <p className="reward-big">💵 {usdc(buy.price)} USDC</p>
            <p className="muted">{t('O valor sai do USDC da sua carteira. O NFT vai para a sua carteira e o item aparece no seu jogo.')}</p>
            <p className="tiny muted">{t('Saldo depois da compra: {n} USDC', { n: usdc(myUsdc - num(buy.price)) })}</p>
            <div className="row-center gap" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => setBuy(null)}>{t('Cancelar')}</button>
              <button className="btn btn-primary" disabled={busy || myUsdc < num(buy.price)} onClick={() => doBuy(buy)}>
                {busy ? t('Aguarde...') : t('Comprar')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
