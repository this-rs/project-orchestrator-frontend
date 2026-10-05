#!/usr/bin/env node
/**
 * Vendor the chat wire contract from the backend repository.
 *
 * The backend generates sample frames (one or more per `ChatEvent` variant,
 * control frames, client messages). This script COPIES that file into
 * `src/services/__fixtures__/chat-contract/` and records its sha256 in
 * `CHECKSUMS.sha256`. `src/services/__tests__/chatContract.test.ts` then:
 *   - refuses a copy whose checksum no longer matches (hand-edited, half-synced);
 *   - replays every frame against the frontend's field tables.
 *
 * Usage:
 *   node scripts/sync-chat-contract.mjs <path-to-backend-contract.json>
 *   node scripts/sync-chat-contract.mjs --rehash     # re-record the checksum of the local copy
 *   node scripts/sync-chat-contract.mjs --check      # exit 1 if the checksum does not match
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dir = resolve(root, 'src/services/__fixtures__/chat-contract')
const target = resolve(dir, 'chat-contract.json')
const sums = resolve(dir, 'CHECKSUMS.sha256')
const NAME = 'chat-contract.json'

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

const arg = process.argv[2]
if (!arg) {
  console.error('usage: sync-chat-contract.mjs <backend-contract.json> | --rehash | --check')
  process.exit(2)
}

if (arg === '--check') {
  const recorded = existsSync(sums) ? readFileSync(sums, 'utf8').trim().split(/\s+/)[0] : ''
  const actual = sha256(target)
  if (recorded !== actual) {
    console.error(`chat contract checksum mismatch: recorded ${recorded || '(none)'}, actual ${actual}`)
    process.exit(1)
  }
  console.log(`chat contract OK (${actual.slice(0, 12)}…)`)
  process.exit(0)
}

if (arg !== '--rehash') {
  const source = resolve(process.cwd(), arg)
  if (!existsSync(source)) {
    console.error(`not found: ${source}`)
    process.exit(2)
  }
  copyFileSync(source, target)
  console.log(`copied ${source} → ${target}`)
}

// Same line format as `shasum -a 256`, so `shasum -a 256 -c CHECKSUMS.sha256` works too.
writeFileSync(sums, `${sha256(target)}  ${NAME}\n`)
console.log(`recorded sha256 ${sha256(target)}`)
