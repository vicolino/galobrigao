// Servidor de produção: entrega o jogo (dist/) e a API (/api).
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { handle } from './app'

const PORT = Number(process.env.PORT ?? 8787)
const DIST = join(process.cwd(), 'dist')
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

createServer((req, res) => {
  if ((req.url ?? '').startsWith('/api/')) return void handle(req, res)
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
  let file = normalize(join(DIST, urlPath))
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html')
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
}).listen(PORT, () => console.log(`Galo Brigão rodando em http://localhost:${PORT}`))
