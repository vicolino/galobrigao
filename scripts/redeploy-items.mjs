// Republica só GameItems (NFTs) e Market, reaproveitando EGG/CORN/USDC já publicados.
// Usado quando o contrato de NFTs muda (ex.: galo como NFT). Imprime as linhas WEB3_ITEMS/WEB3_MARKET.
// Env: WEB3_RPC_URL, WEB3_OPERATOR_KEY, WEB3_USDC, [WEB3_FEE_BPS=1000], [PUBLIC_URL]
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, http, isAddress, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = JSON.parse(readFileSync(join(root, 'server', 'chain', 'artifacts.json'), 'utf8'));
const die = (msg) => { console.error(`Erro: ${msg}`); process.exit(1); };
const rpc = process.env.WEB3_RPC_URL || die('WEB3_RPC_URL ausente');
const key = process.env.WEB3_OPERATOR_KEY || die('WEB3_OPERATOR_KEY ausente');
if (!/^0x[0-9a-fA-F]{64}$/.test(key)) die('WEB3_OPERATOR_KEY deve ser 0x + 64 hex');
const usdcEnv = process.env.WEB3_USDC;
if (!usdcEnv || !isAddress(usdcEnv)) die('WEB3_USDC ausente ou inválido');
if (!artifacts.GameItems.abi.some((f) => f.name === 'burn')) die('artifacts.json é a versão antiga (sem burn): atualize o código antes');
const feeBps = Number(process.env.WEB3_FEE_BPS ?? 1000);
const publicUrl = (process.env.PUBLIC_URL || 'http://localhost:5173').replace(/\/+$/, '');

const account = privateKeyToAccount(key);
const transport = http(rpc);
const pub = createPublicClient({ transport });
const chainId = await pub.getChainId();
const chain = { id: chainId, name: `chain-${chainId}`, nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } };
const wallet = createWalletClient({ account, chain, transport });

async function deploy(name, args) {
  const { abi, bytecode } = artifacts[name];
  const hash = await wallet.deployContract({ abi, bytecode, args });
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== 'success' || !rc.contractAddress) die(`deploy de ${name} falhou (${hash})`);
  console.error(`  ${name.padEnd(10)} ${rc.contractAddress}  (tx ${hash})`);
  return getAddress(rc.contractAddress);
}

console.error(`Chain ${chainId} — operador ${account.address}`);
const items = await deploy('GameItems', [account.address, `${publicUrl}/api/nft/`]);
const market = await deploy('Market', [items, getAddress(usdcEnv), account.address, feeBps]);
console.log(`WEB3_ITEMS=${items}`);
console.log(`WEB3_MARKET=${market}`);
