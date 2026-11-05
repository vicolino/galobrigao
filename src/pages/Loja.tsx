import { useEffect, useState } from 'react'
import { api, type CatalogItem } from '../api'
import { Checkout } from '../components/Checkout'
import { brl } from '../game/catalog'
import { RoosterSvg } from '../components/RoosterSvg'
import { Modal, PageHead, Price, RarityTag, RoosterCard, Tabs, go } from '../components/ui'
import { ACCESSORIES, BOXES, BREED_BY_ID, CORN_PACKS, ELECTION_ROOSTERS, FOOTBALL_ROOSTERS, ITEMS, SPECIAL_ROOSTERS, RARITY, SLOTS, VIP } from '../game/data'
import { fmt, marketPrice } from '../game/rooster'
import { sfx } from '../game/sound'
import { useGame } from '../game/store'
import type { Accessory, Slot } from '../game/types'
import { bonusText } from './Galinheiro'
import { FerramentasTab, SkinsTab } from './LojaExtra'
import { locale, t, tn, tp, tx } from '../i18n'

type Tab = 'galos' | 'skins' | 'acessorios' | 'ferramentas' | 'itens' | 'caixas' | 'ovos' | 'trocar'

export function Loja({ tab: tabParam }: { tab?: string }) {
  const tab = (['galos', 'skins', 'acessorios', 'ferramentas', 'itens', 'caixas', 'ovos', 'trocar'].includes(tabParam ?? '') ? tabParam : 'galos') as Tab
  return (
    <>
      <PageHead title={t('🛒 Loja')} subtitle={t('Galos, skins, acessórios, ferramentas de luta e muito mais.')} />
      <Tabs
        value={tab}
        onChange={(v) => go(`/loja/${v}`)}
        tabs={[
          { id: 'galos', label: t('🐓 Galos') },
          { id: 'skins', label: t('🎨 Skins') },
          { id: 'acessorios', label: t('🎩 Acessórios') },
          { id: 'ferramentas', label: t('🧰 Ferramentas') },
          { id: 'itens', label: t('🍽️ Itens') },
          { id: 'caixas', label: t('🎁 Caixas') },
          { id: 'ovos', label: t('💎 Comprar (R$)') },
          { id: 'trocar', label: t('🔁 Trocar') },
        ]}
      />
      {tab === 'galos' && <Galos />}
      {tab === 'skins' && <SkinsTab />}
      {tab === 'acessorios' && <Acessorios />}
      {tab === 'ferramentas' && <FerramentasTab />}
      {tab === 'itens' && <Itens />}
      {tab === 'caixas' && <Caixas />}
      {tab === 'ovos' && <Ovos />}
      {tab === 'trocar' && <Trocar />}
    </>
  )
}

