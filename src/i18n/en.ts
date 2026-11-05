// Dicionário inglês: junta os arquivos por área. A chave é sempre o texto original em português.
import fight from './en/fight'
import game from './en/game'
import misc from './en/misc'
import pages from './en/pages'
import server from './en/server'
import shell from './en/shell'
import { NPC_OWNERS_EN, NPC_OWNERS_PT, ROOSTER_NAMES_EN, ROOSTER_NAMES_PT } from '../game/names'

// Nomes sorteados no servidor (em português) viram o equivalente em inglês
const names: Record<string, string> = {}
ROOSTER_NAMES_PT.forEach((n, i) => (names[n] = ROOSTER_NAMES_EN[i]))
NPC_OWNERS_PT.forEach((n, i) => (names[n] = NPC_OWNERS_EN[i]))

export const EN: Record<string, string> = { ...names, ...game, ...fight, ...shell, ...pages, ...misc, ...server }
