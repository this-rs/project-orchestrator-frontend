/**
 * Row renderers shared by TaskDetailPage and PlanDetailPage (steps,
 * decisions, linked chat sessions, commit-SHA field). All built on EntityRow
 * so both detail pages read the same.
 */
import { costReport, costToText, formatUsd2 } from '@/utils/cost'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ListChecks, MessageCircle, Pencil, Plus, ScrollText, ShieldCheck, Trash2, type LucideIcon } from 'lucide-react'
import {
  Button,
  EntityListSkeleton,
  EntityRow,
  PageContainer,
  SkeletonLine,
  RelativeTime,
  StatusMenu,
  StatusText,
  humanizeStatus,
  inlineLink,
  rowInteractive,
  hitArea,
} from '@/components/ui'
import type { Constraint, Decision, DecisionStatus, SessionWithLinks, Step, StepStatus } from '@/types'
import { workspacePath } from '@/utils/paths'
import { useT } from '@/i18n'
import { decisionTitle } from '@/components/knowledge/noteMeta'

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
  const { t } = useT()
  return (
    <PageContainer width="wide" className="space-y-6">
      <div className="space-y-2" role="status" aria-label={t('tasks.rows.loading')}>
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
  const { t } = useT()
  const done = step.status === 'completed' || step.status === 'skipped'
  return (
    <EntityRow
      title={step.description}
      muted={done}
      leading={
        <span
          className={`w-5 text-right text-[11px] leading-5 tabular-nums ${step.status === 'completed' ? 'text-emerald-400' : 'text-gray-500'}`}
          aria-label={t('tasks.rows.stepN', { n: index + 1 })}
        >
          {step.status === 'completed' ? <CheckCircle2 className="inline w-3.5 h-3.5" aria-hidden="true" /> : index + 1}
        </span>
      }
      description={step.verification ? t('tasks.rows.verify', { text: step.verification }) : undefined}
      trailing={step.completed_at ? <RelativeTime date={step.completed_at} prefix={t('tasks.rows.donePrefix')} /> : undefined}
      meta={[<StatusMenu key="s" kind="step" status={step.status} onChange={onStatusChange} />]}
      actions={[
        { label: t('tasks.actions.edit'), icon: Pencil, onClick: () => onEdit?.(), hidden: !onEdit },
        {
          label: t('tasks.actions.delete'),
          icon: Trash2,
          variant: 'danger',
          onClick: () => onDelete?.(),
          hidden: !onDelete,
          confirm: { title: t('tasks.rows.deleteStepTitle'), description: t('tasks.rows.deleteStepBody'), confirmLabel: t('tasks.actions.delete') },
        },
      ]}
      ariaLabel={t('tasks.rows.stepNDescription', { n: index + 1, text: step.description })}
    />
  )
}

// ── Compact steps (expanded under a task row) ───────────────────────────

/** Read-only step list shown inside an expanded task row (plan page). */
export function CompactStepList({ steps, loading }: { steps: Step[] | null; loading?: boolean }) {
  const { t } = useT()
  if (loading) return <p className="text-xs text-gray-500 py-0.5">{t('tasks.rows.loadingSteps')}</p>
  if (!steps || steps.length === 0) return <p className="text-xs text-gray-500 py-0.5">{t('tasks.rows.noSteps')}</p>
  return (
    <ol className="space-y-1" aria-label={t('tasks.rows.steps')}>
      {steps.map((step, index) => {
        const done = step.status === 'completed' || step.status === 'skipped'
        return (
          <li key={step.id || index} className="flex items-start gap-2 min-w-0 text-xs leading-4">
            <span className={`w-4 shrink-0 text-right tabular-nums ${done ? 'text-gray-600' : 'text-gray-500'}`} aria-hidden="true">
              {index + 1}
            </span>
            <span className={`flex-1 min-w-0 break-words ${done ? 'text-gray-500' : 'text-gray-300'}`}>{step.description}</span>
            <StatusText kind="step" status={step.status} className="shrink-0 text-[11px]" />
          </li>
        )
      })}
    </ol>
  )
}

// ── Constraint ──────────────────────────────────────────────────────────

interface ConstraintRowProps {
  constraint: Constraint
  onDelete: () => Promise<void>
}

