# UI design contract

The rules every page follows. Goal: **functional, consistent, compact, classy** —
and comfortable **on a phone first** (most usage is mobile). Reference
implementation: the conversation list (`components/chat/SessionList.tsx`) and
the worked example `pages/DecisionsPage.tsx`.

Everything below is importable from `@/components/ui`. Page code must not
re-implement a primitive that exists here; if something is missing, compose
existing primitives inside the page's own folder — never copy/paste a variant.

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

Numbers that change or align (counts, dates, costs) use `tabular-nums`. No
`uppercase tracking-wider` labels, no `text-lg`+ inside rows, no bold in meta.

## 3. Colour roles

- Surfaces: page `surface-base` (from layout) · list/section container `surface` (`rounded-xl border border-white/[0.06] bg-white/[0.02]`) · menus `bg-surface-popover`. Existing `Card` is fine for rich content blocks.
- Text: `gray-100` titles · `gray-200` row titles · `gray-300` body · `gray-400` secondary · `gray-500` meta · `gray-600/700` separators & placeholders.
- **One accent: indigo.** Selection, focus rings, primary buttons, active tab, links-as-actions (`textLink`). Don't introduce other accent colours.
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
[leading] Title (≤ 2 lines) ····················· trailing  [⋯]
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
| Empty | `<EmptyState title description action />` (+ `variant` illustration) | `<EmptyState size="sm" icon title />` |
| Error | `<ErrorState description onRetry />` | same, or a toast for background refreshes |

- Distinguish "nothing yet" (explain how to create + primary action) from "no match" (suggest clearing filters, offer `Clear`).
- Wording: **"No X yet"** + the create action (same label as the header, e.g. "New plan") · **"No matching X"** + a `Clear` button that resets filters *and* search. Inside a section: "No X yet" + the section's "Add" / "Link" action when one exists.
- Loading must not shift layout: skeleton shapes match the final rows. No centred spinners for lists.
- No entrance animations on list items (no stagger / `layout` motion) — they cause layout shift.

## 9. Actions

- **Primary** (create, run): one `<Button size="sm">` in `PageShell.actions` / `PageHeader.actions`. At most one primary + one secondary visible.
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
- Classes: `focusRing`, `focusRingInset`, `hitArea`, `rowInteractive`, `metaText`, `textLink`, `inlineLink`, `surface`.
- Menus: `OverflowMenu`, `StatusMenu`, `useFloatingFallback`, `positionFloating`.

## Don'ts

- Filled status pills (`Badge` with a `variant` for status), `glow-*` effects in lists.
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

Rules: one glass layer at a time (never glass on glass); blur radius fixed by
the token (14px) — don't invent others; glass must stay readable with any
content behind it (the class guarantees ≥ 78% opacity and a hairline border);
`.ui-glass` falls back to opaque without `backdrop-filter` and under
`prefers-reduced-transparency`.

### Mouvement — three families, three timings

| Family | Purpose | Timing | Examples | Tokens |
|---|---|---|---|---|
| **Feedback** (action) | Confirms the user's action landed | 100–160 ms, `ease-out`, starts instantly | press scale, toggle knob, checkbox, colour change on select | `pressFeedback`, `--motion-feedback` |
| **Transition** (spatial) | Shows where something came from / went | 180–240 ms in (`--ease-out-soft`), ~150 ms out (`--ease-in-soft`) — exits faster than entrances | menu/popover open (`popIn`), sheet slide, expand/collapse, route change | `popIn`, `--motion-transition`, `--motion-exit` |
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
- durations above 300 ms for anything the user triggered.

Accessibility: under `prefers-reduced-motion`, keep opacity changes (state
must stay legible) and drop movement/scale — `popIn` and `pressFeedback`
already do this.

