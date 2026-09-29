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

const CONSENT: Record<string, { label: string; tone: StatusTone }> = {
  explicit_allow: { label: 'Allowed', tone: 'success' },
  explicit_deny: { label: 'Denied', tone: 'danger' },
  policy_auto: { label: 'Auto (policy)', tone: 'info' },
  not_set: { label: 'Not set', tone: 'neutral' },
}

function ConsentText({ consent }: { consent: string }) {
  const c = CONSENT[consent] ?? { label: humanizeStatus(consent), tone: guessTone(consent) }
  return <ToneText tone={c.tone} label={c.label} />
}

const OVERRIDE_TONE: Record<string, StatusTone> = { never: 'danger', auto: 'success', review: 'warning' }

const MODE_HELP: Record<SharingMode, string> = {
  manual: 'Nothing leaves without your explicit approval, note by note.',
  suggest: 'Notes above the threshold are suggested to you; you approve each one.',
  auto: 'Notes above the threshold are shared automatically.',
}

const modeOptions = [
  { value: 'manual', label: 'Manual' },
  { value: 'suggest', label: 'Suggest' },
  { value: 'auto', label: 'Auto' },
]

const shortId = (id: string) => id.slice(0, 8)

// ============================================================================
// MAIN PAGE
// ============================================================================

