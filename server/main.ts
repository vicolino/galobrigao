// Servidor de produção: entrega o jogo (dist/) e a API (/api).
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { handle } from './app'
import { CSP, baseHeaders } from './security'

const PORT = Number(process.env.PORT ?? 8787)
const HOST = process.env.HOST ?? '127.0.0.1' // só o Caddy (na mesma máquina) acessa
const DIST = join(process.cwd(), 'dist')
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function sendFile(res: import('node:http').ServerResponse, file: string, status = 200) {
  const isHtml = extname(file) === '.html'
  res.writeHead(status, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    // Arquivos com hash no nome podem ficar em cache por 1 ano; o HTML nunca
    'Cache-Control': file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...baseHeaders(),
    ...(isHtml ? { 'Content-Security-Policy': CSP } : {}),
  })
  createReadStream(file).pipe(res)
}

const server = createServer((req, res) => {
  try {
    if ((req.url ?? '').startsWith('/api/')) {
      handle(req, res).catch((e) => {
        console.error('[api]', e)
        if (!res.headersSent) res.writeHead(500).end()
      })
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, baseHeaders()).end()
      return
    }
    let urlPath: string
    try {
      urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
    } catch {
      res.writeHead(400, baseHeaders()).end()
      return
    }
    const file = normalize(join(DIST, urlPath))
    // Só arquivos DENTRO de dist/ (o separador evita "dist-server", "dist2" etc.)
    const inside = file.startsWith(DIST + sep)
    if (inside && existsSync(file) && statSync(file).isFile()) return sendFile(res, file)
    if (urlPath.startsWith('/assets/')) {
      res.writeHead(404, baseHeaders()).end()
      return
    }
    sendFile(res, join(DIST, 'index.html'))
  } catch (e) {
    console.error('[http]', e)
    if (!res.headersSent) res.writeHead(500).end()
  }
})

server.headersTimeout = 20_000
server.requestTimeout = 30_000
server.listen(PORT, HOST, () => console.log(`Galo Brigão rodando em http://${HOST}:${PORT}`))

process.on('uncaughtException', (e) => console.error('[fatal]', e))
process.on('unhandledRejection', (e) => console.error('[promise]', e))
