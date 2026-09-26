/**
 * Row renderers shared by TaskDetailPage and PlanDetailPage (steps,
 * decisions, linked chat sessions, commit-SHA field). All built on EntityRow
 * so both detail pages read the same.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ListChecks, MessageCircle, Pencil, Plus, ScrollText, Trash2, type LucideIcon } from 'lucide-react'
import {
  Button,
  EntityListSkeleton,
  EntityRow,
  PageContainer,
  SkeletonLine,
  RelativeTime,
  StatusMenu,
  formatCost,
  inlineLink,
  pluralize,
  rowInteractive,
  hitArea,
} from '@/components/ui'
import type { Decision, DecisionStatus, SessionWithLinks, Step, StepStatus } from '@/types'
import { workspacePath } from '@/utils/paths'

/**
 * Section header action: compact ghost button, short visible label ("Add",
 * "Link") with the full action as accessible name.
 */
export function SectionAddButton({ label, onClick, icon: Icon = Plus }: { label: string; onClick: () => void; icon?: LucideIcon }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClick} aria-label={label}>
      <Icon className="w-4 h-4 mr-1 -ml-1" aria-hidden="true" />
      {label.split(' ')[0]}
    </Button>
  )
}

/** Detail-page loading state: header lines + a list, same shapes as the page. */
export function DetailSkeleton() {
  return (
    <PageContainer width="wide" className="space-y-6">
      <div className="space-y-2" role="status" aria-label="Loading">
        <SkeletonLine width="30%" className="h-3" />
        <SkeletonLine width="70%" className="h-7" />
        <SkeletonLine width="45%" className="h-3" />
      </div>
      <EntityListSkeleton rows={4} />
    </PageContainer>
  )
}

/** Muted one-liner for an empty section (keeps empty sections compact). */
export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="px-1 py-1 text-xs text-gray-500">{children}</p>
}

// ── Step ────────────────────────────────────────────────────────────────

interface StepRowProps {
  step: Step
  index: number
  onStatusChange: (status: StepStatus) => Promise<void>
  onEdit?: () => void
  onDelete?: () => Promise<void>
}

export function StepRow({ step, index, onStatusChange, onEdit, onDelete }: StepRowProps) {
  const done = step.status === 'completed' || step.status === 'skipped'
  return (
    <EntityRow
      title={step.description}
      muted={done}
      leading={
        <span
          className={`w-5 text-right text-[11px] leading-5 tabular-nums ${step.status === 'completed' ? 'text-emerald-400' : 'text-gray-500'}`}
          aria-label={`Step ${index + 1}`}
        >
          {step.status === 'completed' ? <CheckCircle2 className="inline w-3.5 h-3.5" aria-hidden="true" /> : index + 1}
        </span>
      }
      description={step.verification ? `Verify: ${step.verification}` : undefined}
      meta={[
        <StatusMenu key="s" kind="step" status={step.status} onChange={onStatusChange} />,
        step.completed_at ? <RelativeTime key="c" date={step.completed_at} prefix="done " /> : null,
      ]}
      actions={[
        { label: 'Edit step', icon: Pencil, onClick: () => onEdit?.(), hidden: !onEdit },
        {
          label: 'Delete step',
          icon: Trash2,
          variant: 'danger',
          onClick: () => onDelete?.(),
          hidden: !onDelete,
          confirm: { title: 'Delete step?', description: 'This step will be permanently deleted.', confirmLabel: 'Delete' },
        },
      ]}
      ariaLabel={`Step ${index + 1}: ${step.description}`}
    />
  )
}

// ── Decision ────────────────────────────────────────────────────────────

interface DecisionRowProps {
  decision: Decision
  wsSlug: string
  onStatusChange: (status: DecisionStatus) => Promise<void>
  onDelete: () => Promise<void>
  /** Extra meta item (e.g. the originating task on a plan page). */
  source?: ReactNode
}

