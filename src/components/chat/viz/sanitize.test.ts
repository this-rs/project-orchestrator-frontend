import { describe, expect, it } from 'vitest'
import { cleanCss, sanitizeMath, sanitizeSvg } from './sanitize'

describe('sanitizing renderer output', () => {
  it('CSS cannot reach the network', () => {
    expect(cleanCss('@import url("https://x.example/a.css"); .a{fill:url(https://x.example/p.png)} .b{fill:url(#g)} .c{width:expression(alert(1))}')).toBe(' .a{fill:none} .b{fill:url(#g)} .c{width:(alert(1))}')
    expect(cleanCss("x{background:url( 'data:image/png;base64,AAA' )}")).toBe('x{background:none}')
  })

  it('formula markup keeps KaTeX spans, styles and paths, nothing active', () => {
    const out = sanitizeMath('<span class="katex" style="height:1em"><svg><path d="M0 0"/></svg><img src=x onerror="alert(1)"><a href="https://x.example">l</a><span style="background:url(https://x.example)">s</span></span>')
    expect(out).toContain('class="katex"')
    expect(out).toContain('style="height:1em"')
    expect(out).toContain('<path d="M0 0">')
    expect(out).not.toMatch(/onerror|<img|<a\b|x\.example/)
  })

  it('an SVG keeps its shapes and local markers', () => {
    const out = sanitizeSvg('<svg><defs><marker id="m"><path d="M0 0"/></marker></defs><path marker-end="url(#m)" d="M1 1" onload="x()"/></svg>')
    expect(out).toContain('marker-end="url(#m)"')
    expect(out).not.toContain('onload')
  })
})
