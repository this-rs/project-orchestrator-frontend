/**
 * The panel of the provider settings (consent, roles, aliases, policy), in the
 * visual language of the wizard and the provider cards:
 *
 * ```
 * ┌──────────────────────────────────────────────────────────┐
 * │ Title                                  [header control] │  header: what it is for, in one sentence
 * │ one sentence: what it does, what happens if left empty  │
 * ├──────────────────────────────────────────────────────────┤
 * │ body (grid of fields: labels above, constant width)     │
 * ├──────────────────────────────────────────────────────────┤
 * │ status message                  [Annuler] [Enregistrer] │  ONE footer, actions on the right
 * └──────────────────────────────────────────────────────────┘
 * ```
 */
import { useId, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { surface } from '@/components/ui'
import { FIELD_LABEL, NativeSelect } from './FormField'
import type { ProjectOption } from './useProjectOptions'

interface PanelProps {
  title?: ReactNode
  description?: ReactNode
  /** Right of the header (a project picker): on its own line on a phone. */
  aside?: ReactNode
  /** The footer: a status line on the left, actions on the right. */
  status?: ReactNode
  actions?: ReactNode
  testId?: string
  children?: ReactNode
}

export function Panel({
  title,
  description,
  aside,
  status,
  actions,
  testId,
  children,
}: PanelProps) {
  const headingId = useId()
  const hasHeader = !!(title || description || aside)
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      data-testid={testId}
      className={surface}
    >
      {hasHeader && (
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.06] p-4">
          {(title || description) && (
            <div className="min-w-0 flex-[1_1_18rem]">
              {title && (
                <h3 id={headingId} className="text-sm font-semibold text-gray-100">
                  {title}
                </h3>
              )}
              {description && <p className="mt-1 text-xs leading-5 text-gray-400">{description}</p>}
            </div>
          )}
          {aside && <div className="w-full min-w-0 sm:w-72 sm:shrink-0">{aside}</div>}
        </header>
      )}
      {children !== undefined && children !== null && children !== false && (
        <div className="space-y-4 p-4">{children}</div>
      )}
      {(status || actions) && (
        <footer className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-white/[0.06] px-4 py-3">
          <div className="mr-auto min-w-0 text-xs">{status}</div>
          {actions && (
            <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
          )}
        </footer>
      )}
    </section>
  )
}

/** "Chargement…" line. */
export function Loading({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-gray-400">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {children}
    </p>
  )
}

/** A readable error line (the message of the named request, never an object). */
export function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-xs text-red-400">
      {children}
    </p>
  )
}

/** "Enregistré." / error, for the left of a footer. */
export function SaveStatus({
  error,
  done,
  doneText = 'Enregistré.',
}: {
  error: string | null
  done: boolean
  doneText?: string
}) {
  if (error) return <ErrorLine>{error}</ErrorLine>
  if (done)
    return (
      <span role="status" className="text-emerald-300">
        {doneText}
      </span>
    )
  return null
}

/**
 * The project a panel is about, drawn as its header control. `allLabel` adds a
 * first choice for "every project" (the value '').
 */
export function ProjectPicker({
  id,
  projects,
  value,
  onChange,
  allLabel,
  label = 'Projet',
}: {
  id: string
  projects: ProjectOption[] | null
  value: string
  onChange: (slug: string) => void
  allLabel?: string
  label?: string
}) {
  const empty = projects !== null && projects.length === 0
  return (
    <div>
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      <NativeSelect
        id={id}
        value={value}
        disabled={projects === null || (empty && !allLabel)}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={empty ? `${id}-empty` : undefined}
      >
        {allLabel ? (
          <option value="">{allLabel}</option>
        ) : (
          <option value="">
            {projects === null
              ? 'Chargement des projets…'
              : empty
                ? 'Aucun projet'
                : 'Choisir un projet…'}
          </option>
        )}
        {(projects ?? []).map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.name}
          </option>
        ))}
      </NativeSelect>
      {empty && (
        <p id={`${id}-empty`} className="mt-1 text-xs text-gray-500">
          Aucun projet.{' '}
          <Link
            to="/workspace-selector"
            className="text-indigo-400 underline hover:text-indigo-300"
          >
            Créer un projet dans un espace de travail
          </Link>
        </p>
      )}
    </div>
  )
}
