/**
 * Where is a position of a draft relative to markdown code? One definition,
 * shared by the trigger (`detectTrigger`) and the token reader
 * (`findRefTokens`): a `#plan:…` typed in code is neither offered nor sent.
 */

/** Odd number of fence lines (``` or ~~~) before this point: it sits inside a fenced block. */
export const insideFence = (before: string): boolean => (before.match(/^[ \t]*(```|~~~)/gm) ?? []).length % 2 === 1

/** Odd number of backticks earlier on the same line: inside inline code. */
export const insideInlineCode = (lineBefore: string): boolean => ((lineBefore.match(/`/g) ?? []).length) % 2 === 1

/** Is the character at `index` of `text` inside a fenced block or an inline code span? */
export function isInsideCode(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1
  return insideFence(text.slice(0, lineStart)) || insideInlineCode(text.slice(lineStart, index))
}
