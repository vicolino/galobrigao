// Compila contracts/*.sol com solc (npm) → server/chain/artifacts.json ({Nome:{abi, bytecode}}).
// Uso: node scripts/compile-contracts.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const solc = require('solc');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'contracts');
const outFile = join(root, 'server', 'chain', 'artifacts.json');
const WANTED = ['GameToken', 'GameItems', 'Market', 'TestUSDC'];

if (!solc.version().startsWith('0.8.28')) {
  console.error(`solc 0.8.28 esperado, encontrado ${solc.version()}`);
  process.exit(1);
}

const sources = {};
for (const f of readdirSync(srcDir).filter((f) => f.endsWith('.sol'))) {
  sources[`contracts/${f}`] = { content: readFileSync(join(srcDir, f), 'utf8') };
}

// Resolve imports "@openzeppelin/..." a partir de node_modules
function findImports(path) {
  const candidates = [join(root, 'node_modules', path), join(root, path)];
  for (const p of candidates) {
    if (existsSync(p)) return { contents: readFileSync(p, 'utf8') };
  }
  return { error: `Import não encontrado: ${path}` };
}

const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'cancun',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const errors = (out.errors || []).filter((e) => e.severity === 'error');
for (const w of (out.errors || []).filter((e) => e.severity !== 'error')) console.warn(w.formattedMessage);
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  console.error(`Falha na compilação (${errors.length} erro(s)).`);
  process.exit(1);
}

const artifacts = {};
for (const name of WANTED) {
  const c = out.contracts?.[`contracts/${name}.sol`]?.[name];
  if (!c || !c.evm.bytecode.object) {
    console.error(`Contrato ${name} ausente na saída do solc.`);
    process.exit(1);
  }
  artifacts[name] = { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object };
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(artifacts, null, 2) + '\n');
console.log(`OK: ${WANTED.join(', ')} → ${outFile.replace(root + '/', '')} (solc ${solc.version()})`);
