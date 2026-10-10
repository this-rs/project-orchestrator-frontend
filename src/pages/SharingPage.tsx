import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, XCircle } from 'lucide-react'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  Facts,
  Input,
  PageContainer,
  PageHeader,
  RelativeTime,
  Section,
  Select,
  SkeletonCard,
  StatusText,
  Switch,
  guessTone,
  humanizeStatus,
  type StatusTone,
  ToneText,
} from '@/components/ui'
import { Notice, SettingRow, SettingsList } from '@/components/settings/SettingRow'
import { useT } from '@/i18n'
import { VaultPanel } from './VaultPage'
import { sharingApi, workspacesApi } from '@/services'
import { useConfirmDialog, useToast, useWorkspaceSlug } from '@/hooks'
import type {
  SharingPolicy,
  SharingEvent,
  SignedTombstone,
  SharingMode,
  SharingPreviewItem,
  SharingSuggestionItem,
  ConsentStats,
} from '@/types'
import { NOMENCLATURE } from '@/constants/nomenclature'

// ============================================================================
// LABELS
// ============================================================================

const CONSENT_TONE: Record<string, StatusTone> = {
  explicit_allow: 'success',
  explicit_deny: 'danger',
  policy_auto: 'info',
  not_set: 'neutral',
}

function ConsentText({ consent }: { consent: string }) {
  const { t } = useT()
  const known = consent in CONSENT_TONE
  const label = known ? t(`sharing.consent.${consent as 'explicit_allow' | 'explicit_deny' | 'policy_auto' | 'not_set'}`) : humanizeStatus(consent)
  return <ToneText tone={known ? CONSENT_TONE[consent] : guessTone(consent)} label={label} />
}

const OVERRIDE_TONE: Record<string, StatusTone> = { never: 'danger', auto: 'success', review: 'warning' }

const MODES: readonly SharingMode[] = ['manual', 'suggest', 'auto']

const shortId = (id: string) => id.slice(0, 8)

// ============================================================================
// MAIN PAGE
// ============================================================================

export function SharingPage() {
  const { t } = useT()
  const wsSlug = useWorkspaceSlug()
  const [projects, setProjects] = useState<{ slug: string; name: string }[]>([])
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [selectedProject, setSelectedProject] = useState<string>('')
  /** Bumped when the policy changes so preview / suggestions / report refetch. */
  const [policyVersion, setPolicyVersion] = useState(0)

  useEffect(() => {
    async function loadProjects() {
      try {
        const wsProjects = await workspacesApi.listProjects(wsSlug)
        const mapped = wsProjects.map((p) => ({ slug: p.slug, name: p.name }))
        setProjects(mapped)
        if (!selectedProject && mapped.length > 0) setSelectedProject(mapped[0].slug)
      } catch {
        // No projects available
      } finally {
        setProjectsLoaded(true)
      }
    }
    loadProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsSlug])

  const projectSlug = selectedProject
  const projectName = projects.find((p) => p.slug === selectedProject)?.name

  return (
    <PageContainer width="narrow" className="space-y-6">
      <PageHeader
        title={NOMENCLATURE.sharing.plural}
        intro="sharing"
        description={t('sharing.description')}
      />

      {/* Secrets vault — instance-wide, so above the per-project scope below. */}
      <Section
        title={t('sharing.vaultTitle')}
        description={t('sharing.vaultDescription')}
      >
        <VaultPanel />
      </Section>

      <h2 className="pt-2 text-sm font-semibold text-gray-200">{t('sharing.noteSharing')}</h2>

      {!projectsLoaded ? (
        <SkeletonCard lines={4} />
      ) : projects.length === 0 ? (
        <EmptyState title={t('sharing.noProjectTitle')} description={t('sharing.noProjectDescription')} />
      ) : (
        <>
          {/* Scope: the whole page is configured per project (a scope selector, not a header action — §6). */}
          <SettingsList>
            <SettingRow
              label={t('sharing.project')}
              description={t('sharing.projectDescription')}
              control={
                projects.length > 1 ? (
                  <Select
                    options={projects.map((p) => ({ value: p.slug, label: p.name }))}
                    value={selectedProject}
                    onChange={setSelectedProject}
                    className="w-44"
                  />
                ) : (
                  <span className="text-sm text-gray-300">{projectName}</span>
                )
              }
            />
          </SettingsList>

          {!projectSlug ? (
            <Notice tone="warning">{t('sharing.chooseProject')}</Notice>
          ) : (
            <>
              <PolicySection slug={projectSlug} onChanged={() => setPolicyVersion((v) => v + 1)} />
              <SuggestSection slug={projectSlug} version={policyVersion} />
              <LastReportSection slug={projectSlug} version={policyVersion} />
              <PreviewSection slug={projectSlug} version={policyVersion} />
              <AuditTrailSection slug={projectSlug} />
              <TombstonesSection slug={projectSlug} />
            </>
          )}
        </>
      )}
    </PageContainer>
  )
}

