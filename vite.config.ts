import { defineConfig, type Plugin } from 'vite'
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
  plugins: [react(), api()],
  server: { port: 5173 },
  ssr: { external: ['node:sqlite'] },
})
