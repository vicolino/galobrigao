import { useState } from 'react'
import { RoosterSvg } from '../components/RoosterSvg'
import { Modal, Price, RarityTag, go } from '../components/ui'
import { SKINS, SKIN_BUNDLES, SKIN_BY_ID, TOOLS, TOOL_BY_ID, TOOL_KITS, MAX_TOOLS } from '../game/data'
import { fmt } from '../game/rooster'
import { WEEKLY_DISCOUNT, skinPrice, useGame, weeklySkin } from '../game/store'
import type { Skin } from '../game/types'
import { ARENA } from '../brand'

// ---------------- Skins ----------------

export function SkinsTab() {
  const { state, actions, toast } = useGame()
  const s = state!
  const [preview, setPreview] = useState<Skin | null>(null)
  const [applyFor, setApplyFor] = useState<Skin | null>(null)
  const base = s.roosters[0]
  const weekly = weeklySkin()
  const daysLeft = 7 - (Math.floor((Date.now() - Date.UTC(2024, 0, 1)) / 864e5) % 7)
  const owned = (id: string) => s.skins.includes(id)

  const buy = async (sk: Skin) => {
    const r = await actions.buySkin(sk.id)
    if (r.ok) {
      toast(`${sk.emoji} Skin ${sk.name} desbloqueada!`, 'ok')
      setPreview(null)
      setApplyFor(sk)
    } else toast(r.error, 'erro')
  }

  return (
    <>
      {/* Skin da semana */}
      <div className={`card weekly rar-${weekly.rarity}`}>
        <div className="weekly-art">
          <RoosterSvg breedId={base.breedId} skin={weekly.id} equipped={base.equipped} size={190} anim="idle" />
        </div>
        <div className="grow">
          <span className="sale-tag">🔥 SKIN DA SEMANA · −{Math.round(WEEKLY_DISCOUNT * 100)}%</span>
          <h2>
            {weekly.emoji} {weekly.name}
          </h2>
          <p className="muted italic">"{weekly.desc}"</p>
          <p>
            <RarityTag rarity={weekly.rarity} /> <span className="tiny muted">· acaba em {daysLeft} dia(s)</span>
          </p>
          {owned(weekly.id) ? (
            <button className="btn" onClick={() => setApplyFor(weekly)}>
              ✅ Já é sua · Aplicar
            </button>
          ) : (
            <button className="btn btn-gold btn-lg" onClick={() => buy(weekly)}>
              <s className="old-price">🥚 {weekly.price}</s> 🥚 {skinPrice(weekly.id)}
            </button>
          )}
        </div>
      </div>

      {/* Coleção */}
      <div className="collection">
        <span>
          🎨 Coleção: <b>{s.skins.length}</b>/{SKINS.length}
        </span>
        <div className="bar-track">
          <div className="bar-fill" style={{ width: `${(s.skins.length / SKINS.length) * 100}%`, background: 'linear-gradient(90deg,#b57bff,#ff6ad5)' }} />
        </div>
      </div>

      {/* Pacotes */}
      <h3 className="section-title">📦 Pacotes com desconto</h3>
      <div className="bundles">
        {SKIN_BUNDLES.map((b) => {
          const full = b.skins.reduce((a, k) => a + SKIN_BY_ID[k].price, 0)
          const all = b.skins.every(owned)
          return (
            <div key={b.id} className="card bundle">
              <div className="bundle-art">
                {b.skins.map((k, i) => (
                  <RoosterSvg key={k} breedId={base.breedId} skin={k} size={84} anim="none" flip={i === 2} />
                ))}
              </div>
              <b>
                {b.emoji} {b.name}
              </b>
              <span className="tiny muted">{b.desc}</span>
              <span className="tiny pos">Economize {Math.round((1 - b.price / full) * 100)}%</span>
              <button
                className="btn btn-primary full"
                disabled={all}
                onClick={async () => {
                  const r = await actions.buySkinBundle(b.id)
                  if (r.ok) toast(`${b.name} desbloqueado!`, 'ok')
                  else toast(r.error, 'erro')
                }}
              >
                {all ? '✅ Completo' : (
                  <>
                    <s className="old-price">🥚 {full}</s> 🥚 {b.price}
                  </>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* Todas */}
      <h3 className="section-title">🎨 Todas as skins</h3>
      <div className="grid-shop">
        {SKINS.map((sk) => (
          <div key={sk.id} className={`card shop-item rar-${sk.rarity} ${owned(sk.id) ? 'owned' : ''}`} onClick={() => setPreview(sk)}>
            {weekly.id === sk.id && <span className="corner-tag">−{Math.round(WEEKLY_DISCOUNT * 100)}%</span>}
            <div className="shop-art skin-art">
              <RoosterSvg breedId={base.breedId} skin={sk.id} size={130} anim="idle" />
            </div>
            <b>
              {sk.emoji} {sk.name}
            </b>
            <RarityTag rarity={sk.rarity} />
            {owned(sk.id) ? (
              <button
                className="btn full"
                onClick={(e) => {
                  e.stopPropagation()
                  setApplyFor(sk)
                }}
              >
                ✅ Aplicar
              </button>
            ) : (
              <button
                className="btn btn-primary full"
                onClick={(e) => {
                  e.stopPropagation()
                  buy(sk)
                }}
              >
                <Price value={skinPrice(sk.id)} currency={sk.currency} />
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="tiny muted center">Skins são só visuais. Compre uma vez e use em qualquer galo.</p>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview ? `${preview.emoji} ${preview.name}` : ''} wide>
        {preview && (
          <div className="center">
            <div className="preview-row">
              {s.roosters.slice(0, 3).map((r, i) => (
                <RoosterSvg key={r.id} breedId={r.breedId} skin={preview.id} equipped={r.equipped} size={170} anim={i === 1 ? 'win' : 'idle'} flip={i === 2} />
              ))}
            </div>
            <p className="muted italic">"{preview.desc}"</p>
            <RarityTag rarity={preview.rarity} />
            <div className="row-center gap" style={{ marginTop: 12 }}>
              {owned(preview.id) ? (
                <button
                  className="btn btn-primary btn-lg"
                  onClick={() => {
                    setApplyFor(preview)
                    setPreview(null)
                  }}
                >
                  Aplicar em um galo
                </button>
              ) : (
                <button className="btn btn-gold btn-lg" onClick={() => buy(preview)}>
                  Comprar · <Price value={skinPrice(preview.id)} currency={preview.currency} />
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!applyFor} onClose={() => setApplyFor(null)} title={applyFor ? `Aplicar ${applyFor.name}` : ''}>
        {applyFor && (
          <div className="apply-grid">
            {s.roosters.map((r) => (
              <button
                key={r.id}
                className={`apply-item ${r.skin === applyFor.id ? 'selected' : ''}`}
                onClick={() => {
                  actions.applySkin(r.id, r.skin === applyFor.id ? null : applyFor.id)
                  toast(r.skin === applyFor.id ? `${r.name} voltou ao visual original.` : `${r.name} agora usa ${applyFor.name}!`, 'ok')
                }}
              >
                <RoosterSvg breedId={r.breedId} skin={applyFor.id} equipped={r.equipped} size={90} anim="none" />
                <b>{r.name}</b>
                <span className="tiny">{r.skin === applyFor.id ? '✅ Usando' : 'Aplicar'}</span>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </>
  )
}

// ---------------- Ferramentas ----------------

export function FerramentasTab() {
  const { state, actions, toast } = useGame()
  const s = state!
  const totalOwned = Object.values(s.tools).reduce((a, b) => a + b, 0)

  return (
    <>
      <div className="card tools-banner">
        <span className="big-emoji">🧰</span>
        <div className="grow">
          <b>Leve até {MAX_TOOLS} ferramentas para cada luta na {ARENA}.</b>
          <p className="tiny muted">Elas são gastas ao lutar e dão vantagem: mais ataque, defesa, cura, esquiva ou até levantar depois de um K.O.</p>
        </div>
        <div className="center">
          <b className="egg-amount">{totalOwned}</b>
          <div className="tiny muted">no estoque</div>
        </div>
        <button className="btn btn-primary" onClick={() => go('/rinha')}>
          ⚔️ Usar na {ARENA}
        </button>
      </div>

      <h3 className="section-title">💼 Kits</h3>
      <div className="bundles">
        {TOOL_KITS.map((k) => (
          <div key={k.id} className="card bundle">
            <div className="kit-emoji">{k.emoji}</div>
            <b>{k.name}</b>
            <div className="chips center-chips">
              {Object.entries(k.tools).map(([t, q]) => (
                <span key={t} className="chip" title={TOOL_BY_ID[t].name}>
                  {TOOL_BY_ID[t].emoji} ×{q}
                </span>
              ))}
            </div>
            <span className="tiny muted">{k.desc}</span>
            <button
              className="btn btn-primary full"
              onClick={async () => {
                const r = await actions.buyKit(k.id)
                if (r.ok) toast(`${k.emoji} ${k.name} comprado!`, 'ok')
                else toast(r.error, 'erro')
              }}
            >
              <Price value={k.price} currency={k.currency} />
            </button>
          </div>
        ))}
      </div>

      <h3 className="section-title">🛠️ Ferramentas avulsas</h3>
      <div className="grid-shop">
        {TOOLS.map((t) => (
          <div key={t.id} className={`card shop-item rar-${t.rarity}`}>
            <div className="shop-emoji">{t.emoji}</div>
            <div className="row-between">
              <b>{t.name}</b>
            </div>
            <div className="row-between">
              <RarityTag rarity={t.rarity} />
              <span className="tiny muted">Você tem: {s.tools[t.id] ?? 0}</span>
            </div>
            <p className="tiny tool-desc">{t.desc}</p>
            <div className="row gap">
              <button
                className="btn btn-primary grow"
                onClick={async () => {
                  const r = await actions.buyTool(t.id)
                  if (r.ok) toast(`${t.emoji} ${t.name} comprado!`, 'ok')
                  else toast(r.error, 'erro')
                }}
              >
                <Price value={t.price} currency={t.currency} />
              </button>
              <button
                className="btn btn-sm"
                title={`Comprar 5 por ${fmt(t.price * 5)}`}
                onClick={async () => {
                  const r = await actions.buyTool(t.id, 5)
                  if (r.ok) toast(`5x ${t.name} comprados!`, 'ok')
                  else toast(r.error, 'erro')
                }}
              >
                ×5
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