function Galos() {
  const { state, actions, toast } = useGame()
  const s = state!
  const mins = Math.max(0, 30 - Math.floor((Date.now() - s.market.at) / 60000))
  // Mercado vencido: o servidor gera um novo de graça
  useEffect(() => {
    if (Date.now() - s.market.at > 30 * 60_000) void actions.refreshMarket()
  }, [s.market.at]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="card election">
        <div className="election-head">
          <span className="sale-tag">{t('🗳️ EDIÇÃO ELEIÇÕES')}</span>
          <span className="tiny muted">{t('Mesmos atributos, mesmo preço. Quem leva a melhor é você que decide na arena.')}</span>
        </div>
        <div className="election-vs">
          {ELECTION_ROOSTERS.map((e, i) => {
            const b = BREED_BY_ID[e.breedId]
            const owned = s.roosters.some((r) => r.breedId === e.breedId)
            return (
              <div key={e.breedId} className={`election-side side-${e.breedId}`}>
                <RoosterSvg breedId={e.breedId} size={170} anim="idle" flip={i === 1} />
                <h3>
                  {e.emoji} {e.name}
                </h3>
                <p className="tiny muted italic">"{b.desc}"</p>
                <p className="tiny">
                  <RarityTag rarity={b.rarity} /> · ❤️ {b.base.hp} · 🗡️ {b.base.atk} · 🛡️ {b.base.def} · 💨 {b.base.spd}
                </p>
                <button
                  className="btn btn-gold full"
                  disabled={owned}
                  onClick={async () => {
                    const r = await actions.buyElection(e.breedId)
                    if (r.ok) toast(t('{nome} chegou ao galinheiro!', { nome: `${e.emoji} ${e.name}` }), 'ok')
                    else toast(tx(r.error), 'erro')
                  }}
                >
                  {owned ? t('✅ Já está no seu galinheiro') : <>{t('Comprar')} · 🥚 {b.price}</>}
                </button>
              </div>
            )
          })}
          <div className="election-x">VS</div>
        </div>
        <p className="tiny muted center">{t('Os dois também se enfrentam no card de Apostas no "Clássico Eleitoral".')}</p>
      </div>

      {SPECIAL_ROOSTERS.map((e) => {
        const b = BREED_BY_ID[e.breedId]
        const owned = s.roosters.some((r) => r.breedId === e.breedId)
        return (
          <div key={e.breedId} className={`card special-rooster side-${e.breedId}`}>
            <RoosterSvg breedId={e.breedId} size={170} anim="idle" />
            <div className="special-info">
              <span className="sale-tag">{t('🇺🇸 EDIÇÃO ESPECIAL EUA')}</span>
              <h3>
                {e.emoji} {e.name}
              </h3>
              <p className="tiny muted italic">"{b.desc}"</p>
              <p className="tiny">
                <RarityTag rarity={b.rarity} /> · ❤️ {b.base.hp} · 🗡️ {b.base.atk} · 🛡️ {b.base.def} · 💨 {b.base.spd}
              </p>
              <button
                className="btn btn-gold"
                disabled={owned}
                onClick={async () => {
                  const r = await actions.buyElection(e.breedId)
                  if (r.ok) toast(t('{nome} chegou ao galinheiro!', { nome: `${e.emoji} ${e.name}` }), 'ok')
                  else toast(tx(r.error), 'erro')
                }}
              >
                {owned ? t('✅ Já está no seu galinheiro') : <>{t('Comprar')} · 🥚 {b.price}</>}
              </button>
            </div>
          </div>
        )
      })}

      <div className="card football">
        <div className="election-head">
          <span className="sale-tag">{t('⚽ EDIÇÃO FUTEBOL')}</span>
          <span className="tiny muted">{t('Lendas da bola com a camisa da seleção. A partir de 🥚 {n}.', { n: 99 })}</span>
        </div>
        <div className="football-grid">
          {FOOTBALL_ROOSTERS.map((e) => {
            const b = BREED_BY_ID[e.breedId]
            const owned = s.roosters.some((r) => r.breedId === e.breedId)
            return (
              <div key={e.breedId} className={`football-item ${e.breedId === 'rei' ? 'king' : ''}`}>
                {e.breedId === 'rei' && <span className="king-tag">{t('👑 O REI DO FUTEBOL')}</span>}
                <RoosterSvg breedId={e.breedId} size={e.breedId === 'rei' ? 230 : 130} anim="idle" />
                <b>
                  {e.emoji} {e.name}
                </b>
                <p className="tiny muted italic">"{b.desc}"</p>
                {e.breedId === 'rei' && <p className="king-titles">{t('🏆🏆🏆 3 Copas do Mundo · ⚽ 1.000+ gols')}</p>}
                <p className="tiny">
                  ❤️ {b.base.hp} · 🗡️ {b.base.atk} · 🛡️ {b.base.def} · 💨 {b.base.spd}
                </p>
                <button
                  className="btn btn-gold btn-sm full"
                  disabled={owned}
                  onClick={async () => {
                    const r = await actions.buyElection(e.breedId)
                    if (r.ok) toast(t('{nome} chegou ao galinheiro!', { nome: `${e.emoji} ${e.name}` }), 'ok')
                    else toast(tx(r.error), 'erro')
                  }}
                >
                  {owned ? t('✅ Já está no seu galinheiro') : <>{t('Comprar')} · 🥚 {b.price}</>}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="row-between">
        <p className="muted">{t('O mercado renova sozinho em {n} min.', { n: mins })}</p>
        <button
          className="btn btn-sm"
          onClick={async () => {
            const r = await actions.refreshMarket()
            if (!r.ok) toast(tx(r.error), 'erro')
          }}
        >
          {t('🔄 Renovar agora (🥚 5)')}
        </button>
      </div>
      <div className="grid-cards">
        {s.market.roosters.map((r) => {
          const price = marketPrice(r)
          return (
            <RoosterCard
              key={r.id}
              ro={r}
              footer={
                <button
                  className="btn btn-primary full"
                  disabled={s.milho < price}
                  onClick={() => {
                    const res = actions.buyRooster(r.id)
                    if (res.ok) toast(t('{nome} chegou ao galinheiro! 🐓', { nome: r.name }), 'ok')
                    else toast(tx(res.error), 'erro')
                  }}
                >
                  {t('Comprar')} · 🌽 {fmt(price)}
                </button>
              }
            />
          )
        })}
      </div>
      {s.market.roosters.length === 0 && <p className="muted center">{t('Mercado vazio. Renove para ver novos galos.')}</p>}
    </>
  )
}

function Acessorios() {
  const { state, actions, toast } = useGame()
  const s = state!
  const [slot, setSlot] = useState<Slot | 'todos'>('todos')
  const [preview, setPreview] = useState<Accessory | null>(null)
  const list = ACCESSORIES.filter((a) => slot === 'todos' || a.slot === slot)
  const previewRooster = s.roosters[0]

  return (
    <>
      <div className="chips">
        <button className={`chip clickable ${slot === 'todos' ? 'active' : ''}`} onClick={() => setSlot('todos')}>
          {t('Todos')}
        </button>
        {(Object.keys(SLOTS) as Slot[]).map((k) => (
          <button key={k} className={`chip clickable ${slot === k ? 'active' : ''}`} onClick={() => setSlot(k)}>
            {SLOTS[k].emoji} {SLOTS[k].label}
          </button>
        ))}
      </div>
      <div className="grid-shop">
        {list.map((a) => (
          <div key={a.id} className={`card shop-item rar-${a.rarity}`} onClick={() => setPreview(a)}>
            <div className="shop-art">
              <RoosterSvg breedId={previewRooster.breedId} skin={previewRooster.skin} equipped={{ [a.slot]: a.id }} size={120} anim="none" />
            </div>
            <div className="row-between">
              <b>
                {a.emoji} {a.name}
              </b>
            </div>
            <div className="row-between">
              <RarityTag rarity={a.rarity} />
              <span className="tiny muted">{t('Você tem: {n}', { n: s.accessories[a.id] ?? 0 })}</span>
            </div>
            <div className="tiny bonus">{bonusText(a.bonus)}</div>
            <button
              className="btn btn-primary full"
              onClick={async (e) => {
                e.stopPropagation()
                const r = await actions.buyAccessory(a.id)
                if (r.ok) toast(t('{nome} comprado! Equipe no Galinheiro.', { nome: `${a.emoji} ${a.name}` }), 'ok')
                else toast(tx(r.error), 'erro')
              }}
            >
              <Price value={a.price} currency={a.currency} />
            </button>
          </div>
        ))}
      </div>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview ? `${preview.emoji} ${preview.name}` : ''}>
        {preview && (
          <div className="center">
            <div className="preview-row">
              {s.roosters.slice(0, 3).map((r) => (
                <RoosterSvg key={r.id} breedId={r.breedId} skin={r.skin} equipped={{ ...r.equipped, [preview.slot]: preview.id }} size={130} anim="idle" />
              ))}
            </div>
            <p className="muted italic">"{preview.desc}"</p>
            <p>
              <RarityTag rarity={preview.rarity} /> · {SLOTS[preview.slot].label} · <span className="bonus">{bonusText(preview.bonus)}</span>
            </p>
            <button
              className="btn btn-primary btn-lg"
              onClick={async () => {
                const r = await actions.buyAccessory(preview.id)
                if (r.ok) {
                  toast(t('{nome} comprado!', { nome: preview.name }), 'ok')
                  setPreview(null)
                } else toast(tx(r.error), 'erro')
              }}
            >
              {t('Comprar')} · <Price value={preview.price} currency={preview.currency} />
            </button>
          </div>
        )}
      </Modal>
    </>
  )
}

function Itens() {
  const { state, actions, toast } = useGame()
  const s = state!
  return (
    <div className="grid-shop">
      {ITEMS.map((it) => (
        <div key={it.id} className="card shop-item">
          <div className="shop-emoji">{it.emoji}</div>
          <b>{it.name}</b>
          <p className="tiny muted">{it.desc}</p>
          <span className="tiny muted">{t('Você tem: {n}', { n: s.items[it.id] ?? 0 })}</span>
          <div className="row gap">
            <button
              className="btn btn-primary grow"
              onClick={async () => {
                const r = await actions.buyItem(it.id)
                if (r.ok) toast(t('{nome} comprado!', { nome: `${it.emoji} ${it.name}` }), 'ok')
                else toast(tx(r.error), 'erro')
              }}
            >
              <Price value={it.price} currency={it.currency} />
            </button>
            <button
              className="btn btn-sm"
              title={t('Comprar 5')}
              onClick={async () => {
                const r = await actions.buyItem(it.id, 5)
                if (r.ok) toast(t('5x {nome} comprados!', { nome: it.name }), 'ok')
                else toast(tx(r.error), 'erro')
              }}
            >
              ×5
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function Caixas() {
  const { actions, toast } = useGame()
  const [opening, setOpening] = useState<string | null>(null)
  const [prize, setPrize] = useState<Accessory | null>(null)

  const open = async (id: string) => {
    const r = await actions.openBox(id)
    if (!r.ok) {
      toast(tx(r.error), 'erro')
      return
    }
    setOpening(id)
    sfx.box()
    setTimeout(() => {
      setOpening(null)
      setPrize(r.value!)
      r.value!.rarity === 'lendario' || r.value!.rarity === 'epico' ? sfx.win() : sfx.coin()
    }, 1400)
  }

  return (
    <>
      <div className="boxes">
        {BOXES.map((b) => (
          <div key={b.id} className="card box-card">
            <div className={`box-emoji ${opening === b.id ? 'opening' : ''}`}>{b.emoji}</div>
            <h3>{b.name}</h3>
            <p className="tiny muted">{t('Um acessório aleatório.')}</p>
            <div className="odds-table">
              {Object.entries(b.odds).map(([r, p]) => (
                <div key={r}>
                  <span style={{ color: RARITY[r as keyof typeof RARITY].color }}>{RARITY[r as keyof typeof RARITY].label}</span>
                  <b>{p}%</b>
                </div>
              ))}
            </div>
            <button className="btn btn-primary full btn-lg" onClick={() => open(b.id)} disabled={!!opening}>
              {t('Abrir')} · <Price value={b.price} currency={b.currency} />
            </button>
          </div>
        ))}
      </div>
      <p className="tiny muted center">{t('As chances de cada raridade estão sempre visíveis. Itens repetidos ficam no inventário.')}</p>

      <Modal open={!!prize} onClose={() => setPrize(null)} title={t('🎉 Você ganhou!')}>
        {prize && (
          <div className={`center prize rar-${prize.rarity}`}>
            <div className="prize-emoji">{prize.emoji}</div>
            <h2>{prize.name}</h2>
            <RarityTag rarity={prize.rarity} />
            <p className="bonus">{bonusText(prize.bonus)}</p>
            <div className="row-center gap">
              <button className="btn" onClick={() => setPrize(null)}>
                {t('Fechar')}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setPrize(null)
                  go('/galinheiro')
                }}
              >
                {t('Equipar no galinheiro')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

function Ovos() {
  const { isVip, state, user, pubConfig } = useGame()
  const [items, setItems] = useState<CatalogItem[]>([])
  const [buying, setBuying] = useState<CatalogItem | null>(null)
  const vipDays = Math.max(0, Math.ceil((state!.vip.until - Date.now()) / 864e5))
  const load = () => void api.catalog().then((r) => setItems(r.items))
  useEffect(load, [])

  const vip = items.find((i) => i.kind === 'vip')
  const packs = items.filter((i) => i.kind === 'ovos')
  const starters = items.filter((i) => i.kind === 'starter' && !i.owned)

  return (
    <>
      {pubConfig?.mvp.on && (
        <div className="mvp-banner">
          🎁 {tn('{modo} seu crédito de teste é {valor}. Use em qualquer compra abaixo — é por nossa conta!', { modo: <b>{t('MODO MVP:')}</b>, valor: <b>{brl(user?.mvpCreditCents ?? 0)}</b> })}
        </div>
      )}
      {vip && (
        <div className="card vip">
          <div className="vip-crown">👑</div>
          <div className="grow">
            <h2>{t('Passe do Criador')}</h2>
            <ul className="tiny">
              <li>{t('🥚 100 ovos de ouro na hora')}</li>
              <li>{t('🥚 +{n} ovos todo dia no bônus diário', { n: VIP.dailyOvos })}</li>
              <li>{t('🌽 +{n}% de milho nas lutas e no bônus', { n: Math.round(VIP.milhoBonus * 100) })}</li>
              <li>{t('👑 Coroa ao lado do seu nome')}</li>
            </ul>
            {isVip && <p className="pos tiny">{tp('Ativo · {n} dia restante', 'Ativo · {n} dias restantes', vipDays)}</p>}
          </div>
          <button className="btn btn-gold btn-lg" onClick={() => setBuying(vip)}>
            {isVip ? t('Renovar') : t('Assinar')} · {brl(vip.priceCents)}
          </button>
        </div>
      )}

      {starters.length > 0 && (
        <>
          <h3 className="section-title">{t('🎁 Ofertas de começo (uma vez por conta)')}</h3>
          <div className="grid-shop">
            {starters.map((p) => (
              <div key={p.id} className={`card egg-pack ${p.tag ? 'tagged' : ''}`}>
                {p.tag && <div className="pack-tag">{tx(p.tag)}</div>}
                <RoosterSvg breedId={p.breedId!} skin={p.skin} size={110} anim="none" />
                <b>
                  {p.emoji} {tx(p.name)}
                </b>
                <span className="tiny muted">{tx(p.desc)}</span>
                <button className="btn btn-gold full" onClick={() => setBuying(p)}>
                  {brl(p.priceCents)}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className="section-title">{t('🥚 Ovos de ouro')}</h3>
      <div className="grid-shop">
        {packs.map((p, i) => (
          <div key={p.id} className={`card egg-pack ${p.tag ? 'tagged' : ''}`}>
            {p.tag && <div className="pack-tag">{tx(p.tag)}</div>}
            <div className="egg-stack">{'🥚'.repeat(i + 1)}</div>
            <b className="egg-amount">{(p.ovos! + (p.bonus ?? 0)).toLocaleString(locale())}</b>
            {p.bonus ? <span className="pos tiny">{t('+{n} de bônus', { n: p.bonus.toLocaleString(locale()) })}</span> : <span className="tiny">&nbsp;</span>}
            <span className="tiny muted">{t('{preco} por 100', { preco: brl(Math.round(p.priceCents / ((p.ovos! + (p.bonus ?? 0)) / 100))) })}</span>
            <button className="btn btn-primary full" onClick={() => setBuying(p)}>
              {brl(p.priceCents)}
            </button>
          </div>
        ))}
      </div>
      {user && (
        <p className="tiny muted center">
          {t('Gasto este mês: {gasto} de {limite} (limite ajustável no Perfil). Ovos de ouro são itens virtuais, sem saque.', { gasto: brl(user.limits.spentCents), limite: brl(user.limits.monthlyCents) })}
        </p>
      )}
      <Checkout
        item={buying}
        onClose={() => {
          setBuying(null)
          load()
        }}
      />
    </>
  )
}

function Trocar() {
  const { state, actions, toast } = useGame()
  return (
    <>
      <p className="muted">{t('Troque ovos de ouro por milho para comprar galos e treinar.')}</p>
      <div className="grid-shop">
        {CORN_PACKS.map((p) => (
          <div key={p.id} className="card shop-item center">
            <div className="shop-emoji">🌽</div>
            <b className="egg-amount">{fmt(p.milho)}</b>
            <span className="tiny muted">{t('de milho')}</span>
            <button
              className="btn btn-primary full"
              disabled={state!.ovos < p.ovos}
              onClick={async () => {
                const r = await actions.exchange(p.id)
                if (r.ok) toast(`+🌽 ${fmt(p.milho)}`, 'ok')
                else toast(tx(r.error), 'erro')
              }}
            >
              🥚 {p.ovos}
            </button>
          </div>
        ))}
      </div>
      <div className="center">
        <button className="btn" onClick={() => go('/loja/ovos')}>
          {t('Precisa de mais ovos? 🥚')}
        </button>
      </div>
    </>
  )
}
