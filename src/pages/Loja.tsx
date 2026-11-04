import { useEffect, useState } from 'react'
import { api, type CatalogItem } from '../api'
import { Checkout } from '../components/Checkout'
import { brl } from '../game/catalog'
import { RoosterSvg } from '../components/RoosterSvg'
import { Modal, PageHead, Price, RarityTag, RoosterCard, Tabs, go } from '../components/ui'
import { ACCESSORIES, BOXES, BREED_BY_ID, CORN_PACKS, ELECTION_ROOSTERS, ITEMS, RARITY, SLOTS, VIP } from '../game/data'
import { fmt, marketPrice } from '../game/rooster'
import { sfx } from '../game/sound'
import { useGame } from '../game/store'
import type { Accessory, Slot } from '../game/types'
import { bonusText } from './Galinheiro'
import { FerramentasTab, SkinsTab } from './LojaExtra'

type Tab = 'galos' | 'skins' | 'acessorios' | 'ferramentas' | 'itens' | 'caixas' | 'ovos' | 'trocar'

export function Loja({ tab: tabParam }: { tab?: string }) {
  const tab = (['galos', 'skins', 'acessorios', 'ferramentas', 'itens', 'caixas', 'ovos', 'trocar'].includes(tabParam ?? '') ? tabParam : 'galos') as Tab
  return (
    <>
      <PageHead title="🛒 Loja" subtitle="Galos, skins, acessórios, ferramentas de luta e muito mais." />
      <Tabs
        value={tab}
        onChange={(t) => go(`/loja/${t}`)}
        tabs={[
          { id: 'galos', label: '🐓 Galos' },
          { id: 'skins', label: '🎨 Skins' },
          { id: 'acessorios', label: '🎩 Acessórios' },
          { id: 'ferramentas', label: '🧰 Ferramentas' },
          { id: 'itens', label: '🍽️ Itens' },
          { id: 'caixas', label: '🎁 Caixas' },
          { id: 'ovos', label: '💎 Comprar (R$)' },
          { id: 'trocar', label: '🔁 Trocar' },
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
          <span className="sale-tag">🗳️ EDIÇÃO ELEIÇÕES</span>
          <span className="tiny muted">Mesmos atributos, mesmo preço. Quem leva a melhor é você que decide na arena.</span>
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
                    if (r.ok) toast(`${e.emoji} ${e.name} chegou ao galinheiro!`, 'ok')
                    else toast(r.error, 'erro')
                  }}
                >
                  {owned ? '✅ Já está no seu galinheiro' : <>Comprar · 🥚 {b.price}</>}
                </button>
              </div>
            )
          })}
          <div className="election-x">VS</div>
        </div>
        <p className="tiny muted center">Os dois também se enfrentam no card de Apostas no "Clássico Eleitoral".</p>
      </div>

      <div className="row-between">
        <p className="muted">O mercado renova sozinho em {mins} min.</p>
        <button
          className="btn btn-sm"
          onClick={async () => {
            const r = await actions.refreshMarket()
            if (!r.ok) toast(r.error, 'erro')
          }}
        >
          🔄 Renovar agora (🥚 5)
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
                    if (res.ok) toast(`${r.name} chegou ao galinheiro! 🐓`, 'ok')
                    else toast(res.error, 'erro')
                  }}
                >
                  Comprar · 🌽 {fmt(price)}
                </button>
              }
            />
          )
        })}
      </div>
      {s.market.roosters.length === 0 && <p className="muted center">Mercado vazio. Renove para ver novos galos.</p>}
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
          Todos
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
              <span className="tiny muted">Você tem: {s.accessories[a.id] ?? 0}</span>
            </div>
            <div className="tiny bonus">{bonusText(a.bonus)}</div>
            <button
              className="btn btn-primary full"
              onClick={async (e) => {
                e.stopPropagation()
                const r = await actions.buyAccessory(a.id)
                if (r.ok) toast(`${a.emoji} ${a.name} comprado! Equipe no Galinheiro.`, 'ok')
                else toast(r.error, 'erro')
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
                  toast(`${preview.name} comprado!`, 'ok')
                  setPreview(null)
                } else toast(r.error, 'erro')
              }}
            >
              Comprar · <Price value={preview.price} currency={preview.currency} />
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
          <span className="tiny muted">Você tem: {s.items[it.id] ?? 0}</span>
          <div className="row gap">
            <button
              className="btn btn-primary grow"
              onClick={async () => {
                const r = await actions.buyItem(it.id)
                if (r.ok) toast(`${it.emoji} ${it.name} comprado!`, 'ok')
                else toast(r.error, 'erro')
              }}
            >
              <Price value={it.price} currency={it.currency} />
            </button>
            <button
              className="btn btn-sm"
              title="Comprar 5"
              onClick={async () => {
                const r = await actions.buyItem(it.id, 5)
                if (r.ok) toast(`5x ${it.name} comprados!`, 'ok')
                else toast(r.error, 'erro')
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
      toast(r.error, 'erro')
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
            <p className="tiny muted">Um acessório aleatório.</p>
            <div className="odds-table">
              {Object.entries(b.odds).map(([r, p]) => (
                <div key={r}>
                  <span style={{ color: RARITY[r as keyof typeof RARITY].color }}>{RARITY[r as keyof typeof RARITY].label}</span>
                  <b>{p}%</b>
                </div>
              ))}
            </div>
            <button className="btn btn-primary full btn-lg" onClick={() => open(b.id)} disabled={!!opening}>
              Abrir · <Price value={b.price} currency={b.currency} />
            </button>
          </div>
        ))}
      </div>
      <p className="tiny muted center">As chances de cada raridade estão sempre visíveis. Itens repetidos ficam no inventário.</p>

      <Modal open={!!prize} onClose={() => setPrize(null)} title="🎉 Você ganhou!">
        {prize && (
          <div className={`center prize rar-${prize.rarity}`}>
            <div className="prize-emoji">{prize.emoji}</div>
            <h2>{prize.name}</h2>
            <RarityTag rarity={prize.rarity} />
            <p className="bonus">{bonusText(prize.bonus)}</p>
            <div className="row-center gap">
              <button className="btn" onClick={() => setPrize(null)}>
                Fechar
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setPrize(null)
                  go('/galinheiro')
                }}
              >
                Equipar no galinheiro
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
          🎁 <b>MODO MVP:</b> seu crédito de teste é <b>{brl(user?.mvpCreditCents ?? 0)}</b>. Use em qualquer compra abaixo — é por nossa conta!
        </div>
      )}
      {vip && (
        <div className="card vip">
          <div className="vip-crown">👑</div>
          <div className="grow">
            <h2>Passe do Criador</h2>
            <ul className="tiny">
              <li>🥚 100 ovos de ouro na hora</li>
              <li>🥚 +{VIP.dailyOvos} ovos todo dia no bônus diário</li>
              <li>🌽 +{Math.round(VIP.milhoBonus * 100)}% de milho nas lutas e no bônus</li>
              <li>👑 Coroa ao lado do seu nome</li>
            </ul>
            {isVip && <p className="pos tiny">Ativo · {vipDays} dia(s) restantes</p>}
          </div>
          <button className="btn btn-gold btn-lg" onClick={() => setBuying(vip)}>
            {isVip ? 'Renovar' : 'Assinar'} · {brl(vip.priceCents)}
          </button>
        </div>
      )}

      {starters.length > 0 && (
        <>
          <h3 className="section-title">🎁 Ofertas de começo (uma vez por conta)</h3>
          <div className="grid-shop">
            {starters.map((p) => (
              <div key={p.id} className={`card egg-pack ${p.tag ? 'tagged' : ''}`}>
                {p.tag && <div className="pack-tag">{p.tag}</div>}
                <RoosterSvg breedId={p.breedId!} skin={p.skin} size={110} anim="none" />
                <b>
                  {p.emoji} {p.name}
                </b>
                <span className="tiny muted">{p.desc}</span>
                <button className="btn btn-gold full" onClick={() => setBuying(p)}>
                  {brl(p.priceCents)}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className="section-title">🥚 Ovos de ouro</h3>
      <div className="grid-shop">
        {packs.map((p, i) => (
          <div key={p.id} className={`card egg-pack ${p.tag ? 'tagged' : ''}`}>
            {p.tag && <div className="pack-tag">{p.tag}</div>}
            <div className="egg-stack">{'🥚'.repeat(i + 1)}</div>
            <b className="egg-amount">{(p.ovos! + (p.bonus ?? 0)).toLocaleString('pt-BR')}</b>
            {p.bonus ? <span className="pos tiny">+{p.bonus} de bônus</span> : <span className="tiny">&nbsp;</span>}
            <span className="tiny muted">{brl(Math.round(p.priceCents / ((p.ovos! + (p.bonus ?? 0)) / 100)))} por 100</span>
            <button className="btn btn-primary full" onClick={() => setBuying(p)}>
              {brl(p.priceCents)}
            </button>
          </div>
        ))}
      </div>
      {user && (
        <p className="tiny muted center">
          Gasto este mês: {brl(user.limits.spentCents)} de {brl(user.limits.monthlyCents)} (limite ajustável no Perfil). Ovos de ouro são itens virtuais, sem saque.
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
      <p className="muted">Troque ovos de ouro por milho para comprar galos, treinar e apostar.</p>
      <div className="grid-shop">
        {CORN_PACKS.map((p) => (
          <div key={p.id} className="card shop-item center">
            <div className="shop-emoji">🌽</div>
            <b className="egg-amount">{fmt(p.milho)}</b>
            <span className="tiny muted">de milho</span>
            <button
              className="btn btn-primary full"
              disabled={state!.ovos < p.ovos}
              onClick={async () => {
                const r = await actions.exchange(p.id)
                if (r.ok) toast(`+🌽 ${fmt(p.milho)}`, 'ok')
                else toast(r.error, 'erro')
              }}
            >
              🥚 {p.ovos}
            </button>
          </div>
        ))}
      </div>
      <div className="center">
        <button className="btn" onClick={() => go('/loja/ovos')}>
          Precisa de mais ovos? 🥚
        </button>
      </div>
    </>
  )
}