// ============================================================================
// POLICY
// ============================================================================

function PolicySection({ slug, onChanged }: { slug: string; onChanged: () => void }) {
  const { t } = useT()
  const [policy, setPolicy] = useState<SharingPolicy | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<SharingMode>('manual')
  const [threshold, setThreshold] = useState('0.5')
  const toast = useToast()
  const confirmDialog = useConfirmDialog()

  const fetchStatus = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    try {
      const status = await sharingApi.getStatus(slug)
      setPolicy(status.policy)
      setEnabled(status.enabled)
      setMode(status.policy.mode)
      setThreshold(String(status.policy.min_shareability_score))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('sharing.policy.loadFailed'))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleToggle = () => {
    const enabling = !enabled
    confirmDialog.open({
      title: enabling ? t('sharing.policy.enableTitle') : t('sharing.policy.disableTitle'),
      description: enabling
        ? t('sharing.policy.enableDescription')
        : t('sharing.policy.disableDescription'),
      variant: enabling ? 'info' : 'warning',
      confirmLabel: enabling ? t('sharing.policy.enable') : t('sharing.policy.disable'),
      onConfirm: async () => {
        try {
          const res = enabling ? await sharingApi.enable(slug) : await sharingApi.disable(slug)
          setEnabled(res.enabled)
          setPolicy(res.policy)
          toast.success(res.enabled ? t('sharing.policy.enabledToast') : t('sharing.policy.disabledToast'))
          onChanged()
        } catch (err) {
          toast.error(err instanceof Error ? err.message : enabling ? t('sharing.policy.enableFailed') : t('sharing.policy.disableFailed'))
        }
      },
    })
  }

  const handleSavePolicy = async () => {
    const score = parseFloat(threshold)
    if (isNaN(score) || score < 0 || score > 1) {
      toast.error(t('sharing.policy.thresholdRange'))
      return
    }
    setSaving(true)
    try {
      const updated = await sharingApi.setPolicy(slug, { mode, min_shareability_score: score })
      setPolicy(updated)
      toast.success(t('sharing.policy.updated'))
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('sharing.policy.updateFailed'))
    } finally {
      setSaving(false)
    }
  }

  const dirty = !!policy && (mode !== policy.mode || threshold !== String(policy.min_shareability_score))
  const overrides = Object.entries(policy?.type_overrides ?? {})

  return (
    <Section
      title={t('sharing.policy.title')}
      action={
        policy ? (
          <Button size="sm" onClick={handleSavePolicy} loading={saving} disabled={!dirty}>
            {t('sharing.policy.save')}
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <SkeletonCard lines={3} />
      ) : (
        <SettingsList>
          <SettingRow
            label={t('sharing.policy.sharing')}
            description={enabled ? t('sharing.policy.sharingEnabled') : t('sharing.policy.sharingDisabled')}
            control={<Switch checked={enabled} onChange={handleToggle} ariaLabel={t('sharing.policy.sharing')} />}
          />
          {policy && (
            <>
              <SettingRow
                label={t('sharing.policy.mode')}
                description={t(`sharing.modeHelp.${mode}`)}
                control={
                  <Select options={MODES.map((m) => ({ value: m, label: t(`sharing.modes.${m}`) }))} value={mode} onChange={(v) => setMode(v as SharingMode)} className="w-32" />
                }
              />
              <SettingRow
                label={t('sharing.policy.minScore')}
                description={t('sharing.policy.minScoreDescription')}
                control={
                  <div className="w-24">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={1}
                      step={0.05}
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value)}
                      aria-label={t('sharing.policy.minScore')}
                      className="h-9 py-1.5 text-right tabular-nums"
                    />
                  </div>
                }
              />
              <SettingRow
                label={t('sharing.policy.l3')}
                description={t('sharing.policy.l3Description')}
                control={<StatusText status={policy.l3_scan_enabled ? 'enabled' : 'disabled'} label={policy.l3_scan_enabled ? t('sharing.policy.on') : t('sharing.policy.off')} />}
              />
              <SettingRow
                label={t('sharing.policy.typeOverrides')}
                description={
                  overrides.length > 0
                    ? t('sharing.policy.overridesDescription')
                    : t('sharing.policy.noOverridesDescription')
                }
                control={<span className="text-sm tabular-nums text-gray-400">{overrides.length}</span>}
              >
                {overrides.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {overrides.map(([type, action]) => (
                      <span key={type} className="inline-flex items-center gap-1 text-gray-400">
                        {type}
                        <ToneText tone={OVERRIDE_TONE[action] ?? 'neutral'} label={action} />
                      </span>
                    ))}
                  </div>
                )}
              </SettingRow>
            </>
          )}
        </SettingsList>
      )}
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </Section>
  )
}