export function SharingPage() {
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
        description="Decide which notes of a project may be shared with other instances, see what would leave, and retract a share with a signed tombstone."
      />

      {!projectsLoaded ? (
        <SkeletonCard lines={4} />
      ) : projects.length === 0 ? (
        <EmptyState title="No project in this workspace" description="Add a project to the workspace to configure sharing." />
      ) : (
        <>
          {/* Scope: the whole page is configured per project (a scope selector, not a header action — §6). */}
          <SettingsList>
            <SettingRow
              label="Project"
              description="Sharing is configured per project."
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
            <Notice tone="warning">Choose a project to configure sharing.</Notice>
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
      toast.error(err instanceof Error ? err.message : 'Failed to load sharing status')
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
      title: enabling ? 'Enable sharing' : 'Disable sharing',
      description: enabling
        ? 'Notes may be shared according to the policy below. You can disable this at any time.'
        : 'No more notes from this project will be shared. Existing shares are not retracted.',
      variant: enabling ? 'info' : 'warning',
      confirmLabel: enabling ? 'Enable' : 'Disable',
      onConfirm: async () => {
        try {
          const res = enabling ? await sharingApi.enable(slug) : await sharingApi.disable(slug)
          setEnabled(res.enabled)
          setPolicy(res.policy)
          toast.success(`Sharing ${res.enabled ? 'enabled' : 'disabled'}`)
          onChanged()
        } catch (err) {
          toast.error(err instanceof Error ? err.message : `Failed to ${enabling ? 'enable' : 'disable'} sharing`)
        }
      },
    })
  }

  const handleSavePolicy = async () => {
    const score = parseFloat(threshold)
    if (isNaN(score) || score < 0 || score > 1) {
      toast.error('Threshold must be between 0.0 and 1.0')
      return
    }
    setSaving(true)
    try {
      const updated = await sharingApi.setPolicy(slug, { mode, min_shareability_score: score })
      setPolicy(updated)
      toast.success('Policy updated')
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update policy')
    } finally {
      setSaving(false)
    }
  }

  const dirty = !!policy && (mode !== policy.mode || threshold !== String(policy.min_shareability_score))
  const overrides = Object.entries(policy?.type_overrides ?? {})

  return (
    <Section
      title="Policy"
      action={
        policy ? (
          <Button size="sm" onClick={handleSavePolicy} loading={saving} disabled={!dirty}>
            Save
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <SkeletonCard lines={3} />
      ) : (
        <SettingsList>
          <SettingRow
            label="Sharing"
            description={
              enabled
                ? 'Enabled: notes may be shared according to the policy below.'
                : 'Disabled: no note leaves this project.'
            }
            control={<Switch checked={enabled} onChange={handleToggle} ariaLabel="Sharing" />}
          />
          {policy && (
            <>
              <SettingRow
                label="Mode"
                description={MODE_HELP[mode]}
                control={
                  <Select options={modeOptions} value={mode} onChange={(v) => setMode(v as SharingMode)} className="w-32" />
                }
              />
              <SettingRow
                label="Min score"
                description="Shareability score (0 to 1) below which a note is never suggested."
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
                      aria-label="Min score"
                      className="h-9 py-1.5 text-right tabular-nums"
                    />
                  </div>
                }
              />
              <SettingRow
                label="L3 scan"
                description="Deep content check before anything is shared."
                control={<StatusText status={policy.l3_scan_enabled ? 'enabled' : 'disabled'} label={policy.l3_scan_enabled ? 'On' : 'Off'} />}
              />
              <SettingRow
                label="Type overrides"
                description={
                  overrides.length > 0
                    ? 'Forced rules for some note types, taking precedence over the mode.'
                    : 'No per-type rule: the mode applies to every note.'
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
      toast.success(`Consent set to ${consent === 'explicit_allow' ? 'Allow' : 'Deny'}`)
      setSuggestions((prev) => prev.filter((s) => s.note_id !== noteId))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set consent')
    }
  }

  return (
    <Section
      title="Suggestions"
      count={suggestions.length || undefined}
      description="Notes above the threshold with no consent yet: allow or deny their sharing."
      collapsible
      defaultOpen={false}
    >
      {loading ? (
        <EntityListSkeleton rows={3} />
      ) : suggestions.length === 0 ? (
        <EmptyState size="sm" title="Nothing to review" description="Every eligible note already has a consent, or none scores above the threshold." />
      ) : (
        <EntityList>
          {suggestions.map((s) => (
            <EntityRow
              key={s.note_id}
              title={s.content_preview || `Note ${shortId(s.note_id)}`}
              trailing={<span title="Shareability score">{s.shareability_score.toFixed(2)}</span>}
              meta={[s.note_type, <span key="id" className="font-mono" title={s.note_id}>{shortId(s.note_id)}</span>, s.reason]}
            >
              {/* Allow / Deny are the row's purpose (a review queue), so they stay visible. */}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => handleConsent(s.note_id, 'explicit_allow')}>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-400" aria-hidden="true" />
                  Allow
                </Button>
                <Button size="sm" variant="secondary" onClick={() => handleConsent(s.note_id, 'explicit_deny')}>
                  <XCircle className="w-3.5 h-3.5 mr-1.5 text-red-400" aria-hidden="true" />
                  Deny
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
      title="Privacy report"
      description={generatedAt && stats ? <RelativeTime date={generatedAt} prefix="generated " /> : undefined}
    >
      {loading ? (
        <SkeletonCard lines={2} />
      ) : !stats ? (
        <EmptyState size="sm" title="No report yet" description="Enable sharing and set a consent on some notes to get one." />
      ) : (
        <Facts
          columns={2}
          items={[
            { label: 'Allowed', value: <Count n={stats.consent_allowed} hint="notes allowed" /> },
            { label: 'Denied', value: <Count n={stats.consent_denied} hint="notes denied" warn /> },
            { label: 'Pending', value: <Count n={stats.consent_pending} hint="awaiting a decision" warn /> },
            { label: 'Denial reasons', value: <Count n={stats.denied_reasons.length} hint="distinct reasons" /> },
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
      title="Preview"
      count={items.length || undefined}
      description={
        items.length > 0
          ? `With the current policy: ${allowed} would be shared, ${items.length - allowed} blocked.`
          : 'What would be shared with the current policy.'
      }
      collapsible
      defaultOpen={false}
    >
      {loading ? (
        <EntityListSkeleton rows={3} />
      ) : items.length === 0 ? (
        <EmptyState size="sm" title="Nothing to preview" description="The project has no notes, or sharing is disabled." />
      ) : (
        <EntityList>
          {items.map((item) => {
            const allow = item.decision === 'allow'
            const decision = allow ? 'Would be shared' : 'Blocked'
            return (
              <EntityRow
                key={item.note_id}
                title={item.content_preview || `Note ${shortId(item.note_id)}`}
                trailing={<span title="Shareability score">{item.shareability_score.toFixed(2)}</span>}
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
      title="Audit trail"
      description="Every share or retraction, with the consent that applied."
      collapsible
      defaultOpen={false}
    >
      {loading && events.length === 0 ? (
        <EntityListSkeleton rows={3} />
      ) : events.length === 0 && offset === 0 ? (
        <EmptyState size="sm" title="No sharing event yet" />
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
              Previous
            </Button>
            <span className="text-[11px] tabular-nums text-gray-500">
              {events.length > 0 ? `${offset + 1}–${offset + events.length}` : 'No more events'}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setOffset(offset + PAGE)} disabled={events.length < PAGE}>
              Next
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
      title: 'Retract shared note',
      description: `Creates a signed tombstone for note “${retractNoteId.trim()}” and sets its consent to Denied. This cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Retract',
      onConfirm: async () => {
        setRetracting(true)
        try {
          await sharingApi.retract(slug, { note_id: retractNoteId.trim(), reason: retractReason.trim() || undefined })
          toast.success('Note retracted')
          setRetractNoteId('')
          setRetractReason('')
          fetchTombstones()
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to retract')
        } finally {
          setRetracting(false)
        }
      },
    })
  }

  return (
    <Section
      title="Retraction"
      count={tombstones.length || undefined}
      description="Take back a note that was already shared: a signed tombstone asks the other instances to delete it."
      collapsible
      defaultOpen={false}
    >
      <div className="space-y-3">
        <SettingsList>
          <SettingRow label="Retract a note" description="Irreversible — the note can no longer be shared.">
            <div className="flex flex-wrap gap-2">
              <div className="flex-[1_1_12rem] min-w-0">
                <Input
                  placeholder="Note UUID"
                  aria-label="Note UUID"
                  value={retractNoteId}
                  onChange={(e) => setRetractNoteId(e.target.value)}
                  className="h-9 py-1.5 font-mono"
                />
              </div>
              <div className="flex-[1_1_12rem] min-w-0">
                <Input
                  placeholder="Reason (optional)"
                  aria-label="Reason"
                  value={retractReason}
                  onChange={(e) => setRetractReason(e.target.value)}
                  className="h-9 py-1.5"
                />
              </div>
              <Button variant="danger" size="sm" onClick={handleRetract} loading={retracting} disabled={!retractNoteId.trim()}>
                Retract
              </Button>
            </div>
          </SettingRow>
        </SettingsList>

        {loading ? (
          <EntityListSkeleton rows={2} />
        ) : tombstones.length === 0 ? (
          <EmptyState size="sm" title="No tombstone" description="Retracted notes will appear here." />
        ) : (
          <EntityList aria-label="Tombstones">
            {tombstones.map((t) => (
              <EntityRow
                key={t.content_hash}
                title={<span className="font-mono text-xs break-all">{t.content_hash}</span>}
                ariaLabel={`Tombstone ${t.content_hash}`}
                trailing={<RelativeTime date={t.issued_at} />}
                description={t.reason}
                meta={[
                  <span key="iss" className="font-mono truncate max-w-[14rem]" title={t.issuer_did}>
                    {t.issuer_did}
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
