import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { readFileSync } from 'fs'
import type { HttpProxy } from 'vite'

const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
)

/**
 * Shared proxy error handler for all proxy rules (/api, /auth, /ws).
 *
 * CRITICAL: When the browser aborts a fetch (AbortController) or navigates away,
 * the client-side connection closes. But http-proxy may still hold the upstream
 * connection (Vite → backend) open. Without proper cleanup:
 * - Dangling connections accumulate
 * - Browser's 6-connection-per-origin limit (HTTP/1.1) is exhausted
 * - ALL subsequent requests queue/hang — even to different proxy rules
 *
 * This handler ensures both HTTP responses and WS sockets are properly closed.
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

  // When the client disconnects (abort / navigate away), abort the upstream
  // request to the backend so it doesn't linger and block connection slots.
  proxy.on('proxyReq', (proxyReq, req) => {
    req.on('close', () => {
      // Client closed the connection (e.g. AbortController.abort())
      // Abort the upstream request to free the connection immediately
      if (!proxyReq.destroyed) {
        proxyReq.destroy()
      }
    })
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
