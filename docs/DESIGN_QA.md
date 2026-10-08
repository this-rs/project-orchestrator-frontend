# Design QA — making the contract verifiable

`src/components/ui/DESIGN.md` is the design contract of the product **and** of the
marketing site (decision D-DESIGN-1: the frontend is the source of truth, the site
re-syncs from it). This page says how the contract is *checked*, not what it says.

Three gates, from the cheapest to the most visual:

| Gate | What it checks | Runs | Verdict |
|---|---|---|---|
| `src/components/ui/designContract.test.ts` | banned patterns in page code (text heuristics) | every `npm test`, CI « Test + coverage », and alone in CI « Design contract » | **blocking** in the test suite (a new violation is red) |
| `npm run qa:shots` | the built app on fixtures in a real Chrome: 8 screens × 390 / 1440 px, horizontal scroll, tap targets, blur budget | on demand, before a design PR | PASS / FAIL in `qa-out/index.md`, exit code 1 on FAIL |
| `website/scripts/check-design.mjs` | which files the site mirrors have changed since the site last ported them | CI « Site ↔ frontend drift » (informative), or by hand | informative: a list to re-port |

## 1. The design-contract test

```sh
npm run check:design-contract          # ≈ 1 s
```

It reads every `.ts`, `.tsx` and `.css` file under `src/pages` and `src/components`
— **except `src/components/ui/`**, which *is* the contract — and fails when one
carries a pattern the contract bans:

| Rule id | Pattern | Contract |
|---|---|---|
| `btn-glow` | `btn-glow-*` | § Matière — `Button` is glass, the glow is retired |
| `transition-all` | `transition-all` | § Mouvement — name what moves |
| `cubic-bezier` | `cubic-bezier(` | § Mouvement — one curve, `var(--ease-standard)` |
| `ease-in-out` | a native `ease-in-out` (class, `animate-[…]`, inline style, `<style>`) | § Mouvement — a second curve |
| `uppercase-tracking-wider` | `uppercase` **and** `tracking-wider` on the same class string | § 2 — no kicker labels |
| `filled-pill` | `rounded-full` + `bg-<colour>-N00` (or `bg-*-900/50`) on the same class string — a *dot* (`w-1.5`, `h-2`…), a bar fill (`h-full`, `h-1`) or a `blur-*` halo is not a pill | § 4 — a status is a dot + text |
| `button-colour-override` | `<Button …className="… bg-indigo-600 / bg-red-600 …">` | § 9 — the variant is the colour |

They are string heuristics on purpose: no browser, no AST, well under a second,
and the class string is where drift happens. A heuristic can be wrong — that is
what the allow-list is for.

### The allow-list — `src/components/ui/designContract.allow.json`

One entry per **file × rule**, every field required:

