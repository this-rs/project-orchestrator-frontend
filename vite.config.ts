import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { readFileSync } from 'fs'
const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
)

/**
 * Shared proxy error handler for all proxy rules (/api, /auth, /ws).
 *
 * Ensures proxy errors (ECONNREFUSED, ECONNRESET, etc.) are handled gracefully:
 * - HTTP responses get a 502 and are properly ended
 * - WS upgrade sockets are destroyed
 * - Silences expected errors (ECONNRESET, ECONNREFUSED) to reduce log noise
 *
 * NOTE: Do NOT destroy upstream requests on `req.close` — for GET requests,
 * `close` fires immediately after headers are read (before the response arrives),
 * which would kill every single request. AbortController in React hooks handles
 * the browser-side abort; http-proxy handles upstream cleanup via its own
 * socket error detection.
 */
function handleProxyError(proxy: HttpProxy.Server, label: string) {
  proxy.on('error', (err, _req, res) => {
    const code = (err as NodeJS.ErrnoException).code
    // ECONNRESET: client already disconnected, socket is dead — nothing to do
    if (code === 'ECONNRESET') return
    if (code !== 'ECONNREFUSED') {
      console.error(`[vite] ${label} proxy error:`, err.message)
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
}

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
        configure: (proxy) => handleProxyError(proxy, 'api'),
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
        configure: (proxy) => handleProxyError(proxy, 'auth'),
      },
      '/ws': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          handleProxyError(proxy, 'ws')
          // Additional WS-specific: clean up socket errors on upgrade
          proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
            socket.on('error', (err) => {
              const code = (err as NodeJS.ErrnoException).code
              if (code === 'ECONNRESET') return
              if (code !== 'ECONNREFUSED') {
                console.error('[vite] ws socket error:', err.message)
              }
              if (!socket.destroyed) socket.destroy()
            })
          })
        },
      },
    },
  },
})
