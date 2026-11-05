// Faz deploy dos contratos e imprime as linhas de .env.
// Env: WEB3_RPC_URL, WEB3_OPERATOR_KEY, [WEB3_USDC], [WEB3_FEE_BPS=1000], [PUBLIC_URL]
// Uso: node scripts/deploy-contracts.mjs   (rode antes: node scripts/compile-contracts.mjs)
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
const feeBps = Number(process.env.WEB3_FEE_BPS ?? 1000);
if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 2000) die('WEB3_FEE_BPS deve ser inteiro entre 0 e 2000');
const usdcEnv = process.env.WEB3_USDC;
if (usdcEnv && !isAddress(usdcEnv)) die('WEB3_USDC inválido');
const publicUrl = (process.env.PUBLIC_URL || 'http://localhost:5173').replace(/\/+$/, '');
const baseURI = `${publicUrl}/api/nft/`;

const account = privateKeyToAccount(key);
const transport = http(rpc);
const pub = createPublicClient({ transport });
const chainId = await pub.getChainId();
const chain = {
  id: chainId,
  name: `chain-${chainId}`,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
};
const wallet = createWalletClient({ account, chain, transport });

async function deploy(name, args) {
  const { abi, bytecode } = artifacts[name];
  const hash = await wallet.deployContract({ abi, bytecode, args });
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== 'success' || !rc.contractAddress) die(`deploy de ${name} falhou (${hash})`);
  console.error(`  ${name.padEnd(10)} ${rc.contractAddress}  (tx ${hash})`);
  return getAddress(rc.contractAddress);
}

console.error(`Chain ${chainId} via ${rpc} — operador ${account.address}`);
const bal = await pub.getBalance({ address: account.address });
if (bal === 0n) die('operador sem ETH para gas');

const egg = await deploy('GameToken', ['Chicken Fighter Egg', 'EGG', account.address]);
const corn = await deploy('GameToken', ['Chicken Fighter Corn', 'CORN', account.address]);
const items = await deploy('GameItems', [account.address, baseURI]);
const usdc = usdcEnv ? getAddress(usdcEnv) : await deploy('TestUSDC', []);
const market = await deploy('Market', [items, usdc, account.address, feeBps]);

// Linhas prontas para colar no .env (stdout; logs vão para stderr)
console.log(`# deploy chainId=${chainId} feeBps=${feeBps} baseURI=${baseURI}`);
console.log(`WEB3_EGG=${egg}`);
console.log(`WEB3_CORN=${corn}`);
console.log(`WEB3_ITEMS=${items}`);
console.log(`WEB3_MARKET=${market}`);
console.log(`WEB3_USDC=${usdc}`);