```json
{
  "path": "src/components/plans/WaveView.tsx",
  "rule": "filled-pill",
  "count": 1,
  "reason": "Step status pills (`bg-green-500/20 text-green-400` …): replace with `StatusText kind=\"step\" icon`. Owner: Plan pass.",
  "date": "2026-10-08"
}
```

- `count` is the number of occurrences **tolerated**. Fewer passes (progress);
  more fails; a file not in the list fails on its first occurrence.
- `reason` says what the pattern is, what should replace it and who owns it — or
  why it is legitimate (a *count badge* is a number, not a status pill).
- `date` is when the entry was written. An entry older than a quarter whose count
  has not moved is a question for the next design review.
- An entry whose file no longer exists **fails**: delete it. An entry whose
  pattern is gone is reported in the test output as *stale*: delete it when you
  touch the list.

**To add an exception** (you introduced a pattern the rule flags and it is
right): add an entry with the four fields, the smallest `count` that passes, and a
reason a stranger can act on. Never widen a rule to make a page pass.

**To re-measure after a big move** (a whole folder migrated): run
`DESIGN_CONTRACT_DUMP=/tmp/dump.json npm run check:design-contract`; the dump has
every current violation with its snippets, ready to prune into the allow-list.

The list was first measured on 2026-10-08, on the design foundation alone
(44 entries, 80 occurrences); every page pass of the design plan is expected to
shrink it.

## 2. The visual bench — `npm run qa:shots`

```sh
npm run qa:shots                       # vite build, then vite preview + Chrome headless
npm run qa:shots -- --no-build         # reuse dist/
npm run qa:shots -- --screens=today,login --widths=390
npm run qa:shots -- --strict           # small tap targets fail instead of warning
CHROME_PATH=/path/to/chrome npm run qa:shots
```

What it needs: Node ≥ 22 (global `WebSocket`), a Chrome / Chromium binary
(`CHROME_PATH`, or the usual macOS / Linux locations). **No Playwright, no backend**:
Chrome is driven over its DevTools protocol, and every `/api/*` and `/auth/*`
request is answered from `scripts/qa-fixtures.mjs` inside the browser
(`Fetch` interception), so `vite preview` runs exactly as shipped. `/ws` is
refused: the chat shows « Reconnecting… », which is the honest state.

The eight screens (`scripts/qa-fixtures.mjs`, `SCREENS`): Today, Plans, Plan
detail, Tasks, Notes, Chat (empty session), Setup step 1, Login — each at 390 px
(phone, touch) and 1440 px. The Today data is the shared backend fixture
`src/services/__fixtures__/attention/four_bands.json`; the rest is plausible JSON
in the shapes of `src/types`.

Per capture, `qa-out/index.md` reports:

- **Horizontal scroll** — `documentElement.scrollWidth <= innerWidth`, with the
  elements that overflow. **FAIL** otherwise (DESIGN.md § 1 « No horizontal page
  scroll, ever »).
- **Small targets** — interactive elements under **36 × 36 px at 390 px**, under
  **32 px from 768 px** (§ 10: `md:size-8` is the contract's own desktop icon
  button): selector, accessible text, size. Stretched links (`after:inset-0`) are
  measured on their positioned ancestor, `hitArea` pseudo-elements count, inline
  links in running text and checkboxes wrapped in their `<label>` are skipped.
  Warnings by default, failures with `--strict`. A deliberately small target
  carries `data-qa-tap-ok` (same convention as the site's bench).
- **Blur budget** — visible elements with a `backdrop-filter`: **≤ 12** (§ Matière
  « at most ~10 visible at once »; 12 leaves room for one open menu). **FAIL**
  above, with the selectors.
- The title and its computed size (`display-2` ≈ 41 px at 390), the number of
  `.btn-primary` (one per zone), the route actually landed on, the API routes
  that had **no fixture** (answered with an empty page: add one to
  `qa-fixtures.mjs` when a screen looks blank), console errors.

What to look at in the PNGs, in this order: does the title read as the screen's
one sentence; is there one primary action; do rows wrap rather than truncate at
390; do the glass controls look like one family (header, buttons, segmented);
does anything float that should be opaque (cards, rows).

`qa-out/` is git-ignored. The grammar (an `index.md` listing the PNGs and a
verdict, a `.json` beside it) is the one of `website/scripts/qa/*.mjs`, so the
two benches read the same way.

## 3. The flow frontend → site

The site copies a set of this repo's files (`website/design-sync.manifest.json`:
`index.css`, `components/ui/*.tsx`, `constants/nomenclature.ts`…) and records the
hash of each at the moment it was ported. **Changes go one way**: a recipe is
proven on the site, brought *up* into `@/components/ui` and `DESIGN.md` here,
then the site re-syncs. Nobody edits the site's copies by hand.

From this repo:

```sh
PO_FRONTEND_DIR=$PWD node ../website/scripts/check-design.mjs --summary
```

lists every ported file that changed since the site's last port, with the
`git diff --stat`. `PO_FRONTEND_DIR` must be **absolute** (the site resolves it
against its own root). Nothing is written. On the site's side, the port is
accepted with `pnpm check:design --accept <file> --reason "…"`, and
`pnpm sync:design` regenerates the tokens.

In CI (`.github/workflows/ci.yml`), the three « Design … » steps are
**informative** (`continue-on-error`): the contract test's verdict, and the drift
list when the site is reachable — repository variable `PO_WEBSITE_REPO`
(`owner/name`, checked out into `.po-website`) or `PO_WEBSITE_DIR` (a local
copy on a self-hosted runner). Without either, the step says it skipped. The
drift list is for the person who will re-port, not a reason to hold the PR.

## 4. When a gate and the contract disagree

The contract wins, then the gate is fixed, then the page. A rule that flags a
legitimate pattern gets an allow-list entry saying *why* it is legitimate (two
exist today: the attention count badge and the user-menu avatar). A rule that
*misses* a banned pattern gets a case in « the rules themselves » in
`designContract.test.ts` before the rule is widened.