// ============================================================================
// SUGGESTIONS (notes recommended for sharing)
// ============================================================================

function SuggestSection({ slug, version }: { slug: string; version: number }) {
  const { t } = useT()
  const [suggestions, setSuggestions] = useState<SharingSuggestionItem[]>([])
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  const fetchSuggestions = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    try {
      setSuggestions(await sharingApi.suggest(slug))
    } catch {
      setSuggestions([])
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version triggers a refetch
  }, [slug, version])

  useEffect(() => {
    fetchSuggestions()
  }, [fetchSuggestions])

  const handleConsent = async (noteId: string, consent: 'explicit_allow' | 'explicit_deny') => {
    try {
      await sharingApi.setConsent(noteId, { consent })
      toast.success(consent === 'explicit_allow' ? t('sharing.suggest.consentAllowed') : t('sharing.suggest.consentDenied'))
      setSuggestions((prev) => prev.filter((s) => s.note_id !== noteId))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('sharing.suggest.consentFailed'))
    }
  }

  return (
    <Section
      title={t('sharing.suggest.title')}
      count={suggestions.length || undefined}
      description={t('sharing.suggest.description')}
      collapsible
      defaultOpen={false}
    >
      {loading ? (
        <EntityListSkeleton rows={3} />
      ) : suggestions.length === 0 ? (
        <EmptyState size="sm" title={t('sharing.suggest.emptyTitle')} description={t('sharing.suggest.emptyDescription')} />
      ) : (
        <EntityList>
          {suggestions.map((s) => (
            <EntityRow
              key={s.note_id}
              title={s.content_preview || t('sharing.suggest.noteFallback', { id: shortId(s.note_id) })}
              trailing={<span title={t('sharing.suggest.scoreTitle')}>{s.shareability_score.toFixed(2)}</span>}
              meta={[s.note_type, <span key="id" className="font-mono" title={s.note_id}>{shortId(s.note_id)}</span>, s.reason]}
            >
              {/* Allow / Deny are the row's purpose (a review queue), so they stay visible — flat: one pair per row. */}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" flat onClick={() => handleConsent(s.note_id, 'explicit_allow')}>
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  {t('sharing.suggest.allow')}
                </Button>
                <Button size="sm" variant="secondary" flat onClick={() => handleConsent(s.note_id, 'explicit_deny')}>
                  <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  {t('sharing.suggest.deny')}
                </Button>
              </div>
            </EntityRow>
          ))}
        </EntityList>
      )}
    </Section>
  )
}

// ============================================================================
// PRIVACY REPORT
// ============================================================================

function LastReportSection({ slug, version }: { slug: string; version: number }) {
  const { t } = useT()
  const [stats, setStats] = useState<ConsentStats | null>(null)
  const [generatedAt, setGeneratedAt] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchReport = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    try {
      const report = await sharingApi.getLastReport(slug)
      setStats(report.stats)
      setGeneratedAt(report.generated_at)
    } catch {
      setStats(null)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version triggers a refetch
  }, [slug, version])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  return (
    <Section
      title={t('sharing.report.title')}
      description={generatedAt && stats ? <RelativeTime date={generatedAt} prefix={`${t('sharing.report.generated')} `} /> : undefined}
    >
      {loading ? (
        <SkeletonCard lines={2} />
      ) : !stats ? (
        <EmptyState size="sm" title={t('sharing.report.emptyTitle')} description={t('sharing.report.emptyDescription')} />
      ) : (
        <Facts
          columns={2}
          items={[
            { label: t('sharing.report.allowed'), value: <Count n={stats.consent_allowed} hint={t('sharing.report.hintAllowed')} /> },
            { label: t('sharing.report.denied'), value: <Count n={stats.consent_denied} hint={t('sharing.report.hintDenied')} warn /> },
            { label: t('sharing.report.pending'), value: <Count n={stats.consent_pending} hint={t('sharing.report.hintPending')} warn /> },
            { label: t('sharing.report.denialReasons'), value: <Count n={stats.denied_reasons.length} hint={t('sharing.report.hintReasons')} /> },
          ]}
        />
      )}
    </Section>
  )
}

