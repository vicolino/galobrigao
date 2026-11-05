// Ponte com a blockchain (viem): clientes, carteiras custodiais e chamadas aos contratos.
// Desligado (null) enquanto as variáveis WEB3_* não estiverem todas configuradas.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { createPublicClient, createWalletClient, defineChain, formatEther, http, parseEther, parseEventLogs, type Abi, type Address, type Chain, type Hash, type PublicClient, type WalletClient } from 'viem'
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import artifacts from './chain/artifacts.json'

const TOKEN_ABI = artifacts.GameToken.abi as Abi
const ITEMS_ABI = artifacts.GameItems.abi as Abi
const MARKET_ABI = artifacts.Market.abi as Abi
const USDC_ABI = artifacts.TestUSDC.abi as Abi // ERC-20 padrão (balanceOf/transfer/approve) também serve para o USDC real

export type TokenKey = 'egg' | 'corn' | 'usdc'

export interface Web3Env {
  chain: 'base-sepolia' | 'local'
  rpc: string
  operatorKey: `0x${string}`
  secret: Buffer
  egg: Address
  corn: Address
  items: Address
  market: Address
  usdc: Address
}

const ADDR = /^0x[0-9a-fA-F]{40}$/

/** Lê a configuração do ambiente. null = recursos cripto desligados. */
export function web3Env(): Web3Env | null {
  const e = process.env
  const chain = e.WEB3_CHAIN
  if (chain !== 'base-sepolia' && chain !== 'local') return null
  if (!e.WEB3_RPC_URL || !/^0x[0-9a-fA-F]{64}$/.test(e.WEB3_OPERATOR_KEY ?? '') || !/^[0-9a-fA-F]{64}$/.test(e.WEB3_WALLET_SECRET ?? '')) return null
  const addrs = [e.WEB3_EGG, e.WEB3_CORN, e.WEB3_ITEMS, e.WEB3_MARKET, e.WEB3_USDC]
  if (!addrs.every((a) => ADDR.test(a ?? ''))) return null
  return {
    chain,
    rpc: e.WEB3_RPC_URL,
    operatorKey: e.WEB3_OPERATOR_KEY as `0x${string}`,
    secret: Buffer.from(e.WEB3_WALLET_SECRET!, 'hex'),
    egg: e.WEB3_EGG as Address,
    corn: e.WEB3_CORN as Address,
    items: e.WEB3_ITEMS as Address,
    market: e.WEB3_MARKET as Address,
    usdc: e.WEB3_USDC as Address,
  }
}

export interface Chainy {
  env: Web3Env
  chain: Chain
  pub: PublicClient
  operator: PrivateKeyAccount
  explorer: string | null
}

let cached: { sig: string; c: Chainy } | null = null

/** Clientes da rede configurada (recriados se o ambiente mudar). */
export function chainy(): Chainy | null {
  const env = web3Env()
  if (!env) return null
  const sig = [env.chain, env.rpc, env.operatorKey, env.egg, env.corn, env.items, env.market, env.usdc].join('|')
  if (cached?.sig === sig) return cached.c
  const chain: Chain =
    env.chain === 'base-sepolia'
      ? baseSepolia
      : defineChain({ id: 31337, name: 'Local', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [env.rpc] } } })
  const pub = createPublicClient({ chain, transport: http(env.rpc) }) as PublicClient
  const c: Chainy = { env, chain, pub, operator: privateKeyToAccount(env.operatorKey), explorer: env.chain === 'base-sepolia' ? 'https://sepolia.basescan.org' : null }
  cached = { sig, c }
  return c
}

const need = () => chainy() ?? (() => { throw new Error('web3 desligado') })() // i18n-ok (erro interno)

// ---------- Carteiras custodiais (AES-256-GCM) ----------

/** Cria uma chave nova. Devolve o endereço e a chave cifrada (a chave pura nunca sai daqui). */
export function newWallet(userId: string): { address: Address; enc: string } {
  const env = need().env
  const pk = generatePrivateKey()
  return { address: privateKeyToAccount(pk).address, enc: encryptKey(pk, env.secret, userId) }
}

