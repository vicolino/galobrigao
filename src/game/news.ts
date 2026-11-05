// Novidades de cada versão. A cada publicação com algo novo para o jogador, adicione uma entrada NO TOPO.
// O id é a data (AAAA-MM-DD[-n]); textos em português com t() (tradução em src/i18n/en/novidades.ts).
import { t } from '../i18n'

export interface NewsItem {
  emoji: string
  title: string
  text: string
  /** Rota do jogo (ex.: '/feira') para o botão "Ver". */
  link?: string
}
export interface Release {
  id: string
  date: string
  title: string
  items: NewsItem[]
}

export const RELEASES = (): Release[] => [
  {
    id: '2026-11-05',
    date: '2026-11-05',
    title: t('A maior atualização do terreiro!'),
    items: [
      { emoji: '🏪', title: t('Feira'), text: t('Compre e venda galos, acessórios e skins com outros criadores. Dá até para mandar presente!'), link: '/feira' },
      { emoji: '🎫', title: t('Passe da Temporada'), text: t('30 níveis de prêmios todo mês. No premium: skins exclusivas e o Galo da Temporada.'), link: '/passe' },
      { emoji: '🥚', title: t('Cruzamento'), text: t('Cruze dois galos e choque um pintinho. Ele pode nascer com mutação ou pelagem rara!'), link: '/cruzamento' },
      { emoji: '📈', title: t('Ranking dos galinheiros'), text: t('Veja os galinheiros mais valiosos e mostre a sua vitrine.'), link: '/ranking' },
      { emoji: '💎', title: t('Edições limitadas'), text: t('Coroa de Diamante (só 50) e Rei do Gramado (só 100). Quando acabar, acabou.'), link: '/loja/skins' },
      { emoji: '🎁', title: t('Primeira compra em dobro'), text: t('Na sua primeira compra, os pacotes de ovos vêm com o DOBRO de ovos.'), link: '/loja/ovos' },
      { emoji: '⚡', title: t('Ofertas relâmpago e recarga'), text: t('Ofertas de 1 hora nos momentos certos e recarga de energia na hora.') },
      { emoji: '💰', title: t('Valor do galinheiro'), text: t('Veja quanto vale o seu galinheiro e quanto ele valorizou.'), link: '/galinheiro' },
    ],
  },
]

export const latestNewsId = () => RELEASES()[0]?.id ?? ''
/** Notas que o jogador ainda não viu (mais nova primeiro). */
export const unseenNews = (seen?: string) => RELEASES().filter((r) => !seen || r.id > seen)
