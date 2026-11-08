// 💵 Cotação viva do USDC em BRL (CoinGecko), com cache. Usada na venda de USDC por PIX.
// A base efetiva é a cotação viva (quando autoRate e fresca) ou o valor manual do admin (fallback).
import { live } from '../src/game/config'

const TTL = 3 * 60_000 // refaz a busca se o cache passar disso
const MAX_AGE = 30 * 60_000 // além disso não confia na cotação viva (cai no manual)
let cache = { rate: 0, at: 0 }

export async function refreshUsdcBrl(): Promise<void> {
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=brl', {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return
    const j = (await r.json()) as { 'usd-coin'?: { brl?: number } }
    const v = Number(j?.['usd-coin']?.brl)
    if (Number.isFinite(v) && v > 0) cache = { rate: v, at: Date.now() }
  } catch {
    /* mantém o cache anterior */
  }
}

/** Dispara uma atualização em background se o cache estiver velho (não bloqueia). */
export function maybeRefreshUsdcBrl() {
  if (Date.now() - cache.at > TTL) void refreshUsdcBrl()
}

/** Cotação viva (BRL por 1 USDC) ou null se indisponível/velha demais. */
export function liveUsdcBrl(): number | null {
  if (!cache.rate || Date.now() - cache.at > MAX_AGE) return null
  return cache.rate
}

/** Base efetiva (BRL por 1 USDC): cotação viva quando autoRate e fresca; senão o manual. */
export function effectiveBrlPerUsdc(): number {
  const cfg = live.usdcSale
  if (cfg.autoRate) {
    maybeRefreshUsdcBrl()
    const v = liveUsdcBrl()
    if (v) return v
  }
  return cfg.brlPerUsdc
}

/** Preço final ao jogador (R$ por 1 USDC) = base efetiva × (1 + margem). */
export function usdcSalePrice(): number {
  return Math.round(effectiveBrlPerUsdc() * (1 + live.usdcSale.marginPct / 100) * 100) / 100
}