export function encryptKey(pk: string, secret: Buffer, userId: string) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', secret, iv)
  c.setAAD(Buffer.from(userId))
  const ct = Buffer.concat([c.update(pk, 'utf8'), c.final()])
  return `v1:${iv.toString('hex')}:${c.getAuthTag().toString('hex')}:${ct.toString('hex')}`
}

export function decryptKey(enc: string, secret: Buffer, userId: string): `0x${string}` {
  const [v, iv, tag, ct] = enc.split(':')
  if (v !== 'v1') throw new Error('formato de chave desconhecido') // i18n-ok (erro interno)
  const d = createDecipheriv('aes-256-gcm', secret, Buffer.from(iv, 'hex'))
  d.setAAD(Buffer.from(userId))
  d.setAuthTag(Buffer.from(tag, 'hex'))
  return Buffer.concat([d.update(Buffer.from(ct, 'hex')), d.final()]).toString('utf8') as `0x${string}`
}

export const userAccount = (enc: string, userId: string) => privateKeyToAccount(decryptKey(enc, need().env.secret, userId))

// ---------- Fila de transações (um envio por vez: nonces seguros) ----------

let queue: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => undefined)
  return run
}

const wallet = (c: Chainy, account: PrivateKeyAccount): WalletClient => createWalletClient({ account, chain: c.chain, transport: http(c.env.rpc) })

/** Envia uma chamada de contrato e espera a confirmação. Reverte = erro. */
async function send(c: Chainy, account: PrivateKeyAccount, address: Address, abi: Abi, functionName: string, args: unknown[]) {
  const { request } = await c.pub.simulateContract({ account, address, abi, functionName, args })
  const hash = await wallet(c, account).writeContract(request)
  const receipt = await c.pub.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`tx revertida ${hash}`) // i18n-ok (erro interno)
  return receipt
}

/** Gás: mínimo na carteira antes de o jogador assinar algo, e quanto o operador manda. */
const gas = (c: Chainy) => (c.env.chain === 'local' ? { min: parseEther('0.005'), top: parseEther('0.02') } : { min: parseEther('0.0002'), top: parseEther('0.001') })

async function topUp(c: Chainy, to: Address) {
  const { min, top } = gas(c)
  const bal = await c.pub.getBalance({ address: to })
  if (bal >= min) return null
  const hash = await wallet(c, c.operator).sendTransaction({ account: c.operator, chain: c.chain, to, value: top })
  await c.pub.waitForTransactionReceipt({ hash })
  return hash
}

const tokenAddr = (c: Chainy, k: TokenKey) => (k === 'egg' ? c.env.egg : k === 'corn' ? c.env.corn : c.env.usdc)
const tokenAbi = (k: TokenKey) => (k === 'usdc' ? USDC_ABI : TOKEN_ABI)

// ---------- Leituras ----------

const read = <T>(c: Chainy, address: Address, abi: Abi, functionName: string, args: unknown[] = []) => c.pub.readContract({ address, abi, functionName, args }) as Promise<T>

export async function balances(address: Address) {
  const c = need()
  const [eth, egg, corn, usdc] = await Promise.all([
    c.pub.getBalance({ address }),
    read<bigint>(c, c.env.egg, TOKEN_ABI, 'balanceOf', [address]),
    read<bigint>(c, c.env.corn, TOKEN_ABI, 'balanceOf', [address]),
    read<bigint>(c, c.env.usdc, USDC_ABI, 'balanceOf', [address]),
  ])
  return { eth: formatEther(eth), egg: Number(egg), corn: Number(corn), usdcUnits: usdc }
}

export async function tokenBalance(k: TokenKey, address: Address) {
  const c = need()
  return read<bigint>(c, tokenAddr(c, k), tokenAbi(k), 'balanceOf', [address])
}

export async function ownerOf(tokenId: number) {
  const c = need()
  return read<Address>(c, c.env.items, ITEMS_ABI, 'ownerOf', [BigInt(tokenId)])
}

export async function listingOf(tokenId: number) {
  const c = need()
  const [seller, price] = await read<[Address, bigint]>(c, c.env.market, MARKET_ABI, 'listings', [BigInt(tokenId)])
  return { seller, price }
}

