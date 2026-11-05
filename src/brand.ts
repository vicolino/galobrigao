// Nome e textos da marca num lugar só. Troque aqui para renomear o jogo inteiro.
import { lang, t, type Lang } from './i18n'
// O nome muda por idioma: fora do Brasil o jogo se chama Chicken Fighter.
const NAMES: Record<Lang, string> = { pt: 'Galo Brigão', en: 'Chicken Fighter' } // i18n-ok (marca)
export const appName = (l: Lang = lang()) => NAMES[l]
export const APP_NAME = appName()
if (typeof document !== 'undefined') document.title = APP_NAME
export const APP_TAGLINE = t('Crie seu galo, treine, vista e domine a arena. 🌽')
export const ARENA = t('Arena')
export const COMPANY = 'Galo Brigão Jogos Digitais LTDA' // i18n-ok razão social (preencher)
export const SUPPORT_EMAIL = 'suporte@galobrigao.com.br' // i18n-ok e-mail de atendimento (preencher)
