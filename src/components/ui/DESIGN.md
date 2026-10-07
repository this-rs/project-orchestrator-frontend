# UI design contract

The rules every page follows. Goal: **functional, consistent, compact, classy** —
and comfortable **on a phone first** (most usage is mobile). Reference
implementation: the conversation list (`components/chat/SessionList.tsx`) and
the worked example `pages/DecisionsPage.tsx`.

Everything below is importable from `@/components/ui`. Page code must not
re-implement a primitive that exists here; if something is missing, compose
existing primitives inside the page's own folder — never copy/paste a variant.

**This file is the source of truth for the product AND for the marketing site**
(`website/DESIGN.md` §0: "le frontend fait foi"; decision D-DESIGN-1). When the
site proves a recipe worth keeping, it is brought *up* into this contract and
into `@/components/ui`, then the site re-syncs (`pnpm check:design`). The rules
marked *(from the site)* below came that way on 2026-10-07 (audit matrix: MCP note
"Matrice d'écarts site→app"); each cites the `website/DESIGN.md` section it comes
from. Primitives named here that do not exist yet in `@/components/ui` are marked
*(planned)*: the contract leads, the code follows in the next tasks of the plan.

---

## 0. Names come from one place

Every visible name of a concept — sidebar entry, list-page title, breadcrumb
segment, card kicker — is read from `@/constants/nomenclature` (`NOMENCLATURE`,
`NAV_GROUPS`, `segmentLabel`, `entityNoun`). Never type "Plans" or "Objectives"
by hand in a page: `<PageShell title={NOMENCLATURE.plans.plural}>`.

- Labels only. API paths, entity types and MCP identifiers do not change
  (an *Objective* is still a `milestone` on the wire, a *Proposal* an `rfc`).
- Detail pages need no breadcrumb code: `PageHeader` publishes its `title` and
  the breadcrumb shows it in place of the id.
- New concept or new page = one entry in the registry, then it appears in the
  menu and the breadcrumb. Every route must be reachable from the sidebar.
- **A concept explains itself in three sentences** *(from the site —
  `website/DESIGN.md` §6 « Expliquer une interface », `AUDIENCE.md` §9 « Les quatre
  lignes de l'Explainer »)*: each registry entry carries an `explain` block
  (`ConceptExplain`) with `what` (what you are looking at), `why` (what you get from it)
  and `different` (how it differs from what you do today: scattered notes, a chat
  with no memory). One sentence each, the product's words (`Assistant`, never
  `agent`; `Objective`, never `milestone`), no technical term without its
  definition in the same sentence. It is rendered by `ConceptIntro` — see §5
  « Explaining a concept » — through `<PageShell intro="plans">`. A page never
  types its own intro; `nomenclature.test.ts` fails on a missing line or a banned word.
- **The words of Today are concepts too.** « À traiter / À reprendre / En cours /
  À suivre », « Assistants », the resume labels live in `components/today/bands.ts`
  (`TODAY_TEXT`, `STUCK_LABEL`), `today/live/text.ts`, `today/work/text.ts` — the
  site cannot import them and retypes them (`AUDIENCE.md` §7). They move next to
  the registry (one importable module), in ONE language per registry: today the
  registry mixes English concepts with a French `today.description` and `NAV_TEXT`;
  which language is a product decision (`AUDIENCE.md` §8.1), mixing is not.
- **`profile` is a filter, not a label.** Every entry declares `profile: 'all' |
  'software'`; the sidebar (`MainLayout`) shows a `software` concept only when the
  current project has code, and the project form offers the profile. Today the
  field is declared and read nowhere (`website` has to state it as a limit,
  `features.limits` « A project with no code starts from an assistant »): closing
  that gap is the first promise the app owes the site.
