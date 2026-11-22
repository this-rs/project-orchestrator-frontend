/**
 * A browser + backend stand-in for the auth tests: a cookie jar and a server
 * that implements the REAL rotation of `POST /auth/refresh` — single use, no
 * grace window (`consume_refresh_token`: SET rt.revoked = true).
 *
 * Browser semantics reproduced on purpose:
 * - a request carries the cookie that is in the jar WHEN IT IS SENT;
 * - the server consumes the cookie when the request ARRIVES (after `uplinkMs`);
 * - Set-Cookie is applied when the response HEAD arrives (after `latencyMs`);
 * - a page that is unloaded never sees the response, and the browser drops it
 *   (the in-flight fetch is cancelled): the cookie is consumed, never replaced.
 */
export interface Presentation {
  at: number
  cookie: string | null
  status: number
  tab: string
}

export interface SimOptions {
  /** One-way delay before the server sees a request. */
  uplinkMs?: number
  /** Delay between the server's answer and the page receiving it. */
  latencyMs?: number
  /** Access token lifetime in seconds. */
  accessTtlS?: number
  /** Replay window in ms for a cookie consumed less than this ago (0 = none, today's server). */
  graceMs?: number
}

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

export class AuthServerSim {
  jar: string | null = 'c0'
  /** cookie -> consumed-at (ms), absent = live */
  consumed = new Map<string, number>()
  successor = new Map<string, string>()
  live = new Set<string>(['c0'])
  presentations: Presentation[] = []
  log: string[] = []
  epoch = 0
  tab = 'tab1'
  private n = 0
  private jwtSeq = 0
  validJwts = new Map<string, number>() // jwt -> exp (s)
  opts: Required<SimOptions>
  handlers: Array<(url: string, init: RequestInit) => Response | null> = []

  constructor(opts: SimOptions = {}) {
    this.opts = { uplinkMs: 5, latencyMs: 400, accessTtlS: 3600, graceMs: 0, ...opts }
  }

  mintJwt(): string {
    const exp = Math.floor(Date.now() / 1000) + this.opts.accessTtlS
    const jwt = `h.${b64({ exp, seq: ++this.jwtSeq })}.s`
    this.validJwts.set(jwt, exp)
    return jwt
  }

  refreshCount() {
    return this.presentations.filter((p) => p.status !== -1).length
  }
  refusals() {
    return this.presentations.filter((p) => p.status === 401)
  }

  /** Called by the browser unloading the page: in-flight responses are dropped. */
  unload() {
    this.epoch++
  }
  /** A fresh page of the same browser (cookie jar survives, JS state does not). */
  newPage(tab = 'tab1') {
    this.tab = tab
  }

  private json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }

  private serverRefresh(cookie: string | null): { res: Response; setCookie?: string } {
    const now = Date.now()
    let status = 401
    let next: string | undefined
    if (cookie && this.live.has(cookie)) {
      this.live.delete(cookie)
      this.consumed.set(cookie, now)
      next = `c${++this.n}`
      this.live.add(next)
      this.successor.set(cookie, next)
      status = 200
    } else if (cookie && this.opts.graceMs > 0 && this.consumed.has(cookie) && now - this.consumed.get(cookie)! < this.opts.graceMs) {
      // grace: accept once more, revoke the previous successor, issue a new leaf
      const prev = this.successor.get(cookie)!
      this.live.delete(prev)
      next = `c${++this.n}`
      this.live.add(next)
      this.successor.set(cookie, next)
      status = 200
    }
    this.presentations.push({ at: now, cookie, status, tab: this.tab })
    if (status === 200) return { res: this.json(200, { token: this.mintJwt() }), setCookie: next }
    return { res: this.json(401, { error: 'invalid refresh token' }) }
  }

  /** The `fetch` to install with vi.stubGlobal. */
  fetch = (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]
    const sentCookie = init.credentials === 'include' ? this.jar : null // the jar, AT SEND TIME
    const tab = this.tab
    const sentEpoch = this.epoch
    return new Promise<Response>((resolve, reject) => {
      setTimeout(() => {
        // Server side (arrives even if the page is gone: the request left the machine).
        let res: Response
        let setCookie: string | undefined
        if (path.endsWith('/auth/refresh')) {
          const saved = this.tab
          this.tab = tab
          ;({ res, setCookie } = this.serverRefresh(sentCookie))
          this.tab = saved
        } else if (path.endsWith('/auth/logout')) {
          if (sentCookie) this.live.delete(sentCookie)
          res = this.json(200, {})
        } else {
          let custom: Response | null = null
          for (const h of this.handlers) {
            custom = h(path, init)
            if (custom) break
          }
          if (custom) res = custom
          else if (path.endsWith('/auth/providers')) res = this.json(200, { auth_required: true, providers: [], allow_registration: false })
          else if (path.endsWith('/setup-status')) res = this.json(200, { configured: true })
          else if (path.endsWith('/auth/ws-ticket')) res = this.json(200, { ticket: 't' })
          else if (path.endsWith('/auth/me')) {
            const bearer = (init.headers as Record<string, string> | undefined)?.Authorization?.slice(7)
            res = this.checkBearer(bearer) ? this.json(200, { id: 'u1', email: 'a@b.c', name: 'A', role: 'admin' }) : this.json(401, { error: 'bad token' })
          } else if (path.endsWith('/chat/models')) {
            res = this.json(200, [])
          } else {
            const bearer = (init.headers as Record<string, string> | undefined)?.Authorization?.slice(7)
            res = this.checkBearer(bearer) ? this.json(200, path.match(/s$|list$/) ? [] : {}) : this.json(401, { error: 'bad token' })
          }
        }
        this.log.push(`${Date.now()} ${tab} ${init.method ?? 'GET'} ${path} -> ${res.status}${sentCookie ? ` [cookie ${sentCookie}]` : ''}`)
        // Client side: response head arrives after latency, unless the page is gone.
        setTimeout(() => {
          if (sentEpoch !== this.epoch) return // page unloaded: dropped
          if (setCookie) this.jar = setCookie
          resolve(res)
        }, this.opts.latencyMs)
      }, this.opts.uplinkMs)
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })
  }

  checkBearer(token: string | undefined): boolean {
    if (!token) return false
    const exp = this.validJwts.get(token)
    return exp !== undefined && exp > Math.floor(Date.now() / 1000)
  }
}

/** Minimal exclusive, FIFO Web Locks (what the browsers provide). */
export function makeLocks() {
  const tails = new Map<string, Promise<unknown>>()
  return {
    request<T>(name: string, cb: () => Promise<T>): Promise<T> {
      const prev = tails.get(name) ?? Promise.resolve()
      const run = prev.then(cb, cb)
      tails.set(name, run.catch(() => {}))
      return run
    },
  }
}