export function ConstraintRow({ constraint, onDelete }: ConstraintRowProps) {
  const { t } = useT()
  return (
    <EntityRow
      title={constraint.description}
      leading={<ShieldCheck className="w-3.5 h-3.5 text-gray-500" aria-hidden="true" />}
      meta={[
        <span key="type" className="text-gray-400">{humanizeStatus(constraint.constraint_type)}</span>,
        constraint.severity ? t('tasks.rows.severity', { severity: constraint.severity }) : null,
        constraint.enforced_by ? (
          <span key="by" className="truncate max-w-[12rem]" title={t('tasks.rows.enforcedBy', { name: constraint.enforced_by })}>
            {t('tasks.rows.by', { name: constraint.enforced_by })}
          </span>
        ) : null,
      ]}
      actions={[
        {
          label: t('tasks.actions.delete'),
          icon: Trash2,
          variant: 'danger',
          onClick: onDelete,
          confirm: { title: t('tasks.rows.deleteConstraintTitle'), description: t('tasks.rows.deleteConstraintBody'), confirmLabel: t('tasks.actions.delete') },
        },
      ]}
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
  const { t } = useT()
  const alternatives = decision.alternatives?.length ?? 0
  return (
    <EntityRow
      title={decisionTitle(decision.description)}
      entityRef={{ kind: 'decision', id: decision.id }}
      href={workspacePath(wsSlug, `/decisions/${decision.id}`)}
      muted={decision.status === 'superseded'}
      trailing={<RelativeTime date={decision.decided_at} />}
      description={decision.rationale}
      meta={[
        <StatusMenu key="status" kind="decision" status={decision.status} onChange={onStatusChange} />,
        decision.chosen_option ? (
          <span key="chosen" className="inline-flex items-center gap-1 min-w-0 text-gray-400" title={t('tasks.rows.chosen', { option: decision.chosen_option })}>
            <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" aria-label={t('tasks.rows.chosenOption')} />
            <span className="truncate max-w-[14rem]">{decision.chosen_option}</span>
          </span>
        ) : null,
        source,
        alternatives > 0 ? t(alternatives === 1 ? 'tasks.rows.alternatives.one' : 'tasks.rows.alternatives.other', { count: alternatives }) : null,
      ]}
      actions={[
        {
          label: t('tasks.actions.delete'),
          icon: Trash2,
          variant: 'danger',
          onClick: onDelete,
          confirm: { title: t('tasks.rows.deleteDecisionTitle'), description: t('tasks.rows.deleteDecisionBody') },
        },
      ]}
    />
  )
}

/** Meta link to a task, above the row's stretched link. */
export function TaskMetaLink({ to, state, label }: { to: string; state?: unknown; label: string }) {
  const { t } = useT()
  return (
    <Link
      to={to}
      state={state}
      title={t('tasks.rows.taskLink', { label })}
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
  const { t } = useT()
  const { session, links, source } = item
  const title = session.title || t('tasks.rows.session', { id: session.id.slice(0, 8) })
  const linkedTasks = showTasks ? links.linked_tasks : []
  const context =
    linkedTasks.length > 0 || links.linked_rfcs.length > 0 ? (
      <div className="space-y-0.5 text-[11px] leading-4 text-gray-500">
        {linkedTasks.length > 0 && (
          <p className="flex items-start gap-1 min-w-0">
            <ListChecks className="w-3 h-3 mt-0.5 shrink-0" aria-label={t('tasks.rows.linkedTasks')} />
            <span className="break-words min-w-0">{linkedTasks.map((lt) => lt.title).join(' · ')}</span>
          </p>
        )}
        {links.linked_rfcs.length > 0 && (
          <p className="flex items-start gap-1 min-w-0">
            <ScrollText className="w-3 h-3 mt-0.5 shrink-0" aria-label={t('tasks.rows.linkedRfcs')} />
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
        session.model ? (
          <span key="model" className="truncate max-w-[10rem]" title={session.model}>
            {session.model}
          </span>
        ) : null,
        session.cwd ? (
          <span key="cwd" className="truncate max-w-[12rem] font-mono" title={session.cwd}>
            {shortCwd(session.cwd)}
          </span>
        ) : null,
        t(session.message_count === 1 ? 'tasks.rows.messages.one' : 'tasks.rows.messages.other', { count: session.message_count }),
        costToText(costReport(session.total_cost_usd, session.cost_basis), { format: formatUsd2, hideZero: true }),
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
  const { t } = useT()
  return (
    <div className="space-y-2">
      <label htmlFor="commit-sha" className="block text-sm font-medium text-gray-300">
        {t('tasks.rows.commitSha')}
      </label>
      <input
        id="commit-sha"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('tasks.rows.commitShaPlaceholder')}
        pattern="[a-f0-9]{7,40}"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="w-full h-10 px-3 bg-white/[0.04] border border-white/[0.08] rounded-lg text-base md:text-sm text-gray-200 placeholder:text-gray-500 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50"
        autoFocus
      />
      <p className="text-xs text-gray-500">{t(entity === 'task' ? 'tasks.rows.commitShaHelpTask' : 'tasks.rows.commitShaHelpPlan')}</p>
    </div>
  )
}
