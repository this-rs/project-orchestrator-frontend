import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { readFileSync } from 'fs'

const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
)

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    allowedHosts: process.env.VITE_ALLOWED_HOSTS?.split(',') || true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // Auth API routes — proxied to backend.
      // /auth/callback is handled by the SPA (React Router), NOT proxied.
      '/auth': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        bypass(req) {
          // Let the SPA handle the OAuth redirect callback
          if (req.url?.startsWith('/auth/callback')) {
            return req.url
          }
        },
      },
      '/ws': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          // Silence ECONNRESET errors when the backend restarts
          // or WebSocket connections drop during development
          // Handle proxy errors for both HTTP and WS upgrade requests.
          // `res` is a ServerResponse for HTTP, or a net.Socket for WS upgrades.
          // We MUST close/destroy in both cases to prevent dangling connections
          // that block the entire Vite dev server.
          proxy.on('error', (err, _req, res) => {
            const code = (err as NodeJS.ErrnoException).code
            // ECONNRESET: client already disconnected, socket is dead
            if (code === 'ECONNRESET') return
            if (code !== 'ECONNREFUSED') {
              console.error('[vite] ws proxy error:', err.message)
            }
            // HTTP response (ServerResponse) — send 502 and end
            if (res && 'writeHead' in res && !res.headersSent) {
              ;(res as import('http').ServerResponse).writeHead(502)
              ;(res as import('http').ServerResponse).end('Bad Gateway')
            }
            // WS upgrade (net.Socket) — destroy the raw socket
            if (res && 'destroy' in res && !('writeHead' in res)) {
              ;(res as import('net').Socket).destroy()
            }
          })
          proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
            socket.on('error', (err) => {
              const code = (err as NodeJS.ErrnoException).code
              if (code === 'ECONNRESET') return
              if (code !== 'ECONNREFUSED') {
                console.error('[vite] ws socket error:', err.message)
              }
              // Destroy the socket to free resources
              if (!socket.destroyed) socket.destroy()
            })
          })
        },
      },
    },
  },
})
