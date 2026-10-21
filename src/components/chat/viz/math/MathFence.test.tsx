import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MarkdownText } from '../../MarkdownText'
import { MathFence } from './MathFence'
import { parseMathFence, MATH_MAX_CHARS } from './fence'
import { renderTex, katexOptions, expandInferrules, INFERENCE_MACROS } from './katex'
import MathViz from './MathViz'

const FENCES = { math: MathFence }

describe('formulas in the agent text', () => {
  it('a ```math block is a display formula (lazy KaTeX), the rest of the message still renders', async () => {
    const { container } = render(<MarkdownText content={'Euler:\n\n```math\ne^{i\\pi} + 1 = 0\n```\n\nDone.'} fences={FENCES} />)
    expect(await screen.findByTestId('math-display')).toBeTruthy()
    expect(container.querySelector('.katex-display')).toBeTruthy()
    expect(screen.getByTestId('math-display').getAttribute('aria-label')).toBe('e^{i\\pi} + 1 = 0')
    expect(screen.getByText('Done.')).toBeTruthy()
  })

  it('$$…$$ on its own lines is a display formula; $$x$$ inside a sentence is inline', async () => {
    render(<MarkdownText content={'Let\n\n$$\n\\int_0^1 x\\,dx = \\tfrac12\n$$\n\nand $$a_1 * b_2$$ inline.'} fences={FENCES} />)
    expect(await screen.findByTestId('math-display')).toBeTruthy()
    const inline = await screen.findByTestId('math-inline')
    // `_` and `*` stayed TeX (no emphasis): the annotation is the source.
    expect(inline.getAttribute('aria-label')).toBe('a_1 * b_2')
    expect(inline.querySelector('.katex')).toBeTruthy()
  })

  it('a single $ is never math: "$5 and $10" stays prose', () => {
    const { container } = render(<MarkdownText content={'It costs $5 and $10.'} fences={FENCES} />)
    expect(container.textContent).toBe('It costs $5 and $10.')
    expect(screen.queryByTestId('math-inline')).toBeNull()
  })

  it('an inference rule (derivation) renders as a fraction: \\inferrule and \\infer', async () => {
    render(<MarkdownText content={'```math\n\\inferrule{\\Gamma \\vdash A \\\\ \\Gamma \\vdash B}{\\Gamma \\vdash A \\land B}\n```'} fences={FENCES} />)
    const box = await screen.findByTestId('math-display')
    expect(box.querySelector('.mfrac')).toBeTruthy()
    expect(renderTex('\\infer{C}{A \\quad B}', true).ok).toBe(true)
    expect(screen.queryByTestId('math-refused')).toBeNull()
  })

  it('a formula KaTeX refuses: its reason and the TeX, never a crash', async () => {
    render(<MarkdownText content={'```math\n\\AxiomC{A}\\UnaryInfC{B}\n```\n\nAfter.'} fences={FENCES} />)
    const box = await screen.findByTestId('math-refused')
    expect(box.textContent).toMatch(/refused/)
    expect(box.textContent).toMatch(/AxiomC/)
    expect(screen.getByText('After.')).toBeTruthy()
  })

  it('an inline formula KaTeX refuses stays its TeX, with the reason as tooltip', async () => {
    render(<MarkdownText content={'see $$\\nope{x}$$ here'} fences={FENCES} />)
    const code = await screen.findByTestId('math-refused')
    expect(code.tagName).toBe('CODE')
    expect(code.textContent).toBe('\\nope{x}')
    expect(code.getAttribute('title')).toMatch(/Undefined control sequence/)
  })

  it('while streaming, an unclosed formula is its TeX with "writing", not an error', () => {
    render(<MarkdownText content={'Voici :\n\n$$\n\\frac{a}{'} fences={FENCES} isStreaming />)
    const box = screen.getByTestId('math-loading')
    expect(box.textContent).toMatch(/Writing the formula/)
    expect(box.textContent).toContain('\\frac{a}{')
    expect(screen.queryByTestId('math-refused')).toBeNull()
  })

  it('while streaming, a closed formula is already rendered', async () => {
    render(<MarkdownText content={'```math\nx^2\n```\n\nand then'} fences={FENCES} isStreaming />)
    expect(await screen.findByTestId('math-display')).toBeTruthy()
  })

  it('without `fences` (notes, tool output) $$…$$ and ```math stay text', () => {
    const { container } = render(<MarkdownText content={'a $$x$$ b\n\n```math\ny\n```'} />)
    expect(container.textContent).toContain('$$x$$')
    expect(container.querySelector('pre code')?.textContent).toContain('y')
    expect(screen.queryByTestId('math-inline')).toBeNull()
  })

  it('empty and too large blocks are refused before KaTeX', () => {
    render(<MathFence source={'x'.repeat(MATH_MAX_CHARS + 1)} streaming />)
    expect(screen.getByTestId('math-refused').textContent).toMatch(/too large/)
    const empty = render(<MathFence source={'  '} />)
    expect(within(empty.container).getByTestId('math-refused').textContent).toMatch(/empty/)
    const inline = render(<MathFence source={' '} inline />)
    expect(inline.container.querySelector('code')).toBeTruthy()
  })

  it('MathViz without TeX (a viz block from elsewhere) refuses, block and inline', () => {
    render(<MathViz data={{}} fallbackText="fallback" />)
    expect(screen.getByTestId('math-refused').textContent).toContain('fallback')
    const inline = render(<MathViz data={{ display: false }} fallbackText="fb" />)
    expect(within(inline.container).getByTestId('math-refused').textContent).toBe('fb')
  })
})

