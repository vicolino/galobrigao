// Teste ponta-a-ponta dos contratos contra uma chain local (hardhat/anvil).
// Uso: node scripts/test-contracts.mjs <arquivo.env>
// O .env precisa de WEB3_RPC_URL, WEB3_OPERATOR_KEY, WEB3_EGG, WEB3_ITEMS, WEB3_MARKET, WEB3_USDC (TestUSDC).
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createPublicClient, createWalletClient, http, parseEther, getAddress } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const A = JSON.parse(readFileSync(join(root, 'server', 'chain', 'artifacts.json'), 'utf8'));

const envFile = process.argv[2];
if (!envFile) { console.error('Uso: node scripts/test-contracts.mjs <arquivo.env>'); process.exit(2); }
const env = {};
for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const rpc = env.WEB3_RPC_URL;
const transport = http(rpc);
const pub = createPublicClient({ transport });
const chainId = await pub.getChainId();
const chain = { id: chainId, name: 'local', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } };
const opAcc = privateKeyToAccount(env.WEB3_OPERATOR_KEY);
const walletOf = (acc) => createWalletClient({ account: acc, chain, transport });
const op = walletOf(opAcc);

const EGG = getAddress(env.WEB3_EGG), ITEMS = getAddress(env.WEB3_ITEMS);
const MARKET = getAddress(env.WEB3_MARKET), USDC = getAddress(env.WEB3_USDC);

let fails = 0, passes = 0;
function check(name, ok, extra = '') {
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
}

async function send(w, address, abi, functionName, args = []) {
  const hash = await w.writeContract({ address, abi, functionName, args });
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== 'success') throw new Error(`${functionName} revertou`);
  return rc;
}
const read = (address, abi, functionName, args = []) => pub.readContract({ address, abi, functionName, args });
// true se a chamada reverte (opcionalmente com o erro custom esperado)
async function reverts(acc, address, abi, functionName, args, errName) {
  try {
    await pub.simulateContract({ account: acc, address, abi, functionName, args });
    return false;
  } catch (e) {
    if (!errName) return true;
    const s = String(e?.shortMessage || '') + ' ' + String(e?.message || '');
    return s.includes(errName);
  }
}
async function newUser() {
  const acc = privateKeyToAccount(generatePrivateKey());
  const hash = await op.sendTransaction({ to: acc.address, value: parseEther('1') });
  await pub.waitForTransactionReceipt({ hash });
  return { acc, w: walletOf(acc) };
}

const T = A.GameToken.abi, I = A.GameItems.abi, M = A.Market.abi, U = A.TestUSDC.abi;

