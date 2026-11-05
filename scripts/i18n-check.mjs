// Verifica o i18n: (1) toda chave usada em t()/tp()/tn() tem tradução em inglês;
// (2) aponta textos em português que não passaram por t() (heurística).
// Uso: node scripts/i18n-check.mjs [arquivos...]   (sem argumentos: src/ e server/)
import { build } from 'esbuild'
import { readFileSync, readdirSync, statSync, mkdtempSync } from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = join(mkdtempSync(join(tmpdir(), 'i18n-')), 'en.mjs')
await build({ entryPoints: [join(root, 'src/i18n/en.ts')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' })
const { EN } = await import(pathToFileURL(out).href)

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p] })
const args = process.argv.slice(2)
const files = (args.length ? args.map((a) => join(process.cwd(), a)) : [...walk(join(root, 'src')), ...walk(join(root, 'server'))])
  .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('/i18n/'))

const STR = String.raw`'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\x60(?:\\.|[^\x60\\])*\x60`
const unq = (s) => { const q = s[0]; let b = s.slice(1, -1); if (q === '`') return b.replace(/\\`/g, '`'); return b.replace(new RegExp('\\\\' + q, 'g'), q).replace(/\\n/g, '\n').replace(/\\\\/g, '\\') }
const callRe = new RegExp(String.raw`\b(t|tp|tn)\(\s*(${STR})(?:\s*,\s*(${STR}))?`, 'g')
const PT = /[ãõáéíóúâêôçàÃÕÁÉÍÓÚÂÊÔÇ]|\b(você|voce|não|nao|para|com|seu|sua|seus|suas|está|são|uma|um|dos|das|nos|nas|pelo|pela|galo|galos|milho|ovos?|luta|lutas|aposta|apostas|desafio|ganhou|perdeu|entrar|sair|comprar|vender|salvar|fechar|voltar|criar|nome|senha|conta|nível|energia|ataque|defesa|vida|velocidade|carregando|erro|tente|novamente|agora|hoje|ontem|amanhã)\b/i

let missing = 0, suspects = 0, tpl = 0
const used = new Set()
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const rel = relative(root, f)
  for (const m of src.matchAll(callRe)) {
    const keys = [m[2], m[1] === 'tp' ? m[3] : null].filter(Boolean)
    for (const k of keys) {
      if (k.startsWith('`') && k.includes('${')) { tpl++; console.log(`TEMPLATE  ${rel}: chave com \${}: ${k.slice(0, 80)}`); continue }
      const key = unq(k)
      used.add(key)
      if (!(key in EN) && /\p{L}/u.test(key)) { missing++; console.log(`FALTA     ${rel}: ${JSON.stringify(key)}`) }
    }
  }
  // Suspeitos: strings/JSX com português fora de t()
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    const l = line.trim()
    if (!l || l.startsWith('//') || l.startsWith('*') || l.startsWith('/*') || /console\.(log|warn|error|info)/.test(l) || l.includes('i18n-ok')) return
    const stripped = l.replace(callRe, '').replace(/\b(t|tp|tn|tx)\([^)]*\)/g, '').replace(/\/\/.*$/, '')
    const strs = [...stripped.matchAll(new RegExp(STR, 'g'))].map((x) => unq(x[0]))
    const jsx = [...stripped.matchAll(/>([^<>{}]*[A-Za-zÀ-ú][^<>{}]*)</g)].map((x) => x[1])
    const bad = [...strs, ...jsx].filter((s) => /\p{L}{2}/u.test(s) && /[ \p{L}]/u.test(s) && PT.test(s) && !/^[\w./:#-]+$/.test(s))
    if (bad.length) { suspects++; console.log(`SUSPEITO  ${rel}:${i + 1}: ${l.slice(0, 140)}`) }
  })
}
const unused = Object.keys(EN).filter((k) => !used.has(k) && !/\{\w+\}/.test(k)).length
console.log(`\n${Object.keys(EN).length} traduções · ${used.size} chaves usadas · ${missing} faltando · ${tpl} chaves com \${} · ${suspects} linhas suspeitas · ${unused} traduções fixas não referenciadas por t() (podem ser usadas via tx())`)
process.exit(missing || tpl ? 1 : 0)
