// Translation check for the app: every language of src/i18n/messages/<lang>/*.ts against English.
//
//   node scripts/check-i18n.mjs            # report; exit 1 only on a structure error
//   node scripts/check-i18n.mjs --strict   # exit 1 also on a missing key or an untranslated text
//   node scripts/check-i18n.mjs ar fr      # only these languages
//
// Needs Node 22.18+ (type stripping): the i18n modules are plain TypeScript without runtime imports of Vite.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const i18n = path.join(root, 'src/i18n')
const load = async (file) => (await import(pathToFileURL(file).href)).default
const { LOCALES } = await import(pathToFileURL(path.join(i18n, 'locales.ts')).href)
const { NAMESPACES } = await import(pathToFileURL(path.join(i18n, 'catalog.ts')).href)
const { checkDomain, STRUCTURE_KINDS } = await import(pathToFileURL(path.join(i18n, 'check.ts')).href)
const identicalOk = new Set(JSON.parse(fs.readFileSync(path.join(i18n, 'identical-ok.json'), 'utf8')).keys)

const args = process.argv.slice(2)
const strict = args.includes('--strict')
const only = args.filter((a) => !a.startsWith('--'))
const locales = LOCALES.filter((l) => l !== 'en' && (only.length === 0 || only.includes(l)))

let structure = 0
let gaps = 0
for (const locale of locales) {
  const issues = []
  for (const ns of NAMESPACES) {
    const english = await load(path.join(i18n, 'messages/en', `${ns}.ts`))
    const file = path.join(i18n, 'messages', locale, `${ns}.ts`)
    const translation = fs.existsSync(file) ? await load(file) : {}
    issues.push(...checkDomain(locale, ns, english, translation, identicalOk))
  }
  const bad = issues.filter((i) => STRUCTURE_KINDS.includes(i.kind))
  const open = issues.filter((i) => !STRUCTURE_KINDS.includes(i.kind))
  structure += bad.length
  gaps += open.length
  console.log(`${locale}: ${bad.length} structure error(s), ${open.length} gap(s)`)
  for (const i of [...bad, ...open].slice(0, 8)) console.log(`  ${i.kind.padEnd(12)} ${i.ns}.${i.key}${i.detail ? ` (${i.detail})` : ''}`)
}
if (structure > 0 || (strict && gaps > 0)) process.exit(1)
