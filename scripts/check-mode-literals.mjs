#!/usr/bin/env node
// Claude Code's native permission-mode literals (`bypassPermissions`,
// `acceptEdits`, `dontAsk`) may appear in exactly two places: the wire type
// that names them and the mapping table that translates them to the
// provider-neutral tool policy (`trust`, `auto_edits`, `ask`…). Everywhere
// else the app reasons in policy terms, so a provider that is not Claude Code
// never meets a Claude-only word. This gate keeps it that way.
//
// Exit code 1 lists every offending line; 0 when the source is clean.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')

/** Files allowed to spell the literals: the wire type and the mapping table. */
const ALLOWED = new Set(['src/types/provider.ts', 'src/constants/toolPolicy.ts'])

// String literals only: a comment that NAMES a mode (`dontAsk`) is documentation.
const LITERAL = /(['"])(bypassPermissions|acceptEdits|dontAsk)\1/g
const COMMENT_LINE = /^\s*(\/\/|\*|\/\*)/

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      yield* walk(path)
    } else if (/\.(ts|tsx)$/.test(name)) {
      yield path
    }
  }
}

const offenders = []
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file)
  if (ALLOWED.has(rel)) continue
  // Tests may name the literals to assert the mapping; production code may not.
  if (/\.test\.tsx?$/.test(rel) || rel.includes('/__tests__/')) continue
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (COMMENT_LINE.test(line)) return
    LITERAL.lastIndex = 0
    if (LITERAL.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`)
  })
}

if (offenders.length > 0) {
  console.error(
    `${offenders.length} Claude-only permission-mode literal(s) outside the mapping table ` +
      `(allowed: ${[...ALLOWED].join(', ')}). Use the tool-policy vocabulary instead:`,
  )
  for (const o of offenders) console.error(`  ${o}`)
  process.exit(1)
}
console.log('check-mode-literals: no Claude-only permission-mode literal outside the mapping table.')