- **Today is the root of the application, above the workspaces.** It is not in
  `NAV_GROUPS` (the sidebar of ONE workspace) and it is not repeated in any menu:
  its icon sits at the left of the header on every page (one click, `/today`),
  and it is the current page (`aria-current`) on `/today`. The global chrome
  (`/`, `/today`) lists the workspaces under the product name ("Project
  Orchestrator", next to the logo) and holds nothing that belongs to a workspace.
  The breadcrumb starts at the workspace (`<workspace> / Plans / …`; the lane view
  `/workspace/:slug/today` reads `<workspace>`); on `/today` it is empty, the page
  names itself. `/` opens Today.
- **Today's own layout.** Today is a dashboard, not a list page: it has no `PageShell` title bar.
  Its header says the day in ONE sentence in large type (`headline`, `components/today/startHere.ts`),
  holds the workspace filter and four counters that are the anchors of the sections. Below, the left
  column is what depends on the user (requests, work to resume, their tasks in ONE tabbed block), the
  right column what advances alone (plans, assistants, things to read). The columns follow the
  container (`@container/today`), never a window breakpoint. Height is a budget: one line per task or
  assistant, a list is cut at six rows with "Afficher les N", details sit behind a fold, and a plan's
  state is one segmented bar plus words (`PlanStateBar`), never a legend to decode.
- **Attention badge**: the count of band 1 (waiting on you) is shown on every
  Today entry (the header icon) by `<AttentionBadge>`,
  read from `attentionCountAtom`. ONE source feeds it (`useAttentionCountSource`,
  mounted once in `MainLayout`); a page never fetches it. 0 or an error: no badge;
  above 99: "99+"; the aria-label always carries the full count.

---

## 1. Layout

| Page type | Wrapper | Width |
|---|---|---|
| List / index page | `<PageShell title count actions filters width="wide">` | `wide` (max-w-5xl) |
| Detail page | `<PageContainer width="wide" className="space-y-6">` + `<PageHeader>` | `wide` |
| Settings / forms | `<PageContainer width="narrow">` | `narrow` (max-w-3xl) |
| Kanban, graphs, dashboards | `PageShell` / `PageContainer` with `width="full"` | full |

- **Gutters come from `MainLayout`** (`px-4` = 16px mobile, `px-6` desktop). Never add horizontal page padding.
- Vertical rhythm: `PageContainer` gives `pt-4 md:pt-6 pb-10`. Between page blocks: `space-y-6`; inside a section: `space-y-2`/`gap-2`.
- **No horizontal page scroll, ever.** Wide content (tables, code, graphs) scrolls in its own `overflow-x-auto` box.
- Spacing scale (Tailwind units): `1` (4px) inside a line · `2` (8px) between related items · `3` (12px) between rows of controls · `4` (16px) card padding · `6` (24px) between sections. Avoid other values.

```tsx
<PageShell
  title="Decisions" count={items.length} width="wide"
  actions={<Button size="sm" onClick={create}>New decision</Button>}
  filters={<FilterBar … />}
>
  {content}
</PageShell>
```

## 2. Typography

| Role | Class | Where |
|---|---|---|
| Page title (h1) | `text-xl md:text-2xl font-semibold` (built into PageShell/PageHeader) | once per page |
| Section title (h2) | `text-sm font-semibold text-gray-200` (built into `Section`) | detail sections |
| Group header | `text-[11px] font-medium text-gray-500` (built into `ListGroup`) | "Today", "In progress" |
| Row title | `text-sm text-gray-200` (built into `EntityRow`) | primary text of a row |
| Body | `text-sm text-gray-300` | descriptions, markdown |
| Secondary line | `text-xs text-gray-500` | row description / preview |
| Meta | `text-[11px] leading-4 text-gray-500` (`metaText`, `MetaLine`) | metadata, counts, dates |
| **Display title** *(from the site)* | `pageTitle` = `display-2` (`--fluid-5xl`, 40→64px) · `sectionTitle` = `display-3` (`--fluid-4xl`, 32→48px) — weight 600, tight tracking, `text-wrap: balance`, `text-gray-50/100` (`index.css`, `classes.ts`) | the ONE sentence that names a dashboard: Today's `headline` (`display-2`), `<EmptyState size="page">` (« No X yet », `display-3`), the setup wizard steps and the Login title (`display-3`, migrated in phase 3) |
| **Lead text** *(from the site)* | `leadText` = `text-base md:text-lg leading-relaxed text-gray-400 max-w-[var(--measure-md)]` (`--measure-sm/md/lg` = 48/65/75ch) | the one line under a display title (Today's `why`, the page-level empty state's description) |

Numbers that change or align (counts, dates, costs) use `tabular-nums`. No
`uppercase tracking-wider` labels, no `text-lg`+ inside rows, no bold in meta.

**Display scale — where it stops** *(from the site — `website/DESIGN.md` §2 « Titres
plus grands, en échelle fluide »)*. The site has three display sizes; the app takes
two. `display-1` (`--fluid-display`, 44→84px) is a full-screen hero size and stays
marketing: no screen of the app has a hero, and Today's headline shares its row
with the counters and the workspace filter. `display-2` replaced the hand-written
`text-2xl … @2xl/today:text-[2rem]` of `TodayView` (its `why` is `leadText`);
`display-3` replaces the `text-2xl font-bold` of `LoginPage` and the `text-xl` of
the setup steps when those screens migrate (phase 3). A display title appears
**once per screen, above the fold, outside any list, row, card or detail
section**: `PageShell`/`PageHeader` titles (`text-xl md:text-2xl`) are unchanged,
and a display class inside an `EntityRow`, a `Section` or a dialog is a bug. It
scales with the viewport (`clamp`), never with a container query — measured on
Today at 390px: 41px, the longest headline wraps on three lines, nothing overflows
the `@container/today` column, so no container cap was added. Two display titles
on one screen is also a bug: Today's own empty state stays `EmptyState` (`md`)
because the header already carries the `display-2` headline.

## 3. Colour roles

- Surfaces: page `surface-base` (from layout) · list/section container `surface` (`rounded-xl border border-white/[0.06] bg-white/[0.02]`) · menus `bg-surface-popover`. Existing `Card` is fine for rich content blocks.
- Text: `gray-100` titles · `gray-200` row titles · `gray-300` body · `gray-400` secondary · `gray-500` meta · `gray-600/700` separators & placeholders.
- **One accent: indigo.** Selection, focus rings, primary buttons, active tab, links-as-actions (`textLink`). Don't introduce other accent colours.
  - **The single exception** *(from the site — `website/DESIGN.md` §0 « boutons en verre (écart volontaire) », which §3 « Interdits : dégradés violets » otherwise forbids)*: the fill of the **primary glass button** and of the **active item of the segmented control** is the gradient `linear-gradient(135deg, #4f46e5, #7c3aed)` (indigo → violet, recipe `.btn-primary` / `.seg-item[aria-selected]` in `buttons.css`). It is a *material* highlight on the one control that says "this is the action", not a second accent: the violet never appears as text, icon, border, rail, badge or tone, and `special` (violet) stays reserved to statuses (§4). Anything else using `from-violet-*`, `to-cyan-*` or `bg-clip-text` is still a bug. Naming the exception here is what makes the two contracts consistent again.
- Semantic colours only through status tones (see §4) — never as decoration.
- Entity-type icons may keep their hue (plan = blue, RFC = purple, task = amber) at icon size only, never as filled backgrounds.

## 4. Status, priority, badges

**Rule: a status is a dot + text in the tone colour. No filled pills.**

```tsx
<StatusText kind="task" status={task.status} />            // read-only
<StatusMenu kind="task" status={task.status} onChange={s => update(s)} />  // editable
<StatusDot kind="plan" status={plan.status} label="In progress" />  // dot only (needs label if no text nearby)
<PriorityText priority={task.priority} />                   // "P8", nothing when 0/undefined
```

- Kinds: `task plan step milestone release note importance decision skill persona protocol run rfc gate`. Unknown values fall back to a humanized label and a guessed tone (never throws), so `<StatusText status={anyString} />` is fine for trigger/pipeline/etc. statuses.
- Tones: `neutral` (todo/draft) · `info` (proposed/open) · `progress` (indigo — in progress/running) · `success` · `warning` (blocked/stale) · `danger` (failed/rejected) · `muted` (closed/archived/cancelled) · `special` (violet — emerging/planning, sparingly). Need raw classes? `TONE_CLASSES[getStatusMeta(kind, v).tone]`.
- `StatusMenu` replaces `Interactive*StatusBadge` and `StatusSelect` in migrated pages (those stay exported for legacy code).
- Tags/labels: plain muted text in the meta line (`#auth`), or a *subtle* outline chip `rounded border border-white/[0.08] px-1.5 text-[11px] text-gray-400` — only on detail pages, never several per row.
- Live state (running/streaming): `StatusDot pulse` or `PulseIndicator`.

## 5. Lists — `EntityRow`

Every entity list is `EntityList` / `ListGroup` of `EntityRow`s. No per-page cards for list items; grids of cards only for genuinely visual content (graph previews, dashboards).

```
[leading] Title (≤ 2 lines) ············ trailing  [Action] [⋯]
          description (optional, ≤ 2 lines, muted)
          ◔ Status  P8    ▣ Project  @ owner  ⏱ due …   (status line, then facts — one wrapping line)
          context line (optional: TaskProgress, links…)
```

Row anatomy (list cards): `status` is the row's state (12px medium, tone colour), `meta` is the facts line
(`MetaLine variant="facts"`, 12px, no `·` separators, every fact carries a `Fact` icon), `tone` draws a 3px left rail on rows that
are moving or need attention (`progress info warning danger special`; done/idle/archived stay quiet). Colour is never the only
cue: the status has a tone-shaped glyph (`icon`) and a word, the rail is redundant with it.

```tsx
<ListGroup title="Today" count={items.length}>
  {items.map(t => (
    <EntityRow
      key={t.id}
      title={t.title}
      href={workspacePath(ws, `/tasks/${t.id}`)}
      leading={<StatusDot kind="task" status={t.status} label={getStatusMeta('task', t.status).label} />}
      trailing={<RelativeTime date={t.updated_at} />}
      meta={[<PriorityText key="p" priority={t.priority} />, t.assigned_to, pluralize(t.steps, 'step')]}
      actions={[
        { label: 'Edit', icon: Pencil, onClick: () => edit(t) },
        { label: 'Delete', icon: Trash2, variant: 'danger', onClick: () => del(t),
          confirm: { title: 'Delete task?', description: 'This cannot be undone.' } },
      ]}
      muted={t.status === 'completed'}
    />
  ))}
</ListGroup>
```

- Title = the one thing that identifies the item. Everything else goes in **one** status line + **one** facts line; falsy items are skipped automatically. Content without a title (notes, decisions) uses `noteTitle` / `decisionTitle` (first meaningful line) everywhere — list rows, detail header, timelines.
- **Status line (`status`)**: `StatusMenu icon` (editable) / `StatusText icon` / `ToneText icon` (read-only), then `PriorityText`. Pass `tone={getStatusMeta(kind, s).tone}` for the rail. No leading dot when the status is here (avoid double marks).
- **Facts (`meta`)**: wrap each in `<Fact icon={…} title="Project">`; `truncateAt="max-w-[12rem]"` for long names, `mono` for shas/paths. Plain strings still work (counters: `pluralize(n, 'task')`). Gauges: `<Gauge label="Energy" value={0.8} level="High" tone />` (bar + word + title, never colour alone).
- **Meta order:** status → priority / importance → attribution (project, plan, assignee, author, source) → counters (tasks, steps, cost, duration) → tags. The date goes in `trailing`, never in meta (a *due* date is a fact, not a timestamp — it sits with the counters).
- Trailing = date (`RelativeTime`: `3h` / `12 Sep`, full date in tooltip) or one short value (progress `3/8`, cost).
- Editable status → `StatusMenu icon` in the `status` line. Read-only → `StatusText icon` in the `status` line (a leading `StatusDot` with `label` remains fine for compact/legacy rows, but then leave `status` empty).
- Links / buttons inside `meta`/`context` must carry `rowInteractive` (`relative z-10`) so they sit above the row's stretched link. `StatusMenu` and the `actions` slot already do.
- `selected` = current item (indigo inset bar). `muted` = done/archived items.
- Grouping: by recency (`groupByRecency(items, i => i.updated_at)`) or by status (`groupBy(items, i => i.status, ORDER)`), rendered with `ListGroup` (header + count; `collapsible` + `defaultOpen={false}` for "Completed"-like groups).
- Pagination: keep `LoadMoreSentinel` / `Pagination` below the list.
- **Huge lists / no server pagination**: never render the whole array. `useIncrementalList(items, pageSize, resetKey)` (`@/hooks`) returns the first page plus `hasMore` / `remaining` / `showMore`; pair it with `LoadMoreSentinel` (`onLoadMore`, `remaining`, a no-op `sentinelRef`) and a muted "Showing N of M" line. Search/sort/filter go on the **full** array before slicing. Applies equally to groups inside a detail page (one hook per `ListGroup`).
- **Browse-everything lists (code entities, logs)**: when readability, not count, is the problem, never cap — render every row in an internal scroller with `WindowedList` (`items: {key, height, header?}[]`, fixed-height rows, sticky group headers, focusable `role=region`, `resetKey` to go back to top on search / group-by). Only the rows in view are mounted; search still runs on the full array. Make each row *speak*: a humanized title (`humanize`), the exact code name as secondary mono text, one sentence of explanation (`firstSentence(docstring)` or a derived sentence), and a `Gauge` with a word instead of a raw score (`@/utils/featureGraphReadable`).
- **Explaining a concept**: a closed-by-default `<details>` intro under the header (see `components/featureGraphs/FeatureGraphHelp.tsx`) — plain language, one paragraph per idea, never a wall of text on the page itself. Legends for colours/edge styles sit under the canvas, colour is never the only cue.
  - **The intro has a fixed shape** *(from the site — `website/DESIGN.md` §6 « Expliquer une interface », `src/components/explain/Explainer.tsx`; writing rules `AUDIENCE.md` §9)*: three labelled lines, one sentence each — **What it is** (`what`), **What it is for** (`why`), **How it is different** (`different`, compared with what the person does today, never with a competitor). An optional fourth, **The problem it solves** (`problem`), only when the page does not already say it. Never fewer than three: without `different` the screen reads as any task manager.
  - The text is **read from the registry** (`NOMENCLATURE[key].explain`, see §0) and rendered by **`ConceptIntro`** (`@/components/ui`): `<PageShell title={NOMENCLATURE.plans.plural} intro="plans">` (also `PageHeader intro`, optional) renders it under the title — a `<details>` closed by default, a plain-text `<summary>` « What is this? » (no icon, no badge, no illustration), a `<dl>` of the three lines labelled **What it is / What it is for / How it differs** (`dt` 13px `text-gray-400`, `dd` `text-sm text-gray-200`, measure `--measure-md`). `intro` also takes an inline `ConceptExplain` for a screen that is not a concept (then pass `storageKey` to remember it). The open/closed choice is remembered per concept in `localStorage` (`po.intro.<key>`) under try/catch: without storage it still renders and toggles. `FeatureGraphHelp` is the shape it generalises and migrates to it (phase 3). Where the site keeps the block **always visible** (its reader is a visitor), the app keeps it **folded** (its reader comes back every day, §5 density): that is the one deliberate difference.
  - The intro answers "what is this screen"; it never carries a product promise or a roadmap status (the site's `VisionLine` « Notre idée : … » with Disponible / En cours / Prévu stays marketing). In the app a feature that is not there yet is simply absent, or an `EmptyState` says what to do now.
- **Canvases (React Flow)**: bound the work, not just the DOM. Draw every node, lay them out once per selection in a macrotask behind a skeleton (`layoutSubgraph`: dagre for small graphs, a linear layered layout for big ones), cap only the *edges* and say so, pass `onlyRenderVisibleElements`, draw edge labels only on small graphs, and offer a retry on layout errors.
- Bulk selection: put a `RowCheckbox` (36px target, keyboard, `label="Select …"`) in `leading` (it sits above the stretched link).
- Rows that expand inline content pass `expanded` (→ `aria-expanded` on the title control) and keep `ariaLabel` free of verbs; `menuLabel` names the `⋯` menu when the title is not plain text.

## 6. Filters — `FilterBar`

```tsx
<FilterBar
  search={q} onSearchChange={setQ} searchPlaceholder="Search tasks…"
  filters={<><Select … /><Select … /><Switch label="Show archived" … /></>}
  activeCount={n} activeLabels={['Backend', 'In progress']} onClear={reset}
  trailing={<ViewToggle … />}
/>
```

- Search always visible; filters collapse behind the sliders button (badge = active count); the panel opens by default only when something is active. Active-filter summary + **Clear** stay visible when collapsed.
- `activeCount` counts filters differing from their default. Search is not a filter.
- Filters never go in `PageShell.actions`. The only header actions are create-type actions.

## 7. Detail pages

Anatomy: **PageHeader → key facts line → sections**.

```tsx
<PageContainer width="wide" className="space-y-6">
  <PageHeader
    title={plan.title}
    parentLinks={[{ icon: Box, label: 'Project', name: p.name, href }]}
    status={<StatusMenu kind="plan" status={plan.status} onChange={setStatus} />}
    meta={[<PriorityText key="p" priority={plan.priority} />, <RelativeTime key="u" date={plan.updated_at} prefix="updated " />, pluralize(n, 'task')]}
    actions={<Button size="sm" onClick={run}>Run</Button>}
    overflowActions={[{ label: 'Edit', onClick: edit }, { label: 'Delete', variant: 'danger', onClick: del, confirm: {…} }]}
    description={plan.description}
  />
  <Section title="Tasks" count={tasks.length} action={<Button size="sm" variant="ghost">Add</Button>}>
    <EntityList>{tasks.map(t => <EntityRow … />)}</EntityList>
  </Section>
  <Section title="Details"><Facts items={[{ label: 'Owner', value: owner }, …]} /></Section>
</PageContainer>
```

- Parent entities = muted breadcrumb links above the title (built in).
- Key facts = status first, then 2–5 short facts. Long properties → a `Facts` list in a section.
- Sections: `Section` (title · count · one action). Use `SectionNav`/`TabLayout` only when there are ≥ 4 long sections; `TabLayout`'s strip scrolls horizontally on its own. Secondary view switches inside a page/section (Protocols · Runs · Scheduled) use the segmented `ViewTabs`; list/board uses the icon-only `ViewToggle` in `FilterBar.trailing`.
- Progress / metrics: `ProgressLine` (static 0–100 progressbar, rows and progress blocks; `segments` splits the track into done / active / blocked / failed), `TaskProgress` (the ready-made task block for `EntityRow.context`: segmented bar + `3/8 done (38%)` + non-zero blocked/failed with icons), `Meter` (0–1 ratio with tone, `block` / `inline` / bare `bar`), `Gauge` (named `Meter` for a facts line), `StatTiles` (grid of numbers). Never `ProgressBar` (animated) on list data.
- `metadata={[{label, value}]}` still works (rendered as `label value` in the facts line) but prefer `meta`.

## 8. Empty / loading / error

| State | Page level | Inside a section |
|---|---|---|
| Loading | `<EntityListSkeleton rows={6} />` (lists) · `SkeletonCard` (cards) | `<EntityListSkeleton rows={3} />` |
| Empty | `<EmptyState title description action />` (+ `variant` illustration) · `<EmptyState size="page" title="No X yet" description action />` when the screen itself is empty (`display-3` + `leadText` + ONE primary action, §2) | `<EmptyState size="sm" icon title />` |
| Error | `<ErrorState description onRetry />` | same, or a toast for background refreshes |

- Distinguish "nothing yet" (explain how to create + primary action) from "no match" (suggest clearing filters, offer `Clear`).
- Wording: **"No X yet"** + the create action (same label as the header, e.g. "New plan") · **"No matching X"** + a `Clear` button that resets filters *and* search. Inside a section: "No X yet" + the section's "Add" / "Link" action when one exists.
- Loading must not shift layout: skeleton shapes match the final rows. No centred spinners for lists.
- No entrance animations on list items (no stagger / `layout` motion) — they cause layout shift.

## 9. Actions

- **Primary** (create, run): one `<Button size="sm">` in `PageShell.actions` / `PageHeader.actions`. At most one primary + one secondary visible.
- **Row action**: a row shows at most ONE button, in `EntityRow.primaryAction` (`<Button size="sm">`, one short word: "Start", "Add", "Resume"). It is `variant="secondary"` unless it is THE next thing to do in its list; a list never stacks the same filled button on every row. Everything else the row can do goes in its `actions` menu.
- **No local button classes.** A button is `<Button>`; a page never defines its own `btn…` class strings (heights, radii and greys drift apart within a week).
- **`flat`** (`<Button flat>` → `.btn-flat`) removes the backdrop blur of the glass recipe (`styles/buttons.css`): use it in dense rows and lists (`EntityRow.primaryAction`, a button repeated on every item) — never more than about ten blurred buttons on screen.
- **Secondary** (edit, duplicate, export, delete): the `⋯` `OverflowMenu` (row `actions` array or `PageHeader.overflowActions`). Always visible, never hover-revealed.
- **Destructive**: `variant: 'danger'` + `confirm: { title, description }` — the menu shows the ConfirmDialog. Bulk deletes use `useConfirmDialog` + `BulkActionBar` as today.
- After a mutation: optimistic local update + `toast.success` / `toast.error`.
- Menu items may have a lucide `icon`.
- **Vocabulary — one word per gesture, no object when the row/page *is* the object:** `Edit` (Pencil) · `Delete` (Trash2, permanent) · `Remove` (X — take an item out of a list it belongs to: member of a skill, project of a workspace) · `Link` / `Unlink` (Link2 / Unlink — create or break an explicit relation: plan↔project, decision↔entity, dependency) · `Run` (Play) · `Open` (ExternalLink). Add the object only when it differs from the row/page ("Link project", "Open runner", "Open task"). Confirm titles are sentence case with a question mark (`Delete task?`, `Unlink dependency?`, `Delete 3 tasks?`) and `confirmLabel` repeats the verb. Dialog titles are sentence case (`Edit task`, `Add step`).

## 10. Mobile rules (non-negotiable)

- **No hover-only UI.** Anything revealed by `group-hover`/`opacity-0` must be reachable otherwise (⋯ menu). Hover may only *enhance* (colour).
- **Tap targets ≥ 36px.** Buttons `size="sm"` are fine; icon buttons `w-9 h-9 md:w-8 md:h-8`; small inline text controls use `hitArea` (enlarged invisible target, no layout change).
- **Nothing overflows horizontally**: `min-w-0` on flex children containing text, `break-words` on titles, `flex-wrap` on control rows.
- **Wrap, don't truncate essential info.** Titles clamp at 2 lines; meta lines wrap. Only truncate secondary values (paths, long names) and keep the full value in `title`.
- Inputs are `text-base md:text-sm` (16px on phones, otherwise iOS zooms).
- Menus/popovers: use `OverflowMenu`, `StatusMenu`, `Select`, `Dropdown` — all position correctly on iOS Safari (JS fallback for missing CSS Anchor Positioning). Don't build new `popover` + `anchor-name` UIs without `useFloatingFallback`.
- Sticky bars at the bottom must include `env(safe-area-inset-bottom)` padding.

## 11. Accessibility

- Every icon-only button has an `aria-label` naming its target: `Actions for Auth flow` (EntityRow derives it from `title`; pass `ariaLabel` when the title isn't a string).
- Decorative icons `aria-hidden="true"`; status dots without nearby text need `label`.
- Focus always visible: `focusRing` / `focusRingInset` on custom controls (`Button` has its own).
- Lists are `<ul>/<li>` (`EntityList`); groups are labelled `<section>`s (`ListGroup`, `Section`).
- Keyboard: rows activate with Enter (native link/button); inner controls never trigger the row; menus support ↑ ↓ Home End Esc.
- Dates: `RelativeTime` renders `<time dateTime>` with the absolute date as `title`.

## 12. Helpers cheat-sheet

- Dates: `formatRelativeShort`, `formatAbsolute`, `formatDay`, `formatElapsed`, `formatDurationMs`, `RelativeTime`.
- Numbers/text: `pluralize`, `formatCost`, `formatCompactNumber`.
- Grouping: `groupByRecency`, `groupBy`, `RECENCY_GROUP_ORDER`.
- Status: `getStatusMeta`, `getStatusOptions(kind)` (→ Select / StatusMenu options), `getPriorityMeta`, `TONE_CLASSES`, `StatusIcon` / `TONE_ICONS` (one glyph per tone; `icon` prop on `StatusText` / `ToneText` / `StatusMenu`); `ToneText` for values outside the registry (consent, circuit breaker, runner/wave/deployment states).
- Controls: `TabLayout` (page tabs), `ViewTabs` (segmented views), `ViewToggle` (list/board), `RowCheckbox` (bulk selection), `ProgressLine`, `TaskProgress`, `Meter`, `Gauge`, `StatTiles`.
- List cards: `EntityRow` (`status`, `tone`, `meta`, `context`), `MetaLine variant="facts"`, `Fact`.
- Classes: `focusRing`, `focusRingInset`, `hitArea`, `rowInteractive`, `metaText`, `textLink`, `inlineLink`, `surface`, `displayTitle`, `pageTitle`, `sectionTitle`, `leadText`.
- *(from the site)* Glass controls: `glassButton` (`primary | secondary | danger | ghost`), `iconButton(variant, size)`, `glassFlat` (`btn-flat`), `segmented` / `segmentItem` (§Matière). Display scale: `pageTitle` (`display-2`), `sectionTitle` (`display-3`), `leadText` (§2). Explaining: `ConceptIntro` (§5). Motion tokens: `--ease-standard`, `--duration-instant | fast | stage | base | slow` (§Mouvement).
- Menus: `OverflowMenu`, `StatusMenu`, `useFloatingFallback`, `positionFloating`.

## Don'ts

- Filled status pills (`Badge` with a `variant` for status), `glow-*` effects in lists, `.btn-glow-*` once `Button` is glass (§Matière).
- Glass (`ui-glass`, `.btn` recipe) on a card, a row, a section or a chat bubble; more than ~10 blurred controls visible at once (use `btn-flat`).
- A display title (`display-2/3`) inside a list, a row, a card, a dialog or a detail section; `display-1` anywhere in the app.
- An `ease`, `ease-out` or `cubic-bezier(…)` written by hand; a new use of `--transition-fast/normal/slow` or of `--ease-in-soft`.
- A page that types its own concept intro, promise or roadmap status instead of `ConceptIntro` reading the registry.
- `opacity-0 group-hover:opacity-100` actions.
- Local `relativeTime()` / `timeAgo()` helpers — use `format.ts`.
- Filters/search in `PageShell.actions`.
- Cards in cards, borders around every meta item, more than one accent colour.
- `truncate` on the only line identifying an item.

## Matière et mouvement

The app is dark and dense; material and motion exist to make **hierarchy and
cause-and-effect** readable, never to decorate.

### Matière — when to use glass

| Layer | Material | Why |
|---|---|---|
| Page, sections, rows, cards | **Opaque** surfaces (`surface`, `bg-surface-*`) | Text on blur loses contrast; large blurred areas are expensive to composite on a phone while scrolling. |
| Floating layers: menus, popovers, dropdowns, sheets, sticky bars, toasts, the chat queue bar | **Glass** (`glass` → `.ui-glass`) | Says "this is above the page, the page is still there" — keeps context visible behind a transient layer. |
| Modal dialogs | Opaque panel + dimmed (not blurred) backdrop | Focus on one task; blurring the whole viewport costs a full-screen blur for nothing. |
| **Buttons** (`Button` — primary, secondary, danger, ghost — and icon buttons) and the **segmented control** (`ViewTabs`, `ViewToggle`) *(from the site)* | **Glass**, recipe `buttons.css` (`.btn`, `.btn-primary/-secondary/-danger/-ghost`, `.btn-icon`, `.btn-flat`, `.seg`, `.seg-item`) *(planned in `index.css` + `classes.ts`: `glassButton`, `iconButton`, `glassFlat`, `segmented`, `segmentItem`)* | A control is small and sits *on* the page: tinted translucent fill (blur 12px + saturate), a 1px gradient hairline (`::after`), an inner highlight at the top, a soft sheen that slides on hover/focus (`::before`). It reads as "something you can press", which a flat `bg-indigo-600` never did, and it is the one place where the site and the app visibly differed. |

Rules: one glass layer at a time (never glass on glass); blur radius fixed by
the token (14px for layers, 12px for controls — the two values in `buttons.css`
and `.ui-glass`, don't invent others); glass must stay readable with any
content behind it (the class guarantees ≥ 78% opacity and a hairline border);
`.ui-glass` falls back to opaque without `backdrop-filter` and under
`prefers-reduced-transparency`.

**Glass on controls — the rules that come with it** *(from the site —
`website/DESIGN.md` §0, table row `components/ui/Button.tsx` « boutons en verre
(écart volontaire) », and the header of `website/src/styles/buttons.css`)*:

- **Still forbidden on content.** Cards, rows, sections, mockups, the chat
  bubbles, `EntityRow`, `Section`, `Surface`: opaque, as above. The site's §1
  (« Verre : uniquement sur une couche flottante ») and this table agree; the
  app's own `Card` / `StatCard` (`glass … card-hover`, `glass … border-t-2`) are
  the debt, not the rule — they migrate to `surface`.
- **A budget of blurs: at most ~10 visible at once.** A `backdrop-filter` is
  composited per element while scrolling. A dense row of controls (every `⋯` of
  a list, the actions of a toolbar, buttons inside `EntityRow.primaryAction`) is
  **`btn-flat`**: same fill, hairline and sheen, no blur. Rule of thumb: a button
  that repeats per row is flat; a button that appears once per screen (primary
  action, dialog footer, empty-state action) may blur.
- **Variants, unchanged in meaning.** `primary` = indigo→violet glass (the colour
  exception of §3), one per zone; `secondary` = neutral glass; `danger` = red
  glass, only with `confirm`; `ghost` = nothing at rest, the glass appears on
  hover / focus / `aria-expanded="true"` / `aria-current="page"`. Sizes and the
  36px tap target of §10 are the app's (`sizeStyles` in `Button.tsx`), not the
  site's 44px.
- **Icon buttons** are `.btn-icon` (square, `aspect-ratio: 1`, the size comes
  from the caller: `w-9 h-9 md:w-8 md:h-8`), `ghost` by default, `btn-flat`
  inside a row.
- **Segmented control.** `ViewTabs` and `ViewToggle` share the box `seg`
  (3px padding, inset hairline, glass) and the item `seg-item`; the selected item
  (`aria-selected` / `aria-pressed`) is a small tinted glass (the §3 exception),
  the others are text only. Keyboard, focus ring (`outline 2px` indigo-300,
  offset) and the horizontal strip of `ViewTabs` are unchanged.
- **The hover halo follows the pointer** (`--mx` / `--my` on the hovered
  `.btn` / `.seg-item`), written by ONE passive `pointermove` listener mounted
  once in `MainLayout` (`HaloPointer` *(planned, adapted from
  `website/src/components/ux/HaloPointer.tsx)`*: rAF-throttled, CSS variables
  only, no React state), inactive without a fine pointer and under
  `prefers-reduced-motion`. No per-button listeners.
- **Fallbacks are part of the recipe**: opaque fills without `backdrop-filter`
  or under `prefers-reduced-transparency`; `forced-colors` gives a system
  border and no decoration; contrast on `#0a0a0f`: white on primary ≥ 7:1,
  `gray-100` on secondary ≥ 12:1, `red-50` on danger ≥ 7:1 (measured on the site,
  to re-measure on `surface-base` here).
- **`.btn-glow-primary` / `.btn-glow-danger` are retired** once `Button` carries
  the glass recipe: a glow that appears on hover is an effect, the glass is a
  material. `.glow-*` stays forbidden in lists (Don'ts). §9 « No local button
  classes » still holds: pages use `<Button>`, never `btn…` strings.

`SpotlightCard` (`website/DESIGN.md` §2 « Halo discret ») is brought up as
`ui/motion/SpotlightCard`, with a fence: one surface per screen that invites a
click (a page-level empty state, a step of the setup assistant) — never a row,
a card in a list or a `StatCard`, where hover only enhances colour (§10). See
« Kit » under Mouvement.

### Mouvement — one curve, five durations, three families

**One easing curve** *(from the site — `website/DESIGN.md` §2 « Motion plus riche,
mais UNE courbe » and §6 « Une seule courbe (EASE) » ; `website/src/styles/rhythm.css`,
`website/src/motion/tokens.ts`)*: **`--ease-standard: cubic-bezier(0.22, 1, 0.36, 1)`**.
It is the curve the app already had as `--ease-out-soft` (same values, `index.css`);
`--ease-out-soft` is now an alias (`var(--ease-standard)`). Never write an `ease`,
`ease-out` or `cubic-bezier(…)` by hand in a class or a style:
`ease-(--ease-standard)` in Tailwind, `var(--ease-standard)` in CSS, `EASE`
(`utils/motion.ts`) in a `motion/react` transition. The Tailwind `@theme` sets
`--default-transition-timing-function: var(--ease-standard)` and
`--default-transition-duration: var(--duration-fast)`, so a bare
`transition-colors` already runs on the curve. The former
`--transition-fast/normal/slow` (`150 / 200 / 300ms ease`) **are gone**: their
consumers run on `--duration-fast` + `--ease-standard`, and the only
`cubic-bezier(…)` left in `index.css` are the two token declarations
(`styles/buttons.css`, a verbatim copy of the site's, keeps its own on the sheen).
Springs are gone too: `fadeInUp`, `dialogVariants`, `backdropVariants` are tweens
on `EASE` + `DURATION.transition` in, `DURATION.exit` out; `stripMovement` /
`useVariants` (reduced motion) keep opacity and never hand a dialog empty variants.
`transition-all` is **banned** (0 left in `src/`): name what moves —
`transition-colors`, `transition-[transform,opacity]`, `transition-[width]` for a
progress fill — and nothing else tweens by accident.

**Five named durations** *(from the site, same sources)* — all `0ms` under
`prefers-reduced-motion` (`index.css`), in seconds as `DURATION` in `utils/motion.ts`:

| Token | Value | What it is for |
|---|---|---|
| `--duration-instant` | 120 ms | feedback: press, toggle, checkbox (= `--motion-feedback`) |
| `--duration-fast` | 200 ms | hover, menu / popover open, colour change (= `--motion-transition`) |
| `--duration-stage` | 300 ms | one *state* of a view giving way to another: a panel's content swap, a segmented control's selection, an expand/collapse; the ceiling for anything the user triggered |
| `--duration-base` | 400 ms | arrival of a whole block the user asked for (a sheet, a route's content) — never a list row |
| `--duration-slow` | 600 ms | the ceiling of any reveal (a drawn path, a counter) — rare in the app, the site's domain |

The existing aliases **stay** and keep their meaning: `--motion-feedback` (=
`--duration-instant`), `--motion-transition` (= `--duration-fast`), `--motion-exit`
(150, see below). New code uses the `--duration-*` names; old code is migrated
when touched. In a class, a duration is a token too: `duration-(--duration-stage)`,
never `duration-300`.

**Exits.** The site has no exit case (nothing closes on a marketing page); the
app does. An exit is **shorter** than its entrance (`--motion-exit`, 150 ms) and
that is what says "it is gone" — it does *not* need a second curve.
`--ease-in-soft` (`cubic-bezier(0.4, 0, 1, 1)`) is kept as a tolerated alias on
the exits that already use it (`ChatMessages`, `popIn` out) until they migrate to
`--ease-standard`; no new use. This keeps the rule « exits faster than entrances »
below without contradicting « one curve ».

The three families below are unchanged (they say *why* something moves; the
curve and durations above say *how*):

| Family | Purpose | Timing | Examples | Tokens |
|---|---|---|---|---|
| **Feedback** (action) | Confirms the user's action landed | 100–160 ms (`--duration-instant`), `--ease-standard`, starts instantly | press scale, toggle knob, checkbox, colour change on select | `pressFeedback`, `--motion-feedback` |
| **Transition** (spatial) | Shows where something came from / went | 180–240 ms in (`--duration-fast`), up to 300 ms for a state swap (`--duration-stage`), ~150 ms out (`--motion-exit`) — exits faster than entrances | menu/popover open (`popIn`), sheet slide, expand/collapse, route change | `popIn`, `--motion-transition`, `--motion-exit` |
| **Temporal** (time passing) | Represents a duration the user is waiting on | slow (≥ 1 s cycle), low amplitude | running status pulse, indeterminate progress, streaming caret | `StatusDot pulse` |

Decision rule — before adding any animation ask: *what does it tell the
user?* If the answer is "that their action worked" → feedback; "where this
came from / where it went" → transition; "that something is still going on"
→ temporal. If none → **no animation**.

Never:
- entrance/stagger animations on lists or on data that loads (layout shift,
  and it replays on every refetch);
- animation driven by live data at high frequency (streaming text, counters
  updating many times a second) — update in place, no tween;
- looping decorative motion; a temporal animation must **stop** when the
  thing it represents stops (idle = still);
- animating layout properties (`width`, `height`, `top`) — animate
  `transform` and `opacity`;
- durations above 300 ms (`--duration-stage`) for anything the user triggered;
  `--duration-base` (400) is for a block the user *asked to open*, `--duration-slow`
  (600) never for an interaction.

**Kit** — `ui/motion/` (exported from `ui/index.ts`), three pieces copied from
the site's kit (`website/src/motion/`), each with a fence written in its file
header. The fence is the rule; the component is only the recipe.

| Piece | What it does | Allowed | Forbidden |
|---|---|---|---|
| `Reveal` | fade + rise of 12 px, 400 ms (`--duration-base`), once, when the block enters the viewport (`trigger="view"`, Web Animations) or at mount in pure CSS (`trigger="load"` → `.ui-rise-in`). Nothing moves under reduced motion. | a page-level `EmptyState`, the setup assistant, the headline of Today — a block the user asked to open | list items, rows, cards in a list, anything fed by live data, inside a dialog / menu / toast (they have their own entrance). `Stagger` is not brought over. |
| `CountUp` | counts to a value in `tabular-nums`, once, ≤ 600 ms (`--duration-slow`, clamped); prop-compatible with `AnimatedCounter` (`value`, `prefix`, `suffix`, `className`, `duration` in ms); final value under reduced motion | a figure of **proof** read once: Today's headline counters, a `StatCard` on a detail page, a finished run's summary | live data — tokens while streaming, cost ticking, a progress percentage, anything re-rendering many times a second; one counter per row |
| `SpotlightCard` | a `surface` with a 10 % indigo halo following a **mouse** pointer (`pointer-fine:` + `group-hover`), hidden under reduced motion; colour only, the card never moves | one surface per screen that invites a click (empty-state action, a setup step) | lists, `EntityRow`, `StatCard` tiles, glass, nested |

Still not brought up from the site (`website/DESIGN.md` §6, « Inventaire des
animations d'entrée »): `Stagger`, `SplitText`, `Marquee`, `DrawPath`,
`MagneticButton`, `PageHero` with its `art`, `ui-word-in`. They tell a story to a
visitor scrolling once; in the app every list reloads and an entrance would replay
on each refetch (§8), and a loop (`Marquee`) is decoration. The site's hard rules
that *do* apply here are already above: animate `transform` / `opacity` only, one
thing moves at a time, nothing is animated twice, data never animates.

Hovers that **transform** (a lift, a scale) exist only for a fine pointer:
`@media (hover: hover) and (pointer: fine)` in CSS (`.card-hover`), the
`pointer-fine:hover:` variant in a class (heatmap cells, graph nodes). A finger
has no hover: the state would stick after the tap. Colour on hover needs no fence.

Accessibility: under `prefers-reduced-motion`, keep opacity changes (state
must stay legible) and drop movement/scale — `popIn`, `pressFeedback`, the toast
entrance (`@starting-style`, interruptible) and `useVariants` do this; the
`--duration-*` tokens fall to `0ms`, `Reveal` / `CountUp` / `SpotlightCard` do
nothing.