function Count({ n, hint, warn }: { n: number; hint: string; warn?: boolean }) {
  return (
    <span>
      <span className={`tabular-nums ${warn && n > 0 ? 'text-amber-400' : ''}`}>{n}</span>
      <span className="text-gray-500"> {hint}</span>
    </span>
  )
}

// ============================================================================
// PREVIEW (what would be shared)
// ============================================================================

function PreviewSection({ slug, version }: { slug: string; version: number }) {
  const { t } = useT()
  const [items, setItems] = useState<SharingPreviewItem[]>([])
  const [loading, setLoading] = useState(false)

  const fetchPreview = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    try {
      setItems(await sharingApi.preview(slug))
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version triggers a refetch
  }, [slug, version])

  useEffect(() => {
    fetchPreview()
  }, [fetchPreview])

  const allowed = items.filter((i) => i.decision === 'allow').length

  return (
    <Section
      title={t('sharing.preview.title')}
      count={items.length || undefined}
      description={
        items.length > 0
          ? t('sharing.preview.summary', { allowed, blocked: items.length - allowed })
          : t('sharing.preview.description')
      }
      collapsible
      defaultOpen={false}
    >
      {loading ? (
        <EntityListSkeleton rows={3} />
      ) : items.length === 0 ? (
        <EmptyState size="sm" title={t('sharing.preview.emptyTitle')} description={t('sharing.preview.emptyDescription')} />
      ) : (
        <EntityList>
          {items.map((item) => {
            const allow = item.decision === 'allow'
            const decision = allow ? t('sharing.preview.wouldShare') : t('sharing.preview.blocked')
            return (
              <EntityRow
                key={item.note_id}
                title={item.content_preview || t('sharing.suggest.noteFallback', { id: shortId(item.note_id) })}
                trailing={<span title={t('sharing.suggest.scoreTitle')}>{item.shareability_score.toFixed(2)}</span>}
                muted={!allow}
                meta={[
                  <ToneText key="d" tone={allow ? 'success' : 'danger'} label={decision} />,
                  <ConsentText key="c" consent={item.consent} />,
                  item.note_type,
                  <span key="id" className="font-mono" title={item.note_id}>{shortId(item.note_id)}</span>,
                ]}
              />
            )
          })}
        </EntityList>
      )}
    </Section>
  )
}

// ============================================================================
// AUDIT TRAIL
// ============================================================================

const PAGE = 20

function AuditTrailSection({ slug }: { slug: string }) {
  const { t } = useT()
  const [events, setEvents] = useState<SharingEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [offset, setOffset] = useState(0)

  const fetchEvents = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    try {
      setEvents(await sharingApi.getHistory(slug, { limit: PAGE, offset }))
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [slug, offset])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  return (
    <Section
      title={t('sharing.audit.title')}
      description={t('sharing.audit.description')}
      collapsible
      defaultOpen={false}
    >
      {loading && events.length === 0 ? (
        <EntityListSkeleton rows={3} />
      ) : events.length === 0 && offset === 0 ? (
        <EmptyState size="sm" title={t('sharing.audit.empty')} />
      ) : (
        <div className="space-y-2">
          <EntityList>
            {events.map((ev) => {
              const retracted = ev.action === 'retracted'
              const action = humanizeStatus(ev.action)
              return (
                <EntityRow
                  key={ev.id}
                  title={action}
                  trailing={<RelativeTime date={ev.timestamp} />}
                  description={ev.reason}
                  meta={[
                    <ToneText key="a" tone={retracted ? 'danger' : 'info'} label={action} />,
                    <ConsentText key="c" consent={ev.consent} />,
                    ev.artifact_type,
                    <span key="src" className="font-mono truncate max-w-[12rem]" title={ev.source_did}>
                      {ev.source_did}
                    </span>,
                  ]}
                />
              )
            })}
          </EntityList>
          {/* Offset-based history without a total: prev / next only (the Pagination primitive needs a page count). */}
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOffset(Math.max(0, offset - PAGE))} disabled={offset === 0}>
              <ChevronLeft className="w-4 h-4 mr-1" aria-hidden="true" />
              {t('sharing.audit.previous')}
            </Button>
            <span className="text-[11px] tabular-nums text-gray-500">
              {events.length > 0 ? `${offset + 1}–${offset + events.length}` : t('sharing.audit.noMore')}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setOffset(offset + PAGE)} disabled={events.length < PAGE}>
              {t('sharing.audit.next')}
              <ChevronRight className="w-4 h-4 ml-1" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </Section>
  )
}

