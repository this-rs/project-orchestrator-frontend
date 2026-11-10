# Frontend ↔ Backend type divergences (correction pass)

Two divergences were **fixed** in this pass (see commit):

1. `TaskStatus` was missing `'interrupted'` (`src/types/index.ts`) — a real backend
   state (`backend/src/neo4j/models.rs`, `TaskStatus::Interrupted`). Rendered now in
   `statusMeta.ts`, `Badge.tsx` and `DependencyGraphView.tsx`.
2. `Note.project_id` was `string`; it is `Option<Uuid>` (`null` for a global note).
   Now `string | null`, with the `supersede` call signature widened accordingly.

The remaining divergences are **left as-is**, with the reason:

| # | Divergence | Frontend | Backend | Why left |
|---|---|---|---|---|
| 1 | `NoteType` missing `rfc` | `src/types/index.ts` (guideline…assertion) | `NoteType::Rfc` → `"rfc"` | RFCs have their own render/management path; adding the variant would ripple into note forms & filters with no current reader. |
| 2 | `Note.scope` optional | `scope?: NoteScope` | `scope: NoteScope` (always present) | Safe superset; no unconditional read of `.scope`. |
| 3 | `Note.scope` wire shape | `{ type, path? }` | tagged enum with payload (`Module(String)`, `File(String)`, …) | Out of scope; no unprotected read, and the form never round-trips scope. |
| 4 | `Note` ignored fields | absent | `author_kind`, `confidence`, `human_confirmed_at/by`, `last_confirmed_by`, `energy`, `last_activated`, `reactivation_count`, `last_reactivated`, `freshness_pinged_at`, `valid_from/until`, `memory_horizon`, `sharing_consent`, `scar_intensity` | Additive; not rendered by any UI today. |
| 5 | `CreateNoteRequest.project_id` | `string` | `Option<Uuid>` | A global note can't be created from the frontend type. Only `supersede` was widened here; fixing `create` ripples into `CreateNoteForm`. |
| 6 | `CreateNoteRequest` missing fields | absent | `scope`, `assertion_rule`, `run_id`, `sharing_consent` | Not requested by any form. |
| 7 | `TaskCounts.interrupted` | absent (`TaskProgress.tsx` renders done/active/blocked/failed only) | `interrupted: u32` | Additive counter; the progress bar is a summary and no card asks for it. |
| 8 | `Note.supersedes` / `superseded_by` | `string?` | `Option<Uuid>` | Same nullable sub-typing as `project_id`, but nothing reads these as a navigation id — purely informative. |
