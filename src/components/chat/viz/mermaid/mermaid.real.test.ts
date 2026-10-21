import { describe, expect, it } from 'vitest'
import mermaid from 'mermaid'
import { renderMermaid } from './render'

// The real Mermaid (no stub): its parser runs in jsdom, its layout does not (no getBBox).
describe('the real Mermaid', () => {
  it('a broken diagram is refused with Mermaid’s own reason', async () => {
    const r = await renderMermaid('flowchart TD\n  A --> --> B', 'dark')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/Parse error|Expecting|error/i)
  })

  it('a diagram cannot lift its own security or theme with %%{init}%%', async () => {
    await renderMermaid('flowchart TD\n  A --> B', 'dark') // initializes with the chat config
    const src = '%%{init: {"securityLevel": "loose", "theme": "forest", "themeCSS": "* { background: url(https://evil.example) }", "htmlLabels": true, "look": "handDrawn"}}%%\nflowchart TD\n  A --> B'
    await mermaid.parse(src)
    const cfg = mermaid.mermaidAPI.getConfig()
    expect(cfg.securityLevel).toBe('strict')
    expect(cfg.theme).toBe('base')
    expect(cfg.themeCSS ?? '').not.toContain('evil')
    expect(cfg.htmlLabels).toBe(false)
    expect(cfg.look).toBe('handDrawn') // the directive was read: only its locked keys were dropped
  })
})