// ============================================================================
// TOMBSTONES & RETRACTION
// ============================================================================

function TombstonesSection({ slug }: { slug: string }) {
  const { t } = useT()
  const [tombstones, setTombstones] = useState<SignedTombstone[]>([])
  const [loading, setLoading] = useState(false)
  const [retractReason, setRetractReason] = useState('')
  const [retractNoteId, setRetractNoteId] = useState('')
  const [retracting, setRetracting] = useState(false)
  const toast = useToast()
  const confirmDialog = useConfirmDialog()

  const fetchTombstones = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    try {
      setTombstones(await sharingApi.listTombstones(slug))
    } catch {
      setTombstones([])
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    fetchTombstones()
  }, [fetchTombstones])

  const handleRetract = () => {
    if (!retractNoteId.trim()) return
    confirmDialog.open({
      title: t('sharing.retraction.dialogTitle'),
      description: t('sharing.retraction.dialogDescription', { id: retractNoteId.trim() }),
      variant: 'danger',
      confirmLabel: t('sharing.retraction.retract'),
      onConfirm: async () => {
        setRetracting(true)
        try {
          await sharingApi.retract(slug, { note_id: retractNoteId.trim(), reason: retractReason.trim() || undefined })
          toast.success(t('sharing.retraction.retracted'))
          setRetractNoteId('')
          setRetractReason('')
          fetchTombstones()
        } catch (err) {
          toast.error(err instanceof Error ? err.message : t('sharing.retraction.failed'))
        } finally {
          setRetracting(false)
        }
      },
    })
  }

  return (
    <Section
      title={t('sharing.retraction.title')}
      count={tombstones.length || undefined}
      description={t('sharing.retraction.description')}
      collapsible
      defaultOpen={false}
    >
      <div className="space-y-3">
        <SettingsList>
          <SettingRow label={t('sharing.retraction.rowLabel')} description={t('sharing.retraction.rowDescription')}>
            <div className="flex flex-wrap gap-2">
              <div className="flex-[1_1_12rem] min-w-0">
                <Input
                  placeholder={t('sharing.retraction.noteUuid')}
                  aria-label={t('sharing.retraction.noteUuid')}
                  value={retractNoteId}
                  onChange={(e) => setRetractNoteId(e.target.value)}
                  className="h-9 py-1.5 font-mono"
                />
              </div>
              <div className="flex-[1_1_12rem] min-w-0">
                <Input
                  placeholder={t('sharing.retraction.reason')}
                  aria-label={t('sharing.retraction.reasonAria')}
                  value={retractReason}
                  onChange={(e) => setRetractReason(e.target.value)}
                  className="h-9 py-1.5"
                />
              </div>
              <Button variant="danger" size="sm" onClick={handleRetract} loading={retracting} disabled={!retractNoteId.trim()}>
                {t('sharing.retraction.retract')}
              </Button>
            </div>
          </SettingRow>
        </SettingsList>

        {loading ? (
          <EntityListSkeleton rows={2} />
        ) : tombstones.length === 0 ? (
          <EmptyState size="sm" title={t('sharing.retraction.noTombstoneTitle')} description={t('sharing.retraction.noTombstoneDescription')} />
        ) : (
          <EntityList aria-label={t('sharing.retraction.tombstones')}>
            {tombstones.map((tomb) => (
              <EntityRow
                key={tomb.content_hash}
                title={<span className="font-mono text-xs break-all">{tomb.content_hash}</span>}
                ariaLabel={t('sharing.retraction.tombstoneAria', { hash: tomb.content_hash })}
                trailing={<RelativeTime date={tomb.issued_at} />}
                description={tomb.reason}
                meta={[
                  <span key="iss" className="font-mono truncate max-w-[14rem]" title={tomb.issuer_did}>
                    {tomb.issuer_did}
                  </span>,
                ]}
              />
            ))}
          </EntityList>
        )}
      </div>
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </Section>
  )
}
