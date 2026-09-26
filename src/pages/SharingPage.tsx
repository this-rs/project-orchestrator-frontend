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
  StatusDot,
  StatusText,
  Switch,
  TONE_CLASSES,
  guessTone,
  humanizeStatus,
  type StatusTone,
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

// ============================================================================
// LABELS
// ============================================================================

const CONSENT: Record<string, { label: string; tone: StatusTone }> = {
  explicit_allow: { label: 'Allowed', tone: 'success' },
  explicit_deny: { label: 'Denied', tone: 'danger' },
  policy_auto: { label: 'Auto (policy)', tone: 'info' },
  not_set: { label: 'Not set', tone: 'neutral' },
}

/** Dot + label in an explicit tone (consent / override values have their own semantics). */
function ToneText({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${TONE_CLASSES[tone].text}`}>
      <StatusDot tone={tone} />
      {label}
    </span>
  )
}

function ConsentText({ consent }: { consent: string }) {
  const c = CONSENT[consent] ?? { label: humanizeStatus(consent), tone: guessTone(consent) }
  return <ToneText tone={c.tone} label={c.label} />
}

const OVERRIDE_TONE: Record<string, StatusTone> = { never: 'danger', auto: 'success', review: 'warning' }

const MODE_HELP: Record<SharingMode, string> = {
  manual: 'Rien ne part sans votre accord explicite, note par note.',
  suggest: 'Les notes au-dessus du seuil vous sont proposées ; vous validez.',
  auto: 'Les notes au-dessus du seuil sont partagées automatiquement.',
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
        title="Sharing & Privacy"
        description="Décide quelles notes de ce projet peuvent être partagées avec d'autres instances, montre ce qui partirait, et permet de retirer un partage (tombstone signée)."
        meta={[projectName ? <span key="p">Project {projectName}</span> : null]}
        actions={
          projects.length > 1 ? (
            <Select
              options={projects.map((p) => ({ value: p.slug, label: p.name }))}
              value={selectedProject}
              onChange={setSelectedProject}
              className="w-44"
            />
          ) : undefined
        }
      />

      {!projectsLoaded ? (
        <SkeletonCard lines={4} />
      ) : projects.length === 0 ? (
        <EmptyState title="No project in this workspace" description="Ajoutez un projet au workspace pour configurer le partage." />
      ) : !projectSlug ? (
        <Notice tone="warning">Choisissez un projet pour configurer le partage.</Notice>
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
        ? 'Les notes pourront être partagées selon la politique ci-dessous. Désactivable à tout moment.'
        : 'Plus aucune note de ce projet ne sera partagée. Les partages existants ne sont pas retirés.',
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
                ? 'Activé : les notes peuvent être partagées selon la politique ci-dessous.'
                : 'Désactivé : aucune note ne quitte ce projet.'
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
                description="Score de partageabilité (0 à 1) en dessous duquel une note n'est jamais proposée."
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
                      className="h-9 py-1.5 text-right tabular-nums text-base md:text-sm"
                    />
                  </div>
                }
              />
              <SettingRow
                label="L3 scan"
                description="Contrôle approfondi du contenu avant tout partage."
                control={<StatusText status={policy.l3_scan_enabled ? 'enabled' : 'disabled'} label={policy.l3_scan_enabled ? 'On' : 'Off'} />}
              />
              <SettingRow
                label="Type overrides"
                description={
                  overrides.length > 0
                    ? 'Règles forcées pour certains types de notes, prioritaires sur le mode.'
                    : 'Aucune règle par type : le mode s’applique à toutes les notes.'
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
      description="Notes au-dessus du seuil sans consentement : autorisez ou refusez leur partage."
      collapsible
      defaultOpen={false}
    >
      {loading ? (
        <EntityListSkeleton rows={3} />
      ) : suggestions.length === 0 ? (
        <EmptyState size="sm" title="Nothing to review" description="Toutes les notes éligibles ont déjà un consentement, ou aucune ne dépasse le seuil." />
      ) : (
        <EntityList>
          {suggestions.map((s) => (
            <EntityRow
              key={s.note_id}
              title={s.content_preview || `Note ${shortId(s.note_id)}`}
              trailing={<span title="Shareability score">{s.shareability_score.toFixed(2)}</span>}
              meta={[s.note_type, <span key="id" className="font-mono" title={s.note_id}>{shortId(s.note_id)}</span>, s.reason]}
            >
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
      description={generatedAt && stats ? <RelativeTime date={generatedAt} prefix="Généré " /> : undefined}
    >
      {loading ? (
        <SkeletonCard lines={2} />
      ) : !stats ? (
        <p className="text-sm text-gray-500">Pas encore de rapport : activez le partage et donnez un consentement sur des notes.</p>
      ) : (
        <Facts
          columns={2}
          items={[
            { label: 'Allowed', value: <Count n={stats.consent_allowed} hint="notes autorisées" /> },
            { label: 'Denied', value: <Count n={stats.consent_denied} hint="notes refusées" warn /> },
            { label: 'Pending', value: <Count n={stats.consent_pending} hint="en attente de décision" warn /> },
            { label: 'Denial reasons', value: <Count n={stats.denied_reasons.length} hint="motifs de refus distincts" /> },
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
          ? `Avec la politique actuelle : ${allowed} partagée${allowed > 1 ? 's' : ''}, ${items.length - allowed} bloquée${items.length - allowed > 1 ? 's' : ''}.`
          : 'Ce qui serait partagé avec la politique actuelle.'
      }
      collapsible
      defaultOpen={false}
    >
      {loading ? (
        <EntityListSkeleton rows={3} />
      ) : items.length === 0 ? (
        <EmptyState size="sm" title="Nothing to preview" description="Le projet n'a pas de notes, ou le partage est désactivé." />
      ) : (
        <EntityList>
          {items.map((item) => {
            const allow = item.decision === 'allow'
            return (
              <EntityRow
                key={item.note_id}
                title={item.content_preview || `Note ${shortId(item.note_id)}`}
                leading={<StatusDot tone={allow ? 'success' : 'danger'} label={allow ? 'Would be shared' : 'Blocked'} />}
                trailing={<span title="Shareability score">{item.shareability_score.toFixed(2)}</span>}
                muted={!allow}
                meta={[
                  <StatusText key="d" status={allow ? 'success' : 'denied'} label={allow ? 'Shared' : 'Blocked'} dot={false} />,
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
      description="Historique de chaque partage ou retrait, avec le consentement appliqué."
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
            {events.map((ev) => (
              <EntityRow
                key={ev.id}
                title={`${ev.action} · ${ev.artifact_type}`}
                leading={<StatusDot tone={ev.action === 'retracted' ? 'danger' : 'info'} />}
                trailing={<RelativeTime date={ev.timestamp} />}
                description={ev.reason}
                meta={[
                  <ConsentText key="c" consent={ev.consent} />,
                  <span key="src" className="font-mono truncate max-w-[12rem]" title={ev.source_did}>
                    {ev.source_did}
                  </span>,
                ]}
              />
            ))}
          </EntityList>
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
      title: 'Retract shared artifact',
      description: `Crée une tombstone signée pour la note « ${retractNoteId.trim()} » et passe son consentement à Denied. Irréversible.`,
      variant: 'danger',
      confirmLabel: 'Retract',
      onConfirm: async () => {
        setRetracting(true)
        try {
          await sharingApi.retract(slug, { note_id: retractNoteId.trim(), reason: retractReason.trim() || undefined })
          toast.success('Artifact retracted successfully')
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
      description="Retirer une note déjà partagée : une tombstone signée demande aux autres instances de l'effacer."
      collapsible
      defaultOpen={false}
    >
      <div className="space-y-3">
        <SettingsList>
          <SettingRow label="Retract a note" description="Irréversible — la note ne pourra plus être partagée.">
            <div className="flex flex-wrap gap-2">
              <div className="flex-[1_1_12rem] min-w-0">
                <Input
                  placeholder="Note UUID"
                  aria-label="Note UUID"
                  value={retractNoteId}
                  onChange={(e) => setRetractNoteId(e.target.value)}
                  className="h-9 py-1.5 font-mono text-base md:text-sm"
                />
              </div>
              <div className="flex-[1_1_12rem] min-w-0">
                <Input
                  placeholder="Reason (optional)"
                  aria-label="Reason"
                  value={retractReason}
                  onChange={(e) => setRetractReason(e.target.value)}
                  className="h-9 py-1.5 text-base md:text-sm"
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
          <EmptyState size="sm" title="No tombstone" description="Les notes retirées apparaîtront ici." />
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