try {
  const alice = await newUser(), bob = await newUser(), eve = await newUser();
  const treasury = await read(MARKET, M, 'treasury');
  const feeBps = BigInt(await read(MARKET, M, 'feeBps'));

  // ---------- GameToken ----------
  check('token decimals = 0', (await read(EGG, T, 'decimals')) === 0);
  await send(op, EGG, T, 'mint', [alice.acc.address, 100n]);
  check('operador mint EGG', (await read(EGG, T, 'balanceOf', [alice.acc.address])) === 100n);
  check('não-operador não pode mint', await reverts(eve.acc, EGG, T, 'mint', [eve.acc.address, 1n], 'AccessControlUnauthorizedAccount'));
  check('não-operador não pode burnFrom', await reverts(eve.acc, EGG, T, 'burnFrom', [alice.acc.address, 1n], 'AccessControlUnauthorizedAccount'));
  check('dono não pode burnFrom a si (só operador)', await reverts(alice.acc, EGG, T, 'burnFrom', [alice.acc.address, 1n], 'AccessControlUnauthorizedAccount'));
  await send(op, EGG, T, 'burnFrom', [alice.acc.address, 40n]);
  check('operador burnFrom sem allowance', (await read(EGG, T, 'balanceOf', [alice.acc.address])) === 60n);
  check('burnFrom acima do saldo reverte', await reverts(opAcc, EGG, T, 'burnFrom', [alice.acc.address, 61n], 'ERC20InsufficientBalance'));

  // ---------- GameItems ----------
  const sim = await pub.simulateContract({ account: opAcc, address: ITEMS, abi: I, functionName: 'mint', args: [alice.acc.address, 'acc', 'coroa'] });
  const tokenId = sim.result;
  await send(op, ITEMS, I, 'mint', [alice.acc.address, 'acc', 'coroa']);
  check('NFT mint → dono correto', getAddress(await read(ITEMS, I, 'ownerOf', [tokenId])) === alice.acc.address);
  const [kind, itemId] = await read(ITEMS, I, 'items', [tokenId]);
  check('NFT guarda kind/itemId', kind === 'acc' && itemId === 'coroa');
  const uri = await read(ITEMS, I, 'tokenURI', [tokenId]);
  check('tokenURI = baseURI + tokenId', uri.endsWith(`/api/nft/${tokenId}`), uri);
  check('não-operador não pode mint NFT', await reverts(eve.acc, ITEMS, I, 'mint', [eve.acc.address, 'skin', 'fogo'], 'AccessControlUnauthorizedAccount'));
  check('kind inválido rejeitado', await reverts(opAcc, ITEMS, I, 'mint', [alice.acc.address, 'galo', 'x'], 'InvalidKind'));
  check('não-operador não pode setBaseURI', await reverts(eve.acc, ITEMS, I, 'setBaseURI', ['http://evil/'], 'AccessControlUnauthorizedAccount'));

  // ---------- Market ----------
  await send(alice.w, ITEMS, I, 'setApprovalForAll', [MARKET, true]);
  check('não-dono não pode listar', await reverts(eve.acc, MARKET, M, 'list', [tokenId, 1_000_000n], 'NotTokenOwner'));
  check('preço zero rejeitado', await reverts(alice.acc, MARKET, M, 'list', [tokenId, 0n], 'ZeroPrice'));
  const price = 12_500_000n; // 12.5 USDC
  await send(alice.w, MARKET, M, 'list', [tokenId, price]);
  const [lSeller, lPrice] = await read(MARKET, M, 'listings', [tokenId]);
  check('list escrow: NFT no mercado', getAddress(await read(ITEMS, I, 'ownerOf', [tokenId])) === MARKET);
  check('listings(tokenId) = (seller, price)', getAddress(lSeller) === alice.acc.address && lPrice === price);
  check('não-vendedor não pode cancelar', await reverts(eve.acc, MARKET, M, 'cancel', [tokenId], 'NotSeller'));
  check('vendedor não compra o próprio item', await reverts(alice.acc, MARKET, M, 'buy', [tokenId], 'SelfBuy'));

  // cancelamento devolve o NFT
  await send(alice.w, MARKET, M, 'cancel', [tokenId]);
  check('cancel devolve NFT', getAddress(await read(ITEMS, I, 'ownerOf', [tokenId])) === alice.acc.address);
  check('cancel limpa listing', (await read(MARKET, M, 'listings', [tokenId]))[0] === '0x0000000000000000000000000000000000000000');
  check('comprar não-listado reverte', await reverts(bob.acc, MARKET, M, 'buy', [tokenId], 'NotListed'));

  // compra: divide taxa/vendedor exatamente
  await send(alice.w, MARKET, M, 'list', [tokenId, price]);
  await send(bob.w, USDC, U, 'mint', [bob.acc.address, 100_000_000n]);
  check('compra sem allowance reverte', await reverts(bob.acc, MARKET, M, 'buy', [tokenId]));
  await send(bob.w, USDC, U, 'approve', [MARKET, price]);
  const bal = async (a) => read(USDC, U, 'balanceOf', [a]);
  const [s0, t0, b0] = [await bal(alice.acc.address), await bal(treasury), await bal(bob.acc.address)];
  const rc = await send(bob.w, MARKET, M, 'buy', [tokenId]);
  const [s1, t1, b1] = [await bal(alice.acc.address), await bal(treasury), await bal(bob.acc.address)];
  const fee = (price * feeBps) / 10_000n;
  check('taxa exata ao tesouro', t1 - t0 === fee, `${t1 - t0} == ${fee}`);
  check('vendedor recebe price - fee', s1 - s0 === price - fee, `${s1 - s0}`);
  check('comprador paga exatamente price', b0 - b1 === price);
  check('NFT vai ao comprador', getAddress(await read(ITEMS, I, 'ownerOf', [tokenId])) === bob.acc.address);
  check('evento Sold emitido', rc.logs.some((l) => getAddress(l.address) === MARKET));
  check('recompra do mesmo listing reverte', await reverts(eve.acc, MARKET, M, 'buy', [tokenId], 'NotListed'));

  // admin
  check('não-owner não pode setFee', await reverts(eve.acc, MARKET, M, 'setFee', [500], 'OwnableUnauthorizedAccount'));
  check('setFee acima de 20% reverte', await reverts(opAcc, MARKET, M, 'setFee', [2001], 'FeeTooHigh'));
  check('owner pode setFee 20%', !(await reverts(opAcc, MARKET, M, 'setFee', [2000])));
  check('setTreasury(0) reverte', await reverts(opAcc, MARKET, M, 'setTreasury', ['0x0000000000000000000000000000000000000000'], 'ZeroAddress'));

  // ---------- Reentrância ----------
  // Token USDC malicioso que tenta reentrar em buy() durante o transferFrom.
  const evil = compileEvil();
  const deploy = async (abi, bytecode, args) => {
    const hash = await op.deployContract({ abi, bytecode, args });
    return getAddress((await pub.waitForTransactionReceipt({ hash })).contractAddress);
  };
  const evilAddr = await deploy(evil.abi, evil.bytecode, []);
  const m2 = await deploy(A.Market.abi, A.Market.bytecode, [ITEMS, evilAddr, treasury, 1000]);
  const sim2 = await pub.simulateContract({ account: opAcc, address: ITEMS, abi: I, functionName: 'mint', args: [alice.acc.address, 'skin', 'fogo'] });
  const t2 = sim2.result;
  await send(op, ITEMS, I, 'mint', [alice.acc.address, 'skin', 'fogo']);
  await send(alice.w, ITEMS, I, 'setApprovalForAll', [m2, true]);
  await send(alice.w, m2, M, 'list', [t2, 1_000_000n]);
  await send(bob.w, evilAddr, evil.abi, 'mint', [bob.acc.address, 10_000_000n]);
  await send(bob.w, evilAddr, evil.abi, 'approve', [m2, 10_000_000n]);
  await send(op, evilAddr, evil.abi, 'arm', [m2, t2]);
  await send(bob.w, m2, M, 'buy', [t2]);
  check('reentrada tentada durante buy', await read(evilAddr, evil.abi, 'reentered'));
  check('reentrada bloqueada (nonReentrant)', await read(evilAddr, evil.abi, 'reentryBlocked'));
  check('listing apagado antes das transferências (CEI)', await read(evilAddr, evil.abi, 'listingClearedFirst'));
  check('compra concluída uma única vez', getAddress(await read(ITEMS, I, 'ownerOf', [t2])) === bob.acc.address
    && (await read(evilAddr, evil.abi, 'balanceOf', [bob.acc.address])) === 9_000_000n);
} catch (e) {
  fails++;
  console.log(`FAIL  exceção inesperada — ${e?.shortMessage || e?.message || e}`);
}

