// 💵 Pagamento da loja em USDC: o valor sai da carteira custodial do jogador para a tesouraria NA CHAIN
// e o produto só é entregue depois da tx confirmada. Mesmo cuidado do depósito (server/deposito.ts):
// o hash e a tx assinada são gravados no pedido ANTES de transmitir; se o servidor cair no meio, o
// reconciliador confere o recibo e termina. A entrega (fulfill) é idempotente, então nunca entrega duas vezes.
import { randomUUID } from 'node:crypto'
import { getAddress, type Address, type Hash } from 'viem'
import { t } from '../src/i18n'
import { chainy, depositTxState, isMainnet, payUsdc, tokenBalance, userAccount } from './chain'
import { getDb, type OrderRow, type UserRow } from './db'
import { depositTreasury } from './deposito'
import { Web3Error } from './web3'

const db = () => getDb()
const fail = (status: number, m: string, extra?: Record<string, unknown>): never => {
  throw new Web3Error(status, m, extra)
}

/** 1 centavo de USDC = 10.000 unidades on-chain (USDC tem 6 casas). */
export const usdcUnits = (cents: number) => BigInt(cents) * 10_000n

/** Entrega o pedido pago (é o fulfill do app.ts, passado por parâmetro para evitar import circular). */
export type Fulfill = (orderId: string) => unknown

const userBusy = new Set<string>()
/** Pedidos sendo pagos agora neste processo (o reconciliador não mexe neles). */
const inFlight = new Set<string>()

const getOrder = (id: string) => db().prepare('SELECT * FROM orders WHERE id = ?').get(id) as unknown as OrderRow
const refuse = (id: string) => db().prepare("UPDATE orders SET status = 'recusado' WHERE id = ? AND status = 'pendente'").run(id)

function deliver(id: string, fulfill: Fulfill) {
  try {
    fulfill(id)
  } catch (e) {
    // USDC já saiu: o pedido fica pendente e o reconciliador tenta entregar de novo
    console.error('[usdc-pay] entrega falhou', id, e instanceof Error ? e.message : e)
  }
}

/** Confere na chain um pedido em USDC pendente e termina (entrega ou recusa). */
export async function settleUsdcOrder(order: OrderRow, fulfill: Fulfill) {
  if (order.method !== 'usdc' || order.status !== 'pendente' || inFlight.has(order.id) || !chainy()) return
  if (!order.provider_ref) {
    // Nunca foi assinada (o hash é gravado antes de transmitir): nada saiu da carteira
    if (Date.now() - order.created_at > 5 * 60_000) refuse(order.id)
    return
  }
  const st = await depositTxState(order.provider_ref as Hash, (order.tx_raw as `0x${string}` | null) ?? null, order.from_addr as Address)
  if (st === 'success') deliver(order.id, fulfill)
  else if (st === 'reverted' || st === 'dropped') refuse(order.id)
}

/** Termina os pedidos em USDC pendentes (de um jogador ou de todos). Erros de rede ficam para a próxima. */
export async function reconcileUsdcOrders(fulfill: Fulfill, userId?: string) {
  if (!chainy()) return
  const rows = (userId
    ? db().prepare("SELECT * FROM orders WHERE method = 'usdc' AND status = 'pendente' AND user_id = ?").all(userId)
    : db().prepare("SELECT * FROM orders WHERE method = 'usdc' AND status = 'pendente' LIMIT 200").all()) as unknown as OrderRow[]
  for (const o of rows) {
    try {
      await settleUsdcOrder(o, fulfill)
    } catch (e) {
      console.error('[usdc-pay] reconciliar', o.id, e instanceof Error ? e.message.split('\n')[0] : e)
    }
  }
}

const chainFail = (e: unknown): never => {
  console.error('[usdc-pay]', e instanceof Error ? e.message.split('\n')[0] : e)
  return fail(502, t('A rede não confirmou a operação. Tente de novo em instantes.'))
}

