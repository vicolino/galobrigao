import { useEffect, useState, type ReactNode } from 'react'
import { t } from '../i18n'
import { Modal, PageHead, go } from '../components/ui'

const SEEN_KEY = 'galo-tutorial-visto'
const OPEN_EVENT = 'galo-tutorial-abrir'

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* sem armazenamento */
  }
}

function alreadySeen() {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

/** Accordion com a cara do jogo: um card por seção de ajuda. */
function HelpItem({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="help-item card" open={open}>
      <summary>{title}</summary>
      <div className="help-body">{children}</div>
    </details>
  )
}

/** Página dedicada em #/ajuda: tutorial completo de como o jogo funciona. */
export function Ajuda() {
  return (
    <>
      <PageHead title={t('❓ Como jogar')} subtitle={t('Tudo o que você precisa saber pra dominar o terreiro. Toque numa seção pra abrir.')} />

      <div className="help-list">
        <HelpItem title={t('⚔️ Como lutar na Arena')} open>
          <p>{t('Escolha um oponente na Arena e mande o seu galo pra briga. Cada luta mostra a sua chance de vitória antes de você confirmar.')}</p>
          <p>{t('Lutar gasta energia ⚡. Quando a energia acaba, o galo precisa descansar ou comer pra recarregar.')}</p>
          <p>{t('Vencendo, você leva recompensas: milho 🌽, experiência pro galo subir de nível e prêmios especiais nos eventos.')}</p>
        </HelpItem>

        <HelpItem title={t('💪 Como evoluir e cuidar do seu galo')}>
          <ul className="help-ul">
            <li>{t('Alimentar 🌽: dá energia ⚡ e experiência na hora. Galo bem alimentado briga melhor.')}</li>
            <li>{t('Treinar: melhora os atributos do galo. Alguns treinos custam milho.')}</li>
            <li>{t('Subir de nível: juntando experiência nas lutas e nos cuidados, o galo sobe de nível e fica mais forte.')}</li>
            <li>{t('Evoluir o potencial ⭐: cada galo tem estrelas de potencial. Evoluir aumenta o teto de poder dele.')}</li>
            <li>{t('Vestir o galo: equipe skins e acessórios pra deixar o seu galo com a sua cara (e com bônus).')}</li>
          </ul>
        </HelpItem>

        <HelpItem title={t('🌽 Pra que serve o Milho')}>
          <p>{t('O milho é a moeda do dia a dia do jogo. Você ganha milho jogando: lutando, cumprindo missões e participando de eventos.')}</p>
          <p>{t('Use o milho pra treinar o galo e pra comprar na Feira e na Loja.')}</p>
        </HelpItem>

        <HelpItem title={t('🥚 Pra que serve o Ovo de ouro')}>
          <p>{t('O ovo de ouro é a moeda premium. Serve pra comprar skins, acessórios, cruzamento e edições raras.')}</p>
          <p>{t('Dá pra ganhar ovos jogando, ou comprar com dinheiro de verdade na Loja → Comprar.')}</p>
        </HelpItem>

        <HelpItem title={t('💎 Como funcionam as NFTs')}>
          <ul className="help-ul">
            <li>{t('Galos de nível 10 ou mais (vindos de cruzamento, edições ou kits pagos) e itens lendários podem "virar NFT" e ir pra sua Carteira.')}</li>
            <li>{t('Virar NFT não tira o item do jogo: ele continua valendo e lutando normalmente.')}</li>
            <li>{t('NFTs podem ser vendidos no Mercado por USDC (a plataforma cobra uma taxa na venda).')}</li>
            <li>{t('As edições de Raros (Loja → 💎 Raros) já viram NFT na hora da compra.')}</li>
          </ul>
        </HelpItem>

        <HelpItem title={t('💵 Depósito e Carteira')}>
          <ul className="help-ul">
            <li>{t('Depositar USDC vira ovos de ouro pra você gastar no jogo.')}</li>
            <li>{t('A Ponte move ovos e milho entre o jogo e a sua carteira cripto, em tokens EGG e CORN.')}</li>
            <li>{t('Dá pra enviar tokens pra outro jogador — ele é avisado quando recebe.')}</li>
            <li>{t('Pra sacar, é preciso completar o KYC (confirmação de identidade).')}</li>
          </ul>
        </HelpItem>

        <HelpItem title={t('🛒 Onde comprar e vender')}>
          <ul className="help-ul">
            <li>{t('Loja: compre galos, skins e edições raras direto do jogo.')}</li>
            <li>{t('Feira: negocie com outros jogadores pagando em ovos ou milho.')}</li>
            <li>{t('Mercado: compre e venda NFTs entre jogadores em USDC.')}</li>
          </ul>
        </HelpItem>
      </div>

      <div className="help-footer">
        <button className="btn btn-ghost" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
          {t('👋 Rever as boas-vindas')}
        </button>
      </div>
    </>
  )
}

/**
 * Modal de boas-vindas: abre sozinho no primeiro acesso (uma vez, via flag em
 * localStorage) e também pode ser reaberto pelo botão da página de ajuda.
 */
export function TutorialGate() {
  const [open, setOpen] = useState(false)

  // Primeiro acesso: abre sozinho depois de um instante, se ainda não foi visto.
  useEffect(() => {
    if (alreadySeen()) return
    const h = setTimeout(() => setOpen(true), 700)
    return () => clearTimeout(h)
  }, [])

  // Reabrir pela página de ajuda.
  useEffect(() => {
    const on = () => setOpen(true)
    window.addEventListener(OPEN_EVENT, on)
    return () => window.removeEventListener(OPEN_EVENT, on)
  }, [])

  const close = () => {
    setOpen(false)
    markSeen()
  }

  if (!open) return null
  return (
    <Modal open onClose={close} title={t('👋 Bem-vindo ao terreiro!')}>
      <div className="help-intro">
        <p className="muted">{t('Aqui vai o resumo rapidinho de como o jogo funciona:')}</p>
        <ul className="help-ul">
          <li>{t('⚔️ Lute na Arena pra ganhar milho e subir de nível.')}</li>
          <li>{t('💪 Alimente, treine e evolua o seu galo pra deixá-lo mais forte.')}</li>
          <li>{t('🌽 Milho é a moeda do dia a dia; 🥚 ovo de ouro é a moeda premium.')}</li>
          <li>{t('💎 Galos e itens raros viram NFT e podem ser vendidos no Mercado.')}</li>
        </ul>
        <div className="help-intro-actions">
          <button
            className="btn"
            onClick={() => {
              close()
              go('/ajuda')
            }}
          >
            {t('Ver ajuda completa')}
          </button>
          <button className="btn btn-primary" onClick={close}>
            {t('Começar a jogar 🐓')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
