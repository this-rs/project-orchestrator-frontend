import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { readFileSync } from 'fs'
const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
)

/**
 * Shared proxy setup for all HTTP proxy rules (/api, /auth).
 *
 * Two responsibilities:
 *
 * 1. **Error handling** — ECONNREFUSED, ECONNRESET, etc. are handled gracefully:
 *    - HTTP responses get a 502 and are properly ended
 *    - WS upgrade sockets are destroyed
 *    - Expected errors (ECONNRESET, ECONNREFUSED) are silenced
 *
 * 2. **Upstream cleanup on client abort** — When the browser aborts a fetch
 *    (e.g. AbortController, navigation), we destroy the upstream response from
 *    the backend so the connection is released back to the pool immediately.
 *
 *    We listen on `proxyRes` (response phase), then on `res.close`. If the
 *    client disconnects before `res.writableFinished`, it was an abort — we
 *    destroy the upstream `proxyRes` to free the socket.
 *
 *    NOTE: Do NOT use `req.on('close')` for this — for GET requests, `close`
 *    fires immediately after headers are read (before the response arrives),
 *    which would kill every single request.
 */
function configureHttpProxy(proxy: HttpProxy.Server, label: string) {
  // --- Error handler ---
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

  // --- Upstream cleanup on client abort ---
  // When the browser aborts a fetch (AbortController / navigation), the
  // downstream `res` socket closes. We detect this via `res.on('close')` and
  // check `res.writableFinished`: if false, the response was NOT fully sent,
  // meaning the client left early. In that case, destroy BOTH the upstream
  // response stream (proxyRes) and the upstream request (proxyReq) to fully
  // release the connection slot.
  //
  // We wire this up in `proxyRes` because that's where we have access to
  // both the upstream response AND the downstream `res` in the same scope.
  proxy.on('proxyRes', (proxyRes, _req, res) => {
    res.on('close', () => {
      if (!res.writableFinished) {
        proxyRes.destroy()
        // Also destroy the underlying socket to ensure the connection is
        // fully released back to the pool (proxyRes.destroy alone may only
        // stop reading without closing the TCP socket).
        if (proxyRes.socket && !proxyRes.socket.destroyed) {
          proxyRes.socket.destroy()
        }
      }
    })
  })

  // Also handle the case where the client disconnects BEFORE the upstream
  // even responds (proxyRes hasn't fired yet). We use proxyReq to listen
  // on the downstream res.close early.
  proxy.on('proxyReq', (proxyReq, _req, res) => {
    const serverRes = res as import('http').ServerResponse
    serverRes.on('close', () => {
      if (!serverRes.writableFinished && !proxyReq.destroyed) {
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
        configure: (proxy) => configureHttpProxy(proxy, 'api'),
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
        configure: (proxy) => configureHttpProxy(proxy, 'auth'),
      },
      '/ws': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          configureHttpProxy(proxy, 'ws')
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
