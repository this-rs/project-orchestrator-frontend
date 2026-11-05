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
import { activeTranslator, useT } from '@/i18n'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RfcDetailPage() {
  const { rfcId } = useParams<{ rfcId: string }>()
  const wsSlug = useWorkspaceSlug()
  const toast = useToast()
  const confirm = useConfirmDialog()
  const { t } = useT()

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
      setError(err instanceof Error ? err.message : activeTranslator().t('siteKnowledge.rfc.loadFailed'))
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
        toast.success(
          t('siteKnowledge.rfc.transitionDone', {
            transition: formatTrigger(trigger),
            state: getStatusMeta('rfc', rfcState(updated)).label,
          }),
        )
      } catch (err) {
        toast.error(apiErrorMessage(err, t('siteKnowledge.rfc.fireFailed', { trigger })))
      } finally {
        setTransitioning(null)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast and t are stable for the session
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
      toast.success(t('siteKnowledge.rfc.copied', { what }))
    } catch {
      toast.error(t('siteKnowledge.shared.copyFailed'))
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
    void copy(lines.join('\n'), t('siteKnowledge.rfc.whatMarkdown'))
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
        <ErrorState title={t('siteKnowledge.rfc.loadFailedTitle')} description={error || t('siteKnowledge.shared.notFoundHint')} onRetry={fetchRfc} />
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
  const importanceLabel = t('siteKnowledge.rfc.importanceLabel', { label: getStatusMeta('importance', rfc.importance).label })

  // Closing a proposal is the one destructive gesture here: red glass, and it asks first (`request`).
  const transitionButton = (tr: RfcAvailableTransition, variant: 'primary' | 'secondary') => {
    const Icon = triggerIcon(tr.trigger)
    const busy = transitioning === tr.trigger
    return (
      <Button
        key={tr.trigger}
        size="sm"
        variant={isDestructiveTrigger(tr.trigger) ? 'danger' : variant}
        onClick={() => request(tr)}
        loading={busy}
        disabled={!!transitioning && !busy}
        className="gap-1.5"
      >
        {!busy && <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
        {formatTrigger(tr.trigger)}
        <span className="text-xs font-normal opacity-70">{t('siteKnowledge.rfc.targetState', { state: getStatusMeta('rfc', tr.target_state).label })}</span>
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
          <RelativeTime key="c" date={rfc.created_at} prefix={`${t('siteKnowledge.rfc.createdPrefix')} `} />,
          rfc.updated_at ? <RelativeTime key="u" date={rfc.updated_at} prefix={`${t('siteKnowledge.rfc.updatedPrefix')} `} /> : null,
          rfc.sections.length === 1
            ? t('siteKnowledge.rfc.section.one', { n: 1 })
            : t('siteKnowledge.rfc.section.other', { n: rfc.sections.length }),
        ]}
        actions={primary ? transitionButton(primary, 'primary') : undefined}
        overflowActions={[
          { label: t('siteKnowledge.rfc.copyMarkdown'), icon: Copy, onClick: copyMarkdown },
          { label: t('siteKnowledge.shared.copyId'), icon: Hash, onClick: () => copy(rfc.id, t('siteKnowledge.rfc.whatId')) },
        ]}
      />

      {/* ── Lifecycle ─────────────────────────────────────────────────── */}
      <Section title={t('siteKnowledge.rfc.lifecycle')} description={t('siteKnowledge.rfc.lifecycleDescription')}>
        <div className="space-y-3">
          <ProposalLifecycleLine status={state} />
          <Explainer>{t('siteKnowledge.rfc.lifecycleExplain')}</Explainer>
          {transitions.length === 0 ? (
            state !== 'implemented' && state !== 'rejected' && state !== 'superseded' ? (
              <p className="text-sm text-gray-400">{t('siteKnowledge.rfc.noStep')}</p>
            ) : null
          ) : others.length > 0 ? (
            <div className="flex flex-wrap gap-2">{others.map((t) => transitionButton(t, 'secondary'))}</div>
          ) : null}
        </div>
      </Section>

      {/* ── Content ───────────────────────────────────────────────────── */}
      {navSections.length > 0 && <SectionNav sections={navSections} activeSection={activeSection} />}
      {isSingleContent ? (
        <Section title={t('siteKnowledge.rfc.content')}>
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
      <Section title={t('siteKnowledge.rfc.details')}>
        <Facts
          items={[
            { label: t('siteKnowledge.rfc.state'), value: <StatusText kind="rfc" status={state} /> },
            { label: t('siteKnowledge.rfc.importance'), value: <StatusText kind="importance" status={rfc.importance} /> },
            { label: t('siteKnowledge.rfc.created'), value: formatAbsolute(rfc.created_at) },
            { label: t('siteKnowledge.rfc.updated'), value: rfc.updated_at ? formatAbsolute(rfc.updated_at) : null },
            { label: t('siteKnowledge.rfc.author'), value: rfc.created_by },
            { label: t('siteKnowledge.rfc.sections'), value: String(rfc.sections.length) },
            {
              label: t('siteKnowledge.rfc.protocolRun'),
              value: rfc.protocol_run_id ? (
                <Link to={workspacePath(wsSlug, '/protocols')} className={`font-mono text-xs ${inlineLink}`}>
                  {rfc.protocol_run_id.slice(0, 8)} →
                </Link>
              ) : (
                <ToneText tone="warning" icon label={t('siteKnowledge.rfc.notLinked')} />
              ),
            },
            { label: t('siteKnowledge.rfc.idLabel'), value: <span className="font-mono text-xs break-all">{rfc.id}</span> },
          ]}
        />
        {visibleTags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label={t('siteKnowledge.rfc.tagsAria')}>
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
