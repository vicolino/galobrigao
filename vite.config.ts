import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

// Identificador de cada publicação: o navegador compara com o do servidor e se atualiza sozinho
const BUILD_ID = Date.now().toString(36)

function buildId(): Plugin {
  return {
    name: 'build-id',
    writeBundle(opts) {
      writeFileSync(join(opts.dir ?? 'dist', 'build.json'), JSON.stringify({ id: BUILD_ID }))
    },
  }
}
import react from '@vitejs/plugin-react'

// Em desenvolvimento, a API (/api) roda dentro do próprio Vite.
function api(): Plugin {
  return {
    name: 'rinha-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        try {
          const mod = await server.ssrLoadModule('/server/app.ts')
          await mod.handle(req, res)
        } catch (e) {
          next(e)
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), api(), buildId()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: { port: 5173 },
  ssr: { external: ['node:sqlite'] },
})
