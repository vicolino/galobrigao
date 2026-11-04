import { useState } from 'react'
import { RoosterSvg, type Anim } from '../components/RoosterSvg'
import { Bar, Empty, Modal, PageHead, RarityTag, RoosterCard, Stars, StyleTag, go } from '../components/ui'
import { ACCESSORIES, ACC_BY_ID, BREED_BY_ID, ITEMS, SKIN_BY_ID, SLOTS, STYLES } from '../game/data'
import { currentEnergy, finalStats, fmt, power, sellPrice, xpToNext } from '../game/rooster'
import { FEED_COOLDOWN, STAR_COST, useGame } from '../game/store'
import type { Slot, Style } from '../game/types'

export function Galinheiro({ selectedId }: { selectedId?: string }) {
  const { state } = useGame()
  const s = state!
  const sel = s.roosters.find((r) => r.id === selectedId)

  if (sel) return <RoosterDetail id={sel.id} />

  const freeAcc = Object.entries(s.accessories).filter(([, n]) => n > 0)
  const items = Object.entries(s.items).filter(([, n]) => n > 0)

  return (
    <>
      <PageHead
        title="🏠 Galinheiro"
        subtitle={`${s.roosters.length}/12 galos · clique em um galo para cuidar, treinar e vestir`}
        right={
          <button className="btn" onClick={() => go('/loja/galos')}>
            🛒 Comprar galos
          </button>
        }
      />
      <div className="grid-cards">
        {s.roosters.map((r) => (
          <RoosterCard key={r.id} ro={r} onClick={() => go(`/galinheiro/${r.id}`)} footer={<div className="rc-record">{r.wins}V · {r.losses}D · {r.kos} K.O.</div>} />
        ))}
        <div className="card add-card clickable" onClick={() => go('/loja/galos')}>
          <div className="add-plus">＋</div>
          <span>Novo galo</span>
        </div>
      </div>

      <h2 className="section-title">🎒 Inventário</h2>
      <div className="two-col">
        <div className="card">
          <h3>Acessórios guardados</h3>
          {freeAcc.length === 0 ? (
            <p className="muted">Nenhum acessório livre. <a href="#/loja/acessorios">Ver na loja →</a></p>
          ) : (
            <div className="chips">
              {freeAcc.map(([id, n]) => (
                <span key={id} className="chip">
                  {ACC_BY_ID[id].emoji} {ACC_BY_ID[id].name} ×{n}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h3>Itens</h3>
          {items.length === 0 ? (
            <p className="muted">Sem itens. <a href="#/loja/itens">Ver na loja →</a></p>
          ) : (
            <div className="chips">
              {items.map(([id, n]) => {
                const it = ITEMS.find((i) => i.id === id)!
                return (
                  <span key={id} className="chip">
                    {it.emoji} {it.name} ×{n}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function RoosterDetail({ id }: { id: string }) {
  const { state, actions, toast } = useGame()
  const s = state!
  const ro = s.roosters.find((r) => r.id === id)!
  const breed = BREED_BY_ID[ro.breedId]
  const st = finalStats(ro)
  const en = currentEnergy(ro)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [itemsOpen, setItemsOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(ro.name)
  const [styleOpen, setStyleOpen] = useState(false)
  const [sellOpen, setSellOpen] = useState(false)
  const [skinOpen, setSkinOpen] = useState(false)
  const [anim, setAnim] = useState<Anim>('idle')

  const flash = (a: Anim, ms = 700) => {
    setAnim(a)
    setTimeout(() => setAnim('idle'), ms)
  }

  const train = () => {
    const r = actions.train(ro.id)
    if (r.ok) {
      flash('attack')
      toast(r.value!, 'ok')
    } else toast(r.error, 'erro')
  }

  const feedReady = !ro.fedAt || Date.now() - ro.fedAt >= FEED_COOLDOWN
  const leftMs = ro.fedAt ? FEED_COOLDOWN - (Date.now() - ro.fedAt) : 0
  const leftMin = Math.ceil(leftMs / 60_000)
  const feedLeft = `${Math.floor(leftMin / 60)}h ${leftMin % 60}min`
  const doFeed = async (instant: boolean) => {
    const r = await actions.feed(ro.id, instant)
    if (r.ok) {
      flash('win', 900)
      toast(r.value!, 'ok')
    } else toast(r.error, 'erro')
  }

  const ownedFor = (sl: Slot) => ACCESSORIES.filter((a) => a.slot === sl && (s.accessories[a.id] ?? 0) > 0)
  const xpMax = xpToNext(ro.level)

  return (
    <>
      <button className="btn btn-ghost back" onClick={() => go('/galinheiro')}>
        ← Voltar ao galinheiro
      </button>
      <div className="detail">
        <div className="card detail-art">
          <div className="detail-stage">
            <RoosterSvg breedId={ro.breedId} skin={ro.skin} equipped={ro.equipped} size="100%" anim={anim} />
          </div>
          <div className="slots">
            {(Object.keys(SLOTS) as Slot[]).map((sl) => {
              const acc = ro.equipped[sl] ? ACC_BY_ID[ro.equipped[sl]!] : null
              return (
                <button key={sl} className={`slot ${acc ? 'filled rar-' + acc.rarity : ''}`} onClick={() => setSlot(sl)}>
                  <span className="slot-emoji">{acc ? acc.emoji : SLOTS[sl].emoji}</span>
                  <span className="tiny">{acc ? acc.name : SLOTS[sl].label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="card detail-info">
          <div className="row-between">
            <div>
              {renaming ? (
                <form
                  className="rename"
                  onSubmit={(e) => {
                    e.preventDefault()
                    actions.rename(ro.id, newName)
                    setRenaming(false)
                  }}
                >
                  <input autoFocus maxLength={18} value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <button className="btn btn-sm btn-primary">Salvar</button>
                </form>
              ) : (
                <h1 className="detail-name" onClick={() => setRenaming(true)} title="Clique para renomear">
                  {ro.name} <span className="edit">✏️</span>
                </h1>
              )}
              <p className="muted">
                {breed.name} · <RarityTag rarity={breed.rarity} /> · <Stars n={ro.stars} />
                {ro.skin && <span className="skin-badge"> · {SKIN_BY_ID[ro.skin].emoji} {SKIN_BY_ID[ro.skin].name}</span>}
              </p>
            </div>
            <div className="level-badge">
              <small>Nível</small>
              <b>{ro.level}</b>
            </div>
          </div>
          <p className="muted italic">"{breed.desc}"</p>

          <div className="bars">
            <Bar value={ro.xp} max={xpMax} kind="xp" label={`XP ${fmt(ro.xp)}/${fmt(xpMax)}`} />
            <Bar value={en} max={100} kind="energy" label={`Energia ${en}/100 ${en < 100 ? '(+1/min)' : ''}`} />
          </div>

          <div className="stat-grid">
            <Stat emoji="❤️" label="Vida" value={st.hp} max={260} />
            <Stat emoji="🗡️" label="Ataque" value={st.atk} max={60} />
            <Stat emoji="🛡️" label="Defesa" value={st.def} max={50} />
            <Stat emoji="💨" label="Velocidade" value={st.spd} max={50} />
          </div>

          <div className="row-between wrap gap">
            <div>
              <StyleTag style={ro.style} /> <span className="muted tiny">Especial: {STYLES[ro.style].special}</span>
            </div>
            <span className="power big">⚡ Poder {power(ro)}</span>
          </div>
          <div className="record">
            <div>
              <b>{ro.wins}</b>
              <span>Vitórias</span>
            </div>
            <div>
              <b>{ro.losses}</b>
              <span>Derrotas</span>
            </div>
            <div>
              <b>{ro.kos}</b>
              <span>K.O.s</span>
            </div>
            <div>
              <b>{ro.wins + ro.losses ? Math.round((ro.wins / (ro.wins + ro.losses)) * 100) : 0}%</b>
              <span>Aproveitamento</span>
            </div>
          </div>
          {(ro.lucky ?? 0) > 0 && <p className="lucky">🍀 Sortudo por mais {ro.lucky} luta(s)</p>}

          <div className="grow-box">
            <div className="grow-item">
              <span className="big-emoji">🌽</span>
              <div className="grow">
                <b>Alimentar</b>
                <div className="tiny muted">
                  +{30 + ro.level * 6} XP e +15 energia. {feedReady ? 'Pronto para comer!' : `Grátis de novo em ${feedLeft}.`}
                </div>
              </div>
              {feedReady ? (
                <button className="btn btn-primary btn-sm pulse" onClick={() => doFeed(false)}>
                  Dar comida
                </button>
              ) : (
                <button className="btn btn-sm" onClick={() => doFeed(true)}>
                  Agora · 🥚 3
                </button>
              )}
            </div>
            <div className="grow-item">
              <span className="big-emoji">⭐</span>
              <div className="grow">
                <b>Evoluir potencial</b>
                <div className="tiny muted">
                  {ro.stars >= 5 ? 'Potencial máximo atingido.' : `${ro.stars}★ → ${ro.stars + 1}★: +6% em tudo e cresce mais rápido por nível.`}
                </div>
              </div>
              {ro.stars < 5 && (
                <button
                  className="btn btn-gold btn-sm"
                  onClick={async () => {
                    const r = await actions.upgradeStars(ro.id)
                    if (r.ok) {
                      flash('special', 900)
                      toast(`⭐ ${ro.name} agora tem ${ro.stars + 1} estrelas!`, 'ok')
                    } else if (r.error.includes('Ovos')) go('/loja/ovos')
                    else toast(r.error, 'erro')
                  }}
                >
                  🥚 {STAR_COST[ro.stars]}
                </button>
              )}
            </div>
          </div>

          <div className="actions">
            <button className="btn btn-primary" onClick={() => go(`/rinha?galo=${ro.id}`)}>
              ⚔️ Lutar
            </button>
            <button className="btn" onClick={train}>
              💪 Treinar <small>(🌽{100 + ro.level * 25} · ⚡15)</small>
            </button>
            <button className="btn" onClick={() => setItemsOpen(true)}>
              🍽️ Usar item
            </button>
            <button className="btn" onClick={() => setSkinOpen(true)}>
              🎨 Skin
            </button>
            <button className="btn" onClick={() => setStyleOpen(true)}>
              🎭 Estilo
            </button>
            <button className="btn btn-danger" onClick={() => setSellOpen(true)}>
              💰 Vender
            </button>
          </div>
        </div>
      </div>

      <Modal open={!!slot} onClose={() => setSlot(null)} title={slot ? `${SLOTS[slot].emoji} ${SLOTS[slot].label}` : ''}>
        {slot && (
          <>
            {ro.equipped[slot] && (
              <div className="equip-current">
                <span>
                  Equipado: <b>{ACC_BY_ID[ro.equipped[slot]!].emoji} {ACC_BY_ID[ro.equipped[slot]!].name}</b>
                </span>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    actions.unequip(ro.id, slot)
                    setSlot(null)
                  }}
                >
                  Tirar
                </button>
              </div>
            )}
            {ownedFor(slot).length === 0 ? (
              <Empty
                emoji="🛍️"
                title="Nada guardado pra esse lugar"
                text="Compre acessórios na loja ou abra caixas surpresa."
                action={
                  <button className="btn btn-primary" onClick={() => go('/loja/acessorios')}>
                    Ir para a loja
                  </button>
                }
              />
            ) : (
              <div className="list">
                {ownedFor(slot).map((a) => (
                  <div key={a.id} className="list-row">
                    <span className="big-emoji">{a.emoji}</span>
                    <div className="grow">
                      <b>{a.name}</b> <RarityTag rarity={a.rarity} /> <span className="tiny muted">×{s.accessories[a.id]}</span>
                      <div className="tiny bonus">{bonusText(a.bonus)}</div>
                    </div>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => {
                        const r = actions.equip(ro.id, a.id)
                        if (!r.ok) toast(r.error, 'erro')
                        else {
                          flash('win', 900)
                          setSlot(null)
                        }
                      }}
                    >
                      Equipar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal open={itemsOpen} onClose={() => setItemsOpen(false)} title="🍽️ Usar item">
        <div className="list">
          {ITEMS.map((it) => (
            <div key={it.id} className="list-row">
              <span className="big-emoji">{it.emoji}</span>
              <div className="grow">
                <b>{it.name}</b> <span className="tiny muted">×{s.items[it.id] ?? 0}</span>
                <div className="tiny muted">{it.desc}</div>
              </div>
              {(s.items[it.id] ?? 0) > 0 ? (
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    const r = actions.useItem(it.id, ro.id)
                    if (r.ok) {
                      toast(r.value!, 'ok')
                      flash('special', 900)
                    } else toast(r.error, 'erro')
                  }}
                >
                  Usar
                </button>
              ) : (
                <button
                  className="btn btn-sm"
                  onClick={async () => {
                    const r = await actions.buyItem(it.id)
                    if (r.ok) toast(`${it.name} comprado!`, 'ok')
                    else toast(r.error, 'erro')
                  }}
                >
                  {it.currency === 'milho' ? '🌽' : '🥚'} {fmt(it.price)}
                </button>
              )}
            </div>
          ))}
        </div>
      </Modal>

      <Modal open={skinOpen} onClose={() => setSkinOpen(false)} title="🎨 Escolher skin" wide>
        <div className="apply-grid">
          <button
            className={`apply-item ${!ro.skin ? 'selected' : ''}`}
            onClick={() => {
              actions.applySkin(ro.id, null)
              flash('special', 900)
            }}
          >
            <RoosterSvg breedId={ro.breedId} equipped={ro.equipped} size={90} anim="none" />
            <b>Original</b>
            <span className="tiny">{breed.name}</span>
          </button>
          {s.skins.map((id) => (
            <button
              key={id}
              className={`apply-item ${ro.skin === id ? 'selected' : ''}`}
              onClick={() => {
                actions.applySkin(ro.id, id)
                flash('special', 900)
              }}
            >
              <RoosterSvg breedId={ro.breedId} skin={id} equipped={ro.equipped} size={90} anim="none" />
              <b>
                {SKIN_BY_ID[id].emoji} {SKIN_BY_ID[id].name}
              </b>
            </button>
          ))}
          <button className="apply-item more" onClick={() => go('/loja/skins')}>
            <span className="add-plus">＋</span>
            <b>Mais skins</b>
            <span className="tiny">{s.skins.length === 0 ? 'Você ainda não tem skins' : 'Ver loja'}</span>
          </button>
        </div>
      </Modal>

      <Modal open={styleOpen} onClose={() => setStyleOpen(false)} title="🎭 Trocar estilo de luta">
        <p className="muted">Trocar o estilo custa 🌽 800. O estilo muda os atributos e o golpe especial.</p>
        <div className="list">
          {(Object.keys(STYLES) as Style[]).map((k) => (
            <div key={k} className={`list-row ${ro.style === k ? 'current' : ''}`}>
              <span className="big-emoji">{STYLES[k].emoji}</span>
              <div className="grow">
                <b>{STYLES[k].label}</b>
                <div className="tiny muted">
                  {STYLES[k].desc} Especial: {STYLES[k].special}.
                </div>
              </div>
              {ro.style === k ? (
                <span className="tiny">Atual</span>
              ) : (
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    const r = actions.setStyle(ro.id, k)
                    if (r.ok) {
                      toast(`${ro.name} agora é ${STYLES[k].label}!`, 'ok')
                      setStyleOpen(false)
                    } else toast(r.error, 'erro')
                  }}
                >
                  Escolher
                </button>
              )}
            </div>
          ))}
        </div>
      </Modal>

      <Modal open={sellOpen} onClose={() => setSellOpen(false)} title="💰 Vender galo">
        <p>
          Vender <b>{ro.name}</b> por <b>🌽 {fmt(sellPrice(ro))}</b>? Os acessórios voltam para o seu inventário.
        </p>
        <div className="row-end gap">
          <button className="btn" onClick={() => setSellOpen(false)}>
            Cancelar
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              const r = actions.sell(ro.id)
              if (r.ok) {
                toast(`Vendido por 🌽 ${fmt(r.value!)}`, 'ok')
                go('/galinheiro')
              } else toast(r.error, 'erro')
              setSellOpen(false)
            }}
          >
            Vender
          </button>
        </div>
      </Modal>
    </>
  )
}

function Stat({ emoji, label, value, max }: { emoji: string; label: string; value: number; max: number }) {
  return (
    <div className="stat">
      <span>
        {emoji} {label}
      </span>
      <b>{value}</b>
      <div className="mini-track">
        <div style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
    </div>
  )
}

export function bonusText(b: Partial<Record<string, number>>) {
  const names: Record<string, string> = { hp: '❤️ Vida', atk: '🗡️ Ataque', def: '🛡️ Defesa', spd: '💨 Veloc.' }
  return Object.entries(b)
    .map(([k, v]) => `${names[k]} +${v}`)
    .join(' · ')
}
