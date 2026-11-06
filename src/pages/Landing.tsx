import { useEffect, useRef, useState } from 'react'
import { RoosterSvg } from '../components/RoosterSvg'
import { LangSwitch } from '../components/LangSwitch'
import { go } from '../components/ui'
import { APP_NAME, COMPANY, SUPPORT_EMAIL } from '../brand'
import { t } from '../i18n'

/** Galo animado que entra "voando" ao aparecer na tela. */
function Peek({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (ents) => ents.forEach((e) => e.isIntersecting && setSeen(true)),
      { threshold: 0.18 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={`lp-peek ${seen ? 'in' : ''}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}

/** Vitrine de um galo: arte + nome + raridade. */
function Showcase({
  breedId,
  skin,
  equipped,
  name,
  rarity,
}: {
  breedId: string
  skin?: string
  equipped?: Record<string, string>
  name: string
  rarity: 'comum' | 'raro' | 'epico' | 'lendario'
}) {
  return (
    <div className={`lp-card lp-rooster lp-r-${rarity}`}>
      <div className="lp-rooster-art">
        <RoosterSvg breedId={breedId} skin={skin} equipped={equipped} anim="idle" size={132} />
      </div>
      <b>{name}</b>
      <span className={`lp-rtag lp-rtag-${rarity}`}>
        {rarity === 'lendario' ? t('Lendário') : rarity === 'epico' ? t('Épico') : rarity === 'raro' ? t('Raro') : t('Comum')}
      </span>
    </div>
  )
}

export function Landing() {
  const criar = () => go('/criar')
  const entrar = () => go('/entrar')

  const steps = [
    { emoji: '🥚', title: t('1. Crie'), text: t('Escolha sua raça e ganhe seu primeiro galo de graça, na hora.'), breed: 'caipira' },
    { emoji: '🌽', title: t('2. Treine'), text: t('Treine com milho, suba de nível e evolua ataque, defesa e velocidade.'), breed: 'indio' },
    { emoji: '👑', title: t('3. Vista'), text: t('Equipe acessórios e skins. Monte conjuntos que dão bônus de verdade.'), breed: 'dourado', eq: { cabeca: 'coroa' } },
    { emoji: '🏆', title: t('4. Domine'), text: t('Vença a arena, os desafios e os torneios. Suba no ranking do terreiro.'), breed: 'trovao', skin: 'galaxia' },
  ]

  const modes = [
    { emoji: '🏟️', title: t('Arena'), text: t('Lute contra a máquina a qualquer hora e ganhe milho e experiência.') },
    { emoji: '⚔️', title: t('Desafios'), text: t('PvP de verdade: encare o galo de outros jogadores e prove quem manda.') },
    { emoji: '🏆', title: t('Torneios'), text: t('Chaves eliminatórias com prêmios para quem chegar na final.') },
    { emoji: '🎲', title: t('Apostas'), text: t('Aposte no resultado das rinhas e multiplique suas moedas.') },
    { emoji: '🧬', title: t('Cruzamento'), text: t('Cruze dois galos e gere pelagens raras que ninguém mais tem.') },
    { emoji: '🛒', title: t('Mercado & Feira'), text: t('Compre, venda e alugue galos com outros criadores.') },
  ]

  const collection: { breedId: string; skin?: string; equipped?: Record<string, string>; name: string; rarity: 'comum' | 'raro' | 'epico' | 'lendario' }[] = [
    { breedId: 'dourado', skin: 'ouro', name: t('Ouro Maciço'), rarity: 'lendario' },
    { breedId: 'trovao', skin: 'galaxia', name: t('Galáxia Sideral'), rarity: 'lendario' },
    { breedId: 'sedoso', skin: 'neon', name: t('Neon Cyberpunk'), rarity: 'epico' },
    { breedId: 'aurora', skin: 'arcoiris', name: t('Arco-Íris Furioso'), rarity: 'epico' },
    { breedId: 'indio', skin: 'lava', name: t('Magma Vulcânico'), rarity: 'lendario' },
    { breedId: 'caipira', skin: 'gelo', name: t('Galo de Gelo'), rarity: 'epico' },
    { breedId: 'carijo', skin: 'robo', name: t('Galo-Robô'), rarity: 'epico' },
    { breedId: 'pescoco-pelado', skin: 'sombra', name: t('Sombra Noturna'), rarity: 'epico' },
  ]

  const faqs = [
    { q: t('É de graça pra jogar?'), a: t('É sim. Você cria a conta e ganha um galo na hora, sem pagar nada. Itens e skins premium são opcionais, pra quem quiser turbinar.') },
    { q: t('Preciso baixar alguma coisa?'), a: t('Não. Roda direto no navegador, no celular ou no computador. Abriu, jogou.') },
    { q: t('Dá pra jogar contra meus amigos?'), a: t('Dá. No modo Desafios você encara o galo de outros jogadores de verdade em PvP, e ainda disputa os torneios do terreiro.') },
    { q: t('Meu galo fica salvo?'), a: t('Fica. Sua conta guarda tudo — galos, nível, moedas e coleção — e você continua de onde parou em qualquer aparelho.') },
  ]

  const year = new Date().getFullYear()

  return (
    <div className="lp">
      {/* ---------- Topo ---------- */}
      <header className="lp-top">
        <div className="lp-top-in">
          <button className="lp-brand" onClick={() => go('/')} aria-label={APP_NAME}>
            <span className="lp-brand-mark">
              <RoosterSvg breedId="dourado" skin="fogo" equipped={{ cabeca: 'coroa' }} anim="idle" size={38} />
            </span>
            <span className="lp-brand-word">{APP_NAME}</span>
          </button>
          <div className="lp-top-right">
            <span className="lp-top-lang"><LangSwitch compact /></span>
            <button className="btn btn-ghost" onClick={entrar}>{t('Entrar')}</button>
            <button className="btn btn-primary" onClick={criar}>{t('Criar meu galo')}</button>
          </div>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="lp-hero">
        <div className="lp-hero-grid">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow">🐓 {t('Grátis pra jogar · roda no navegador')}</span>
            <h1 className="title-font lp-h1">{t('Crie seu galo. Treine. Vista. Domine a arena.')}</h1>
            <p className="lp-lead">{t('O terreiro mais brabo da internet. Monte seu galo campeão, encare outros jogadores no desafio, aposte, cruze raças lendárias e suba no ranking.')}</p>
            <div className="lp-cta-row">
              <button className="btn btn-primary btn-lg lp-cta pulse" onClick={criar}>🐓 {t('Criar meu galo grátis')}</button>
              <button className="btn btn-lg lp-cta-ghost" onClick={entrar}>{t('Já tenho conta')}</button>
            </div>
            <div className="lp-proof">
              <div><b>20+</b><span>{t('raças')}</span></div>
              <div><b>25+</b><span>{t('skins')}</span></div>
              <div><b>4</b><span>{t('estilos de luta')}</span></div>
              <div><b>PvP</b><span>{t('ao vivo')}</span></div>
            </div>
          </div>
          <div className="lp-hero-stage" aria-hidden="true">
            <div className="lp-hero-glow" />
            <div className="lp-hero-main">
              <RoosterSvg breedId="dourado" skin="fogo" equipped={{ cabeca: 'coroa' }} anim="idle" size={300} />
            </div>
            <div className="lp-hero-mini lp-hero-mini-a">
              <RoosterSvg breedId="trovao" skin="galaxia" anim="idle" size={118} />
            </div>
            <div className="lp-hero-mini lp-hero-mini-b">
              <RoosterSvg breedId="sedoso" skin="neon" anim="idle" size={104} />
            </div>
          </div>
        </div>
        <div className="lp-ground" aria-hidden="true" />
      </section>

      {/* ---------- Como funciona ---------- */}
      <section className="lp-sec">
        <div className="lp-sec-head">
          <h2 className="title-font">{t('Do ovo ao campeão em 4 passos')}</h2>
          <p className="muted">{t('Simples de começar, difícil de largar.')}</p>
        </div>
        <div className="lp-steps">
          {steps.map((s, i) => (
            <Peek key={s.title} delay={i * 70}>
              <div className="lp-card lp-step">
                <div className="lp-step-art">
                  <RoosterSvg breedId={s.breed} skin={s.skin} equipped={s.eq} anim="idle" size={116} />
                </div>
                <h3>{s.emoji} {s.title}</h3>
                <p className="muted">{s.text}</p>
              </div>
            </Peek>
          ))}
        </div>
      </section>

      {/* ---------- Modos de jogo ---------- */}
      <section className="lp-sec lp-sec-tint">
        <div className="lp-sec-head">
          <h2 className="title-font">{t('Seis jeitos de botar o galo pra brigar')}</h2>
          <p className="muted">{t('Tem sempre o que fazer no terreiro.')}</p>
        </div>
        <div className="lp-modes">
          {modes.map((m, i) => (
            <Peek key={m.title} delay={i * 50}>
              <div className="lp-card lp-mode">
                <span className="lp-mode-ico">{m.emoji}</span>
                <h3>{m.title}</h3>
                <p className="muted">{m.text}</p>
              </div>
            </Peek>
          ))}
        </div>
      </section>

      {/* ---------- Coleção ---------- */}
      <section className="lp-sec">
        <div className="lp-sec-head">
          <h2 className="title-font">{t('Colecione galos de dar inveja no terreiro')}</h2>
          <p className="muted">{t('Raças lendárias, skins de fogo, gelo, neon e ouro. Cada galo é único.')}</p>
        </div>
        <div className="lp-collection">
          {collection.map((c, i) => (
            <Peek key={c.name + i} delay={(i % 4) * 60}>
              <Showcase {...c} />
            </Peek>
          ))}
        </div>
      </section>

      {/* ---------- Sets / equipamento ---------- */}
      <section className="lp-sec lp-sec-dark">
        <div className="lp-split">
          <div className="lp-split-art" aria-hidden="true">
            <div className="lp-split-glow" />
            <RoosterSvg
              breedId="dourado"
              skin="lava"
              equipped={{ cabeca: 'drag-elmo', rosto: 'drag-presas', corpo: 'drag-couraca', pes: 'drag-garras' }}
              anim="idle"
              size={260}
            />
          </div>
          <div className="lp-split-copy">
            <span className="lp-eyebrow lp-eyebrow-gold">🐲 {t('Conjuntos lendários')}</span>
            <h2 className="title-font">{t('Monte combinações que mudam o jogo')}</h2>
            <p className="lp-lead">{t('Equipamentos raros destravam conforme seu galo sobe de nível. Junte um conjunto inteiro e libere bônus de atributo e XP acelerado — do Elmo às Garras do Dragão.')}</p>
            <ul className="lp-perks">
              <li>⚔️ {t('Bônus de ataque, defesa e vida que se somam')}</li>
              <li>⚡ {t('XP acelerado pra evoluir mais rápido')}</li>
              <li>🔒 {t('Peças que só liberam nos níveis mais altos')}</li>
            </ul>
            <button className="btn btn-gold btn-lg lp-cta" onClick={criar}>{t('Começar a montar o meu')}</button>
          </div>
        </div>
      </section>

      {/* ---------- Por que jogar ---------- */}
      <section className="lp-sec">
        <div className="lp-why">
          <Peek><div className="lp-card lp-why-card"><span className="lp-mode-ico">🆓</span><h3>{t('Comece de graça')}</h3><p className="muted">{t('Conta grátis, galo grátis. Nenhum cartão pra começar a jogar.')}</p></div></Peek>
          <Peek delay={60}><div className="lp-card lp-why-card"><span className="lp-mode-ico">🌽</span><h3>{t('Jogue no seu ritmo')}</h3><p className="muted">{t('Ganhe milho jogando e evolua sem gastar. Premium é só pra quem quiser.')}</p></div></Peek>
          <Peek delay={120}><div className="lp-card lp-why-card"><span className="lp-mode-ico">📱</span><h3>{t('Sem download')}</h3><p className="muted">{t('Roda no celular e no computador, direto no navegador. Abriu, jogou.')}</p></div></Peek>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="lp-sec lp-sec-tint">
        <div className="lp-sec-head">
          <h2 className="title-font">{t('Perguntas rápidas')}</h2>
        </div>
        <div className="lp-faq">
          {faqs.map((f) => (
            <details key={f.q} className="lp-faq-item">
              <summary>{f.q}</summary>
              <p className="muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------- CTA final ---------- */}
      <section className="lp-sec">
        <div className="lp-final">
          <div className="lp-final-art" aria-hidden="true">
            <RoosterSvg breedId="dourado" skin="fogo" equipped={{ cabeca: 'coroa' }} anim="win" size={150} />
          </div>
          <h2 className="title-font">{t('Pronto pra soltar o galo?')}</h2>
          <p className="lp-lead">{t('Leva menos de um minuto pra criar o seu e entrar na primeira rinha.')}</p>
          <button className="btn btn-primary btn-lg lp-cta pulse" onClick={criar}>🐓 {t('Criar meu galo grátis')}</button>
        </div>
      </section>

      {/* ---------- Rodapé ---------- */}
      <footer className="lp-foot">
        <div className="lp-foot-in">
          <div className="lp-foot-brand">
            <RoosterSvg breedId="dourado" skin="fogo" equipped={{ cabeca: 'coroa' }} anim="none" size={34} />
            <b className="title-font">{APP_NAME}</b>
          </div>
          <nav className="lp-foot-links">
            <a href="#/termos">{t('Termos de uso')}</a>
            <a href="#/privacidade">{t('Privacidade')}</a>
            <a href={`mailto:${SUPPORT_EMAIL}`}>{t('Suporte')}</a>
          </nav>
          <p className="tiny muted lp-foot-legal">
            {t('Proibido para menores de 18 anos.')} · © {year} {COMPANY}
          </p>
        </div>
      </footer>
    </div>
  )
}
