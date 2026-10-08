/**
 * RfcDetailPage — one proposal (an `rfc` on the wire) with all its information:
 *
 *   Header     title · lifecycle state · importance · dates · next step (primary)
 *   Lifecycle  where the proposal stands on its path (one bar + words) + every
 *              available transition
 *   Content    the proposal's sections (markdown)
 *   Details    importance, dates, author, protocol run, id, tags
 *
 * Reject / supersede end the lifecycle, so they ask for confirmation.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Copy, Hash } from 'lucide-react'
import {
  Button,
  CollapsibleMarkdown,
  ConfirmDialog,
  EntityListSkeleton,
  ErrorState,
  Facts,
  PageContainer,
  PageHeader,
  RelativeTime,
  Section,
  SectionNav,
  StatusText,
  ToneText,
  formatAbsolute,
  getStatusMeta,
  inlineLink,
  pluralize,
} from '@/components/ui'
import { Explainer } from '@/components/protocols/Explainer'
import { ProposalLifecycleLine } from '@/components/protocols/ProposalLifecycleLine'
import {
  apiErrorMessage,
  formatTrigger,
  isBackwardTrigger,
  isDestructiveTrigger,
  rfcState,
  rfcTransitions,
  transitionConfirm,
  triggerIcon,
} from '@/components/protocols/rfcLifecycle'
import { rfcApi } from '@/services/rfcApi'
import { useConfirmDialog, useSectionObserver, useToast, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type { Rfc, RfcAvailableTransition } from '@/types/protocol'
import { NOMENCLATURE } from '@/constants/nomenclature'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RfcDetailPage() {
  const { rfcId } = useParams<{ rfcId: string }>()
  const wsSlug = useWorkspaceSlug()
  const toast = useToast()
  const confirm = useConfirmDialog()

  const [rfc, setRfc] = useState<Rfc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [transitioning, setTransitioning] = useState<string | null>(null)

  const fetchRfc = useCallback(async () => {
    if (!rfcId) return
    setLoading(true)
    setError(null)
    try {
      setRfc(await rfcApi.get(rfcId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this proposal')
    } finally {
      setLoading(false)
    }
  }, [rfcId])

  useEffect(() => {
    fetchRfc()
  }, [fetchRfc])

  // Fire an FSM transition (trigger comes from available_transitions)
  const fire = useCallback(
    async (trigger: string) => {
      if (!rfcId) return
      setTransitioning(trigger)
      try {
        const updated = await rfcApi.transition(rfcId, trigger)
        setRfc(updated)
        toast.success(`${formatTrigger(trigger)}: ${getStatusMeta('rfc', rfcState(updated)).label}`)
      } catch (err) {
        toast.error(apiErrorMessage(err, `Failed to fire "${trigger}"`))
      } finally {
        setTransitioning(null)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable (Jotai setter)
    [rfcId],
  )

  const request = (t: RfcAvailableTransition) => {
    if (!rfc) return
    if (isDestructiveTrigger(t.trigger)) {
      const c = transitionConfirm(t.trigger, rfc.title)
      confirm.open({ ...c, variant: 'danger', onConfirm: () => fire(t.trigger) })
    } else {
      void fire(t.trigger)
    }
  }

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${what} copied`)
    } catch {
      toast.error('Failed to copy to clipboard')
    }
  }

  const copyMarkdown = () => {
    if (!rfc) return
    const lines: string[] = [`# ${rfc.title}`, '']
    lines.push(`**Status:** ${rfc.current_state ?? rfc.status}`)
    lines.push(`**Importance:** ${rfc.importance}`)
    lines.push(`**Created:** ${formatAbsolute(rfc.created_at)}`)
    if (rfc.updated_at) lines.push(`**Updated:** ${formatAbsolute(rfc.updated_at)}`)
    const tags = rfc.tags.filter((t) => !t.startsWith('rfc-'))
    if (tags.length > 0) lines.push(`**Tags:** ${tags.join(', ')}`)
    lines.push('', '---', '')
    for (const section of rfc.sections) {
      if (rfc.sections.length === 1 && section.title === 'Content') lines.push(section.content)
      else lines.push(`## ${section.title}`, '', section.content)
      lines.push('')
    }
    void copy(lines.join('\n'), 'Proposal (Markdown)')
  }

  // Quick-jump nav only for long documents (≥ 4 sections)
  const navSections = useMemo(
    () => (rfc && rfc.sections.length >= 4 ? rfc.sections.map((s, i) => ({ id: `section-${i}`, label: s.title })) : []),
    [rfc],
  )
  const navIds = useMemo(() => navSections.map((s) => s.id), [navSections])
  const activeSection = useSectionObserver(navIds)

  // ── Loading / error ──────────────────────────────────────────────────
  if (loading && !rfc) {
    return (
      <PageContainer width="wide" className="space-y-6">
        <div className="h-7 w-2/3 rounded bg-white/[0.04]" />
        <EntityListSkeleton rows={3} />
      </PageContainer>
    )
  }
  if (error || !rfc) {
    return (
      <PageContainer width="wide">
        <ErrorState title="Could not load the proposal" description={error || 'It may have been deleted, or the link is wrong.'} onRetry={fetchRfc} />
      </PageContainer>
    )
  }

  const state = rfcState(rfc)
  const transitions = rfcTransitions(rfc)
  // Primary = the first forward step (not backward, not closing)
  const primary = transitions.find((t) => !isDestructiveTrigger(t.trigger) && !isBackwardTrigger(t.trigger))
  const others = transitions.filter((t) => t !== primary)
  const isSingleContent = rfc.sections.length === 1 && rfc.sections[0].title === 'Content'
  const visibleTags = rfc.tags.filter((t) => !t.startsWith('rfc-'))
  const importanceLabel = `${getStatusMeta('importance', rfc.importance).label} importance`

  // Closing a proposal is the one destructive gesture here: red glass, and it asks first (`request`).
  const transitionButton = (t: RfcAvailableTransition, variant: 'primary' | 'secondary') => {
    const Icon = triggerIcon(t.trigger)
    const busy = transitioning === t.trigger
    return (
      <Button
        key={t.trigger}
        size="sm"
        variant={isDestructiveTrigger(t.trigger) ? 'danger' : variant}
        onClick={() => request(t)}
        loading={busy}
        disabled={!!transitioning && !busy}
        className="gap-1.5"
      >
        {!busy && <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
        {formatTrigger(t.trigger)}
        <span className="text-xs font-normal opacity-70">→ {getStatusMeta('rfc', t.target_state).label}</span>
      </Button>
    )
  }

  return (
    <PageContainer width="wide" className="space-y-6">
      <PageHeader
        title={rfc.title}
        entityRef={{ kind: 'rfc', id: rfc.id }}
        parentLinks={[
          {
            icon: NOMENCLATURE.proposals.icon,
            label: NOMENCLATURE.proposals.singular,
            name: NOMENCLATURE.proposals.plural,
            href: workspacePath(wsSlug, `/${NOMENCLATURE.proposals.segment}`),
          },
        ]}
        status={<StatusText kind="rfc" status={state} />}
        meta={[
          <StatusText key="imp" kind="importance" status={rfc.importance} dot={false} label={importanceLabel} />,
          <RelativeTime key="c" date={rfc.created_at} prefix="created " />,
          rfc.updated_at ? <RelativeTime key="u" date={rfc.updated_at} prefix="updated " /> : null,
          pluralize(rfc.sections.length, 'section'),
        ]}
        actions={primary ? transitionButton(primary, 'primary') : undefined}
        overflowActions={[
          { label: 'Copy as Markdown', icon: Copy, onClick: copyMarkdown },
          { label: 'Copy ID', icon: Hash, onClick: () => copy(rfc.id, 'Proposal ID') },
        ]}
      />

      {/* ── Lifecycle ─────────────────────────────────────────────────── */}
      <Section title="Lifecycle" description="A proposal puts a change up for review before it is decided.">
        <div className="space-y-3">
          <ProposalLifecycleLine status={state} />
          <Explainer>
            “Revise” and “Replan” send it back to a previous step; “Reject” and “Supersede” close it for good.
          </Explainer>
          {transitions.length === 0 ? (
            state !== 'implemented' && state !== 'rejected' && state !== 'superseded' ? (
              <p className="text-sm text-gray-400">No step is available from this state.</p>
            ) : null
          ) : others.length > 0 ? (
            <div className="flex flex-wrap gap-2">{others.map((t) => transitionButton(t, 'secondary'))}</div>
          ) : null}
        </div>
      </Section>

      {/* ── Content ───────────────────────────────────────────────────── */}
      {navSections.length > 0 && <SectionNav sections={navSections} activeSection={activeSection} />}
      {isSingleContent ? (
        <Section title="Content">
          <div className="text-sm text-gray-300">
            <CollapsibleMarkdown content={rfc.sections[0].content} maxHeight={600} />
          </div>
        </Section>
      ) : (
        rfc.sections.map((section, idx) => (
          <Section key={idx} id={`section-${idx}`} title={section.title}>
            <div className="text-sm text-gray-300">
              <CollapsibleMarkdown content={section.content} maxHeight={400} />
            </div>
          </Section>
        ))
      )}

      {/* ── Details ───────────────────────────────────────────────────── */}
      <Section title="Details">
        <Facts
          items={[
            { label: 'State', value: <StatusText kind="rfc" status={state} /> },
            { label: 'Importance', value: <StatusText kind="importance" status={rfc.importance} /> },
            { label: 'Created', value: formatAbsolute(rfc.created_at) },
            { label: 'Updated', value: rfc.updated_at ? formatAbsolute(rfc.updated_at) : null },
            { label: 'Author', value: rfc.created_by },
            { label: 'Sections', value: String(rfc.sections.length) },
            {
              label: 'Protocol run',
              value: rfc.protocol_run_id ? (
                <Link to={workspacePath(wsSlug, '/protocols')} className={`font-mono text-xs ${inlineLink}`}>
                  {rfc.protocol_run_id.slice(0, 8)} →
                </Link>
              ) : (
                <ToneText tone="warning" icon label="Not linked" />
              ),
            },
            { label: 'ID', value: <span className="font-mono text-xs break-all">{rfc.id}</span> },
          ]}
        />
        {visibleTags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Tags">
            {visibleTags.map((tag) => (
              <span key={tag} className="rounded border border-white/[0.08] px-1.5 text-[11px] text-gray-400">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* ENTITY_GRAPH_SLOT entity_type="note" entity_id={rfc.id} */}

      <ConfirmDialog {...confirm.dialogProps} />
    </PageContainer>
  )
}
