#!/usr/bin/env node
/**
 * Vendor the chat wire contract from the backend repository.
 *
 * The backend generates `docs/api/chat-contract/` (`server-events.json`,
 * `client-messages.json`, `control-frames.json`, `SHA256SUMS`). This script
 * COPIES that directory as is into `src/services/__fixtures__/chat-contract/`,
 * and verifies the copy against `SHA256SUMS`. The hand-written
 * `provisional-target-frames.json` (TARGET frames: fields the backend does not emit yet)
 * is kept next to them with its own `PROVISIONAL-TARGET.sha256`. `src/services/__tests__/chatContract.test.ts` then
 * refuses a copy whose checksums do not match and replays every example
 * against the frontend's field tables.
 *
 * Usage:
 *   node scripts/sync-chat-contract.mjs <backend>/docs/api/chat-contract   # copy + verify
 *   node scripts/sync-chat-contract.mjs --check                             # exit 1 on a checksum mismatch
 *   node scripts/sync-chat-contract.mjs --rehash                            # target frames file only
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dir = resolve(root, 'src/services/__fixtures__/chat-contract')
const PROVISIONAL = 'provisional-target-frames.json'
const PROVISIONAL_SUMS = 'PROVISIONAL-TARGET.sha256'
const BACKEND_SUMS = 'SHA256SUMS'

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

function verify(sumsName) {
  const lines = readFileSync(resolve(dir, sumsName), 'utf8').trim().split('\n')
  let ok = true
  for (const line of lines) {
    const [recorded, rawName] = line.trim().split(/\s+/)
    const name = rawName.replace(/^\*/, '')
    const actual = existsSync(resolve(dir, name)) ? sha256(resolve(dir, name)) : '(missing)'
    if (actual !== recorded) {
      console.error(`chat contract checksum mismatch for ${name}: recorded ${recorded}, actual ${actual}`)
      ok = false
    }
  }
  return ok
}

const arg = process.argv[2]
if (!arg) {
  console.error('usage: sync-chat-contract.mjs <backend chat-contract dir> | --check | --rehash')
  process.exit(2)
}

if (arg === '--check') {
  let ok = true
  for (const sums of [BACKEND_SUMS, PROVISIONAL_SUMS]) {
    if (existsSync(resolve(dir, sums))) ok = verify(sums) && ok
  }
  if (!ok) process.exit(1)
  console.log('chat contract OK')
  process.exit(0)
}

if (arg === '--rehash') {
  if (!existsSync(resolve(dir, PROVISIONAL))) {
    console.error('--rehash only applies to the provisional file; backend files carry their own SHA256SUMS')
    process.exit(2)
  }
  // Same line format as `shasum -a 256`.
  writeFileSync(resolve(dir, PROVISIONAL_SUMS), `${sha256(resolve(dir, PROVISIONAL))}  ${PROVISIONAL}\n`)
  console.log(`recorded sha256 of ${PROVISIONAL}`)
  process.exit(0)
}

const source = resolve(process.cwd(), arg)
if (!existsSync(resolve(source, BACKEND_SUMS)) || !existsSync(resolve(source, 'server-events.json'))) {
  console.error(`not a backend chat-contract directory (no ${BACKEND_SUMS} / server-events.json): ${source}`)
  process.exit(2)
}
for (const name of readdirSync(source)) {
  if (name.endsWith('.json') || name === BACKEND_SUMS) {
    copyFileSync(resolve(source, name), resolve(dir, name))
    console.log(`copied ${name}`)
  }
}
if (!verify(BACKEND_SUMS)) process.exit(1)
// `provisional-target-frames.json` stays: it holds the TARGET frames (fields the backend
// does not emit yet — provider, capabilities, cost basis…). Delete it by hand
// once the backend's own examples carry them.
console.log('chat contract vendored and verified')
