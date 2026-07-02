#!/usr/bin/env node
/**
 * Patch-coverage gate.
 *
 * Fails when the lines ADDED/CHANGED by the current branch (vs the PR base)
 * are insufficiently covered by the test suite. Unlike a global threshold,
 * this only judges the diff — existing untested code is never penalized.
 *
 * Coverage source: coverage/coverage-final.json (istanbul format, produced by
 * `vitest run --coverage` with the v8 provider — see vitest.config.ts).
 *
 * Scope: only changed lines in files the test suite actually EXERCISES are
 * gated. A file merely imported by a test (e.g. pulled in transitively via a
 * barrel) but never executed — every statement count 0 — is treated as
 * untested and skipped. So a mechanical refactor to an untested file doesn't
 * hard-fail the PR; the gate protects new code in already-tested modules.
 *
 * Env:
 *   BASE_REF                  base git ref/sha to diff against (default: origin/main)
 *   PATCH_COVERAGE_THRESHOLD  minimum % of changed executable lines (default: 80)
 */
import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const THRESHOLD = Number(process.env.PATCH_COVERAGE_THRESHOLD ?? 80)
const BASE = process.env.BASE_REF || 'origin/main'
const COV_PATH = 'coverage/coverage-final.json'

const isTest = (f) => /\.test\.(ts|tsx)$/.test(f) || f.includes('/__tests__/')
const isSource = (f) => /^src\/.+\.(ts|tsx)$/.test(f) && !isTest(f)

if (!existsSync(COV_PATH)) {
  console.error(`❌ No coverage report at ${COV_PATH}. Run \`vitest run --coverage\` first.`)
  process.exit(1)
}

// Normalize coverage keys to repo-relative POSIX paths.
const raw = JSON.parse(readFileSync(COV_PATH, 'utf8'))
const cov = {}
for (const [abs, data] of Object.entries(raw)) {
  const rel = path.relative(process.cwd(), abs).split(path.sep).join('/')
  cov[rel] = data
}

// Parse `git diff` for added line numbers per file.
let diff
try {
  diff = execSync(`git diff --unified=0 --no-color ${BASE}...HEAD -- src`, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
} catch (e) {
  console.error(`❌ git diff against "${BASE}" failed:`, e.message)
  process.exit(1)
}

const changed = {}
let curFile = null
for (const line of diff.split('\n')) {
  const fm = line.match(/^\+\+\+ b\/(.+)$/)
  if (fm) {
    curFile = fm[1]
    changed[curFile] ??= new Set()
    continue
  }
  const hm = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
  if (hm && curFile) {
    const start = Number(hm[1])
    const count = hm[2] === undefined ? 1 : Number(hm[2])
    for (let i = 0; i < count; i++) changed[curFile].add(start + i)
  }
}

let total = 0
let covered = 0
const misses = []
let skippedUntested = 0

for (const [file, lines] of Object.entries(changed)) {
  if (!isSource(file)) continue
  const data = cov[file]
  if (!data) {
    skippedUntested++
    continue // file not in coverage report at all → not gated (see header)
  }
  const stmts = data.statementMap || {}
  const counts = data.s || {}
  // Skip files that are imported but never executed by any test (all counts 0):
  // they are not meaningfully tested, so mechanical changes shouldn't fail.
  const isExercised = Object.values(counts).some((c) => c > 0)
  if (!isExercised) {
    skippedUntested++
    continue
  }
  // Build line → covered map from statementMap + execution counts.
  const lineCovered = new Map()
  for (const [id, loc] of Object.entries(stmts)) {
    const executed = (counts[id] || 0) > 0
    for (let l = loc.start.line; l <= loc.end.line; l++) {
      lineCovered.set(l, (lineCovered.get(l) || false) || executed)
    }
  }
  for (const l of lines) {
    if (!lineCovered.has(l)) continue // blank/comment/type-only line → not executable
    total++
    if (lineCovered.get(l)) covered++
    else misses.push(`${file}:${l}`)
  }
}

const pct = total === 0 ? 100 : (covered / total) * 100
console.log(
  `Patch coverage: ${covered}/${total} changed executable lines covered = ${pct.toFixed(1)}% ` +
    `(threshold ${THRESHOLD}%)`,
)
if (skippedUntested) {
  console.log(`(${skippedUntested} changed file(s) not exercised by any test — skipped)`)
}
if (misses.length) {
  console.log('Uncovered changed lines:')
  for (const m of misses.slice(0, 50)) console.log(`  ${m}`)
  if (misses.length > 50) console.log(`  … and ${misses.length - 50} more`)
}

if (pct + 1e-9 < THRESHOLD) {
  console.error(`\n❌ Patch coverage ${pct.toFixed(1)}% is below the ${THRESHOLD}% threshold.`)
  process.exit(1)
}
console.log('✅ Patch coverage gate passed.')
