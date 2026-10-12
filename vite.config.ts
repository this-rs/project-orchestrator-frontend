import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { readdirSync, readFileSync } from 'fs'
import license from 'rollup-plugin-license'
import type { Plugin } from 'vite'
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
        // NOTE: Do NOT destroy proxyRes.socket here. The socket belongs to
        // http-proxy's keep-alive connection pool. Destroying it corrupts the
        // pool and causes subsequent requests on the same proxy rule (e.g.
        // /auth) to hang indefinitely. proxyRes.destroy() is sufficient to
        // stop reading the upstream response and free the stream.
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

/**
 * `dist/third-party-licenses.txt`: the license and NOTICE texts of every npm package
 * bundled into the build (MIT/BSD/Apache-2.0/OFL require them wherever the code is
 * redistributed: the backend embeds this dist in its full variant, the desktop app and
 * the Docker image, and its release merges this file into THIRD-PARTY-LICENSES.txt).
 * The file is never loaded by the app, so the JS bundle does not grow.
 */
// Packages that reach the build only as CSS or font files: rollup does not see them as
// modules, so they are added by hand. Add here any package imported for its CSS/fonts only.
const CSS_ONLY_PACKAGES = ['@fontsource-variable/inter', 'tailwindcss', '@tailwindcss/typography']

interface LicensedPackage {
  name: string | null
  version: string | null
  license: string | null
  repository: string | { url: string } | null
  author: { name: string } | null
  licenseText: string | null
  noticeText: string | null
}

function cssOnlyPackage(name: string): LicensedPackage {
  const dir = path.resolve(__dirname, 'node_modules', name)
  const pj = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf-8'))
  const read = (prefix: string) => {
    const f = readdirSync(dir).find((n) => n.toUpperCase().startsWith(prefix))
    return f ? readFileSync(path.join(dir, f), 'utf-8') : null
  }
  return {
    name,
    version: pj.version,
    license: pj.license ?? null,
    repository: pj.repository ?? null,
    author: typeof pj.author === 'string' ? { name: pj.author } : (pj.author ?? null),
    licenseText: read('LICENSE') ?? read('LICENCE'),
    noticeText: read('NOTICE'),
  }
}

// The MIT text, for a package that declares MIT but ships no license file.
const mitText = (holder: string) => `MIT License

Copyright (c) ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

function licenseTextOf(d: LicensedPackage): string {
  if (d.licenseText) return d.licenseText.trim()
  if (d.license === 'MIT' && d.author?.name) {
    return `(the package ships no license file; MIT per its package.json, author ${d.author.name})\n\n${mitText(d.author.name)}`
  }
  return `(the package ships no license file; its package.json declares: ${d.license ?? 'nothing'})`
}

function renderThirdPartyLicenses(packages: LicensedPackage[]): string {
  const deps = [...packages].sort((a, b) =>
    `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
  )
  const head = [
    'Third-party software in the Project Orchestrator web interface',
    '',
    'The npm packages bundled into this build (scripts, styles, fonts), with the license and',
    'notice texts their licenses require. The interface itself is licensed under LICENSE',
    '(MIT AND BUSL-1.1).',
    '',
    `${deps.length} packages.`,
  ]
  const body = deps.map((d) => {
    const repo = typeof d.repository === 'string' ? d.repository : (d.repository?.url ?? null)
    return [
      '-'.repeat(80),
      `${d.name} ${d.version}`,
      `License: ${d.license ?? 'UNKNOWN'}`,
      ...(repo ? [`Repository: ${repo}`] : []),
      '',
      licenseTextOf(d),
      ...(d.noticeText ? ['', 'NOTICE:', '', d.noticeText.trim()] : []),
      '',
    ].join('\n')
  })
  return [...head, '', ...body].join('\n')
}

function thirdPartyLicenses(): Plugin {
  return {
    ...license({
      thirdParty: {
        multipleVersions: true,
        output: {
          file: path.resolve(__dirname, 'dist/third-party-licenses.txt'),
          template(dependencies) {
            const seen = new Set(dependencies.map((d) => d.name))
            const extra = CSS_ONLY_PACKAGES.filter((n) => !seen.has(n)).map(cssOnlyPackage)
            return renderThirdPartyLicenses([...dependencies, ...extra])
          },
        },
      },
    }),
    apply: 'build',
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react(), tailwindcss(), thirdPartyLicenses()],
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