console.log(`\n${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);

// Compila (em memória) um ERC20 malicioso só para o teste de reentrância.
function compileEvil() {
  const require = createRequire(import.meta.url);
  const solc = require('solc');
  const src = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
interface IMarket { function buy(uint256) external; function listings(uint256) external view returns (address, uint256); }
contract EvilUSDC is ERC20 {
  address market; uint256 target; bool armed;
  bool public reentered; bool public reentryBlocked; bool public listingClearedFirst;
  constructor() ERC20("Evil", "EVL") {}
  function decimals() public pure override returns (uint8) { return 6; }
  function mint(address to, uint256 v) external { _mint(to, v); }
  function arm(address m, uint256 t) external { market = m; target = t; armed = true; }
  function transferFrom(address f, address t, uint256 v) public override returns (bool) {
    if (armed) {
      armed = false; reentered = true;
      (address s,) = IMarket(market).listings(target);
      listingClearedFirst = (s == address(0));
      try IMarket(market).buy(target) {} catch { reentryBlocked = true; }
    }
    return super.transferFrom(f, t, v);
  }
}`;
  const input = { language: 'Solidity', sources: { 'Evil.sol': { content: src } },
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } };
  const out = JSON.parse(solc.compile(JSON.stringify(input), { import: (p) => {
    try { return { contents: readFileSync(join(root, 'node_modules', p), 'utf8') }; } catch { return { error: 'not found ' + p }; }
  } }));
  const errs = (out.errors || []).filter((e) => e.severity === 'error');
  if (errs.length) throw new Error(errs.map((e) => e.formattedMessage).join('\n'));
  const c = out.contracts['Evil.sol'].EvilUSDC;
  return { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object };
}