/**
 * Cobra um produto em USDC da carteira do jogador. Devolve o pedido: 'pago' (entregue) ou
 * 'pendente' (assinado, esperando a rede; o cliente acompanha por /api/orders/:id).
 */
export async function payOrderWithUsdc(user: UserRow, sku: { id: string; priceCents: number }, fulfill: Fulfill): Promise<OrderRow> {
  if (!chainy()) fail(503, t('Carteira cripto indisponível no momento.'))
  if (isMainnet() && user.kyc_status !== 'verified') fail(403, t('Pagamentos em USDC exigem verificação de identidade (KYC).'))
  const w = db().prepare('SELECT address, enc_key FROM wallets WHERE user_id = ?').get(user.id) as { address: Address; enc_key: string } | undefined
  if (!w) fail(409, t('Abra a Carteira e adicione USDC antes de comprar.'))
  if (userBusy.has(user.id)) fail(409, t('Já tem um pagamento seu em andamento. Espere confirmar.'))
  userBusy.add(user.id)
  try {
    await reconcileUsdcOrders(fulfill, user.id)
    if (db().prepare("SELECT 1 FROM orders WHERE user_id = ? AND method = 'usdc' AND status = 'pendente'").get(user.id)) fail(409, t('Já tem um pagamento seu em andamento. Espere confirmar.'))
    const units = usdcUnits(sku.priceCents)
    const from = getAddress(w!.address)
    const to = await depositTreasury().catch((e) => (e instanceof Web3Error ? Promise.reject(e) : chainFail(e)))
    if (getAddress(to) === from || db().prepare('SELECT 1 FROM wallets WHERE lower(address) = lower(?)').get(to)) fail(503, t('Pagamentos em USDC indisponíveis no momento.'))
    const bal = await tokenBalance('usdc', from).catch(chainFail)
    if (bal < units) {
      const falta = Number(units - bal) / 1e6
      fail(402, t('USDC insuficiente na carteira. Faltam {n} USDC — adicione na aba Carteira.', { n: falta.toFixed(2) }), { needUsdc: falta })
    }

    const id = randomUUID()
    db().prepare("INSERT INTO orders (id, user_id, sku, amount_cents, method, provider, provider_ref, status, from_addr, created_at) VALUES (?, ?, ?, ?, 'usdc', 'usdc', NULL, 'pendente', ?, ?)").run(id, user.id, sku.id, sku.priceCents, from, Date.now())
    inFlight.add(id)
    let signed = false
    try {
      const r = await payUsdc(userAccount(w!.enc_key, user.id), to, units, (hash, raw) => {
        // Grava o hash antes de transmitir; se o pedido não está mais pendente, aborta sem transmitir
        const ch = db().prepare("UPDATE orders SET provider_ref = ?, tx_raw = ? WHERE id = ? AND status = 'pendente' AND provider_ref IS NULL").run(hash, raw, id)
        if (!ch.changes) throw new Error('pedido não está mais pendente') // i18n-ok (erro interno)
        signed = true
      })
      if (!r.ok) {
        refuse(id)
        return fail(502, t('A rede recusou a transferência. Nenhum USDC saiu e nada foi cobrado.'))
      }
      deliver(id, fulfill)
      return getOrder(id)
    } catch (e) {
      if (e instanceof Web3Error) throw e
      console.error('[usdc-pay]', e instanceof Error ? e.message.split('\n')[0] : e)
      if (!signed) {
        refuse(id)
        return fail(502, t('A rede não confirmou a operação. Tente de novo em instantes.'))
      }
    } finally {
      inFlight.delete(id)
    }
    // Assinada mas sem confirmação: confere agora; se ainda não deu, o reconciliador termina
    await settleUsdcOrder(getOrder(id), fulfill).catch(() => undefined)
    const o = getOrder(id)
    if (o.status === 'recusado') fail(502, t('A rede recusou a transferência. Nenhum USDC saiu e nada foi cobrado.'))
    return o
  } finally {
    userBusy.delete(user.id)
  }
}