let feeCache = { v: 0, at: 0 }
export async function feeBps() {
  if (Date.now() - feeCache.at < 60_000) return feeCache.v
  const c = need()
  const v = Number(await read<number>(c, c.env.market, MARKET_ABI, 'feeBps'))
  feeCache = { v, at: Date.now() }
  return v
}

export async function treasury() {
  const c = need()
  return read<Address>(c, c.env.market, MARKET_ABI, 'treasury')
}

// ---------- Escritas do operador ----------

/** Ponte de saída: emite EGG/CORN para a carteira do jogador. */
export const mintToken = (k: 'egg' | 'corn', to: Address, amount: number): Promise<Hash> =>
  serial(async () => {
    const c = need()
    return (await send(c, c.operator, tokenAddr(c, k), TOKEN_ABI, 'mint', [to, BigInt(amount)])).transactionHash
  })

/** Ponte de entrada: queima EGG/CORN da carteira do jogador. */
export const burnToken = (k: 'egg' | 'corn', from: Address, amount: number): Promise<Hash> =>
  serial(async () => {
    const c = need()
    return (await send(c, c.operator, tokenAddr(c, k), TOKEN_ABI, 'burnFrom', [from, BigInt(amount)])).transactionHash
  })

/** Cunha o NFT de um item e devolve o tokenId (lido do evento Minted). */
export const mintNft = (to: Address, kind: 'acc' | 'skin', itemId: string): Promise<{ tokenId: number; hash: Hash }> =>
  serial(async () => {
    const c = need()
    const r = await send(c, c.operator, c.env.items, ITEMS_ABI, 'mint', [to, kind, itemId])
    const ev = parseEventLogs({ abi: ITEMS_ABI, logs: r.logs, eventName: 'Minted' })[0] as unknown as { args: { tokenId: bigint } } | undefined
    if (!ev) throw new Error('evento Minted ausente') // i18n-ok (erro interno)
    return { tokenId: Number(ev.args.tokenId), hash: r.transactionHash }
  })

// ---------- Escritas assinadas pela carteira do jogador (o operador paga o gás antes) ----------

/** Aprova o mercado e lista o NFT (fica em custódia no contrato). */
export const listNft = (account: PrivateKeyAccount, tokenId: number, priceUnits: bigint): Promise<Hash> =>
  serial(async () => {
    const c = need()
    await topUp(c, account.address)
    await send(c, account, c.env.items, ITEMS_ABI, 'approve', [c.env.market, BigInt(tokenId)])
    return (await send(c, account, c.env.market, MARKET_ABI, 'list', [BigInt(tokenId), priceUnits])).transactionHash
  })

export const cancelListing = (account: PrivateKeyAccount, tokenId: number): Promise<Hash> =>
  serial(async () => {
    const c = need()
    await topUp(c, account.address)
    return (await send(c, account, c.env.market, MARKET_ABI, 'cancel', [BigInt(tokenId)])).transactionHash
  })

/** Aprova o USDC exato e compra. Devolve preço e taxa do evento Sold. */
export const buyNft = (account: PrivateKeyAccount, tokenId: number, priceUnits: bigint): Promise<{ hash: Hash; price: bigint; fee: bigint }> =>
  serial(async () => {
    const c = need()
    await topUp(c, account.address)
    await send(c, account, c.env.usdc, USDC_ABI, 'approve', [c.env.market, priceUnits])
    const r = await send(c, account, c.env.market, MARKET_ABI, 'buy', [BigInt(tokenId)])
    const ev = parseEventLogs({ abi: MARKET_ABI, logs: r.logs, eventName: 'Sold' })[0] as unknown as { args: { price: bigint; fee: bigint } } | undefined
    return { hash: r.transactionHash, price: ev?.args.price ?? priceUnits, fee: ev?.args.fee ?? 0n }
  })

/** Envia EGG/CORN/USDC da carteira do jogador para um endereço externo. */
export const transferToken = (account: PrivateKeyAccount, k: TokenKey, to: Address, units: bigint): Promise<Hash> =>
  serial(async () => {
    const c = need()
    await topUp(c, account.address)
    return (await send(c, account, tokenAddr(c, k), tokenAbi(k), 'transfer', [to, units])).transactionHash
  })