export function DecisionRow({ decision, wsSlug, onStatusChange, onDelete, source }: DecisionRowProps) {
  const alternatives = decision.alternatives?.length ?? 0
  return (
    <EntityRow
      title={decision.description}
      href={workspacePath(wsSlug, `/decisions/${decision.id}`)}
      muted={decision.status === 'superseded'}
      trailing={<RelativeTime date={decision.decided_at} />}
      description={decision.rationale}
      meta={[
        <StatusMenu key="status" kind="decision" status={decision.status} onChange={onStatusChange} />,
        decision.chosen_option ? (
          <span key="chosen" className="inline-flex items-center gap-1 min-w-0 text-gray-400" title={`Chosen: ${decision.chosen_option}`}>
            <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" aria-label="Chosen option" />
            <span className="truncate max-w-[14rem]">{decision.chosen_option}</span>
          </span>
        ) : null,
        alternatives > 0 ? pluralize(alternatives, 'alternative') : null,
        source,
      ]}
      actions={[
        {
          label: 'Delete',
          icon: Trash2,
          variant: 'danger',
          onClick: onDelete,
          confirm: { title: 'Delete Decision', description: 'Permanently delete this decision? This cannot be undone.' },
        },
      ]}
    />
  )
}

/** Meta link to a task, above the row's stretched link. */
export function TaskMetaLink({ to, state, label }: { to: string; state?: unknown; label: string }) {
  return (
    <Link
      to={to}
      state={state}
      title={`Task: ${label}`}
      className={`${rowInteractive} ${hitArea} ${inlineLink} inline-flex items-center gap-1 min-w-0`}
    >
      <ListChecks className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span className="truncate max-w-[14rem]">{label}</span>
    </Link>
  )
}

// ── Linked chat session ─────────────────────────────────────────────────

const shortCwd = (cwd: string) => cwd.replace(/^\/(?:Users|home)\/[^/]+\//, '~/')

interface SessionRowProps {
  item: SessionWithLinks
  onOpen: () => void
  /** Show the tasks linked to the session (plan page). */
  showTasks?: boolean
}

export function SessionRow({ item, onOpen, showTasks }: SessionRowProps) {
  const { session, links, source } = item
  const title = session.title || `Session ${session.id.slice(0, 8)}`
  const linkedTasks = showTasks ? links.linked_tasks : []
  const context =
    linkedTasks.length > 0 || links.linked_rfcs.length > 0 ? (
      <div className="space-y-0.5 text-[11px] leading-4 text-gray-500">
        {linkedTasks.length > 0 && (
          <p className="flex items-start gap-1 min-w-0">
            <ListChecks className="w-3 h-3 mt-0.5 shrink-0" aria-label="Linked tasks" />
            <span className="break-words min-w-0">{linkedTasks.map((t) => t.title).join(' · ')}</span>
          </p>
        )}
        {links.linked_rfcs.length > 0 && (
          <p className="flex items-start gap-1 min-w-0">
            <ScrollText className="w-3 h-3 mt-0.5 shrink-0" aria-label="Linked RFCs" />
            <span className="break-words min-w-0">{links.linked_rfcs.map((r) => r.title).join(' · ')}</span>
          </p>
        )}
      </div>
    ) : undefined

  return (
    <EntityRow
      title={title}
      onClick={onOpen}
      leading={<MessageCircle className="w-3.5 h-3.5 text-gray-500" aria-hidden="true" />}
      trailing={<RelativeTime date={session.created_at} />}
      description={session.preview}
      meta={[
        <span key="src">{source}</span>,
        pluralize(session.message_count, 'msg'),
        session.model ? (
          <span key="model" className="truncate max-w-[10rem]" title={session.model}>
            {session.model}
          </span>
        ) : null,
        formatCost(session.total_cost_usd),
        session.cwd ? (
          <span key="cwd" className="truncate max-w-[12rem] font-mono" title={session.cwd}>
            {shortCwd(session.cwd)}
          </span>
        ) : null,
      ]}
      context={context}
      chevron
    />
  )
}

// ── Commit SHA input (Link commit dialog) ───────────────────────────────

export function CommitShaField({
  value,
  onChange,
  entity,
}: {
  value: string
  onChange: (v: string) => void
  entity: 'task' | 'plan'
}) {
  return (
    <div className="space-y-2">
      <label htmlFor="commit-sha" className="block text-sm font-medium text-gray-300">
        Commit SHA
      </label>
      <input
        id="commit-sha"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. a1b2c3d or full 40-char SHA"
        pattern="[a-f0-9]{7,40}"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="w-full h-10 px-3 bg-white/[0.04] border border-white/[0.08] rounded-lg text-base md:text-sm text-gray-200 placeholder:text-gray-500 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50"
        autoFocus
      />
      <p className="text-xs text-gray-500">Enter a 7–40 character hex commit hash to link to this {entity}.</p>
    </div>
  )
}