describe('KaTeX safety', () => {
  it('trust: false — no link, no image, no class or style from the TeX', () => {
    for (const tex of ['\\href{javascript:alert(1)}{x}', '\\url{https://evil.example}', '\\includegraphics{https://evil.example/a.png}', '\\htmlClass{x}{y}', '\\htmlStyle{color:red}{y}']) {
      const r = renderTex(tex, true)
      const html = r.ok ? r.html : ''
      expect(html).not.toMatch(/<a\b|<img\b|javascript:|evil\.example"|class="x"|color:red/)
    }
    expect(katexOptions(true)).toMatchObject({ trust: false, throwOnError: true, maxExpand: 500, maxSize: 20 })
  })

  it('strict: a warning is a refusal, except the two tolerated habits', () => {
    expect(renderTex('a \\\\ b', true).ok).toBe(true) // newline in display mode
    expect(renderTex('x é y', false).ok).toBe(true) // unicode text in math mode
    const strict = katexOptions(true).strict as (code: string) => string
    expect(strict('commentAtEnd')).toBe('error')
  })

  it('a macro bomb is stopped by maxExpand, and \\gdef never leaks into the next formula', () => {
    const bomb = renderTex('\\def\\a{\\a\\a}\\a', true)
    expect(bomb.ok).toBe(false)
    expect(renderTex('\\gdef\\leak{1}\\leak', true).ok).toBe(true)
    expect(renderTex('\\leak', true).ok).toBe(false)
    expect(Object.keys(INFERENCE_MACROS)).toEqual(['\\inferrule', '\\infer'])
  })

  it('a huge size is clamped (maxSize), not a page-wide rule', () => {
    const r = renderTex('\\rule{1000em}{1000em}', true)
    expect(r.ok).toBe(true)
    expect(r.ok && r.html).not.toMatch(/1000em/)
  })

  it('mathpartir \\inferrule: premises side by side, label on the right, nested rules, unreadable ones left to the macro', () => {
    expect(expandInferrules('\\inferrule{A \\\\ B}{C}')).toBe('{\\dfrac{A  \\qquad  B}{C}}')
    expect(expandInferrules('\\inferrule*[right=Cut]{A}{B}')).toBe('{\\dfrac{A}{B}\\;{\\scriptstyle(Cut)}}')
    expect(expandInferrules('\\inferrule[$\\land I$]{A}{B}')).toBe('{\\dfrac{A}{B}\\;{\\scriptstyle(\\land I)}}')
    expect(expandInferrules('\\inferrule{\\inferrule{A}{B} \\\\ {C \\\\ D}}{E}')).toBe('{\\dfrac{{\\dfrac{A}{B}}  \\qquad  {C \\\\ D}}{E}}')
    expect(expandInferrules('\\inferrule{A \\{ x \\}}{B} + \\inferrules')).toBe('{\\dfrac{A \\{ x \\}}{B}} + \\inferrules')
    expect(expandInferrules('\\inferrule{A}')).toBe('\\inferrule{A}')
    expect(expandInferrules('\\inferrule[x{A}{B}')).toBe('\\inferrule[x{A}{B}')
    expect(expandInferrules('x^2')).toBe('x^2')
    expect(renderTex('\\inferrule{A}', true).ok).toBe(false) // the macro needs two groups: KaTeX says so
  })

  it('parses and refuses with a reason', () => {
    expect(parseMathFence(' x ')).toEqual({ ok: true, tex: 'x' })
    expect(parseMathFence('')).toEqual({ ok: false, reason: 'empty' })
    expect(parseMathFence('x'.repeat(MATH_MAX_CHARS + 1))).toEqual({ ok: false, reason: 'too_large' })
  })
})
