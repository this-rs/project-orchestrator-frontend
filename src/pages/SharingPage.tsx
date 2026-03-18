import { useState, useEffect, useCallback } from 'react'
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  ScrollText,
  Skull,
  RefreshCw,
  AlertTriangle,
  Trash2,
  Clock,
  Eye,
  Lightbulb,
  BarChart3,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import {
  Badge,
  Button,
  Select,
  Input,
  ConfirmDialog,
  PageShell,
  CollapsibleSection,
} from '@/components/ui'
import { sharingApi, workspacesApi } from '@/services'
import { useConfirmDialog, useToast, useWorkspaceSlug } from '@/hooks'
import type {
  SharingPolicy,
  SharingEvent,
  SignedTombstone,
  SharingMode,
  SharingConsent,
  SharingPreviewItem,
  SharingSuggestionItem,
  ConsentStats,
} from '@/types'

// ============================================================================
// STAT BOX
// ============================================================================

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
      <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-0.5">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? 'text-amber-400' : 'text-gray-200'}`}>
        {value}
      </span>
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export function SharingPage() {
  const wsSlug = useWorkspaceSlug()

  // Load workspace projects for the selector (same pattern as CodePage)
  const [projects, setProjects] = useState<{ slug: string; name: string }[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')

  useEffect(() => {
    async function loadProjects() {
      try {
        const wsProjects = await workspacesApi.listProjects(wsSlug)
        const mapped = wsProjects.map((p) => ({ slug: p.slug, name: p.name }))
        setProjects(mapped)
        // Auto-select first project if none selected
        if (!selectedProject && mapped.length > 0) {
          setSelectedProject(mapped[0].slug)
        }
      } catch {
        // No projects available
      }
    }
    loadProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsSlug])

  const projectSlug = selectedProject
  const selectedProjectName = projects.find((p) => p.slug === selectedProject)?.name

  const projectOptions = projects.map((p) => ({ value: p.slug, label: p.name }))

  if (projects.length === 0) {
    return (
      <PageShell
        title="Sharing & Privacy"
        description="Manage sharing policies, consent, and data retraction for your project"
      >
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-amber-500/[0.08] border border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">
            No projects found in this workspace. Add a project first.
          </p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Sharing & Privacy"
      description={`Manage sharing policies, consent, and data retraction${selectedProjectName ? ` for ${selectedProjectName}` : ''}`}
      actions={
        projectOptions.length > 1 ? (
          <Select
            options={projectOptions}
            value={selectedProject}
            onChange={(v) => setSelectedProject(v)}
            className="w-56"
          />
        ) : undefined
      }
    >
      {!projectSlug ? (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-amber-500/[0.08] border border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">
            Select a project above to configure sharing settings.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <PolicySection slug={projectSlug} />
          <LastReportSection slug={projectSlug} />
          <PreviewSection slug={projectSlug} />
          <SuggestSection slug={projectSlug} />
          <AuditTrailSection slug={projectSlug} />
          <TombstonesSection slug={projectSlug} />
        </div>
      )}
    </PageShell>
  )
}

// ============================================================================
// SECTION 1: STATUS & POLICY
// ============================================================================

function PolicySection({ slug }: { slug: string }) {
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
    const action = enabled ? 'disable' : 'enable'
    confirmDialog.open({
      title: `${action === 'enable' ? 'Enable' : 'Disable'} Sharing`,
      description: action === 'enable'
        ? 'This will allow notes to be shared according to the policy. You can disable it at any time.'
        : 'This will stop sharing any notes from this project. Existing shares are not retracted.',
      variant: action === 'enable' ? 'info' : 'warning',
      confirmLabel: action === 'enable' ? 'Enable' : 'Disable',
      onConfirm: async () => {
        try {
          const res = action === 'enable'
            ? await sharingApi.enable(slug)
            : await sharingApi.disable(slug)
          setEnabled(res.enabled)
          setPolicy(res.policy)
          toast.success(`Sharing ${res.enabled ? 'enabled' : 'disabled'}`)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : `Failed to ${action} sharing`)
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
      const updated = await sharingApi.setPolicy(slug, {
        mode,
        min_shareability_score: score,
      })
      setPolicy(updated)
      toast.success('Policy updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update policy')
    } finally {
      setSaving(false)
    }
  }

  const modeOptions = [
    { value: 'manual', label: 'Manual' },
    { value: 'suggest', label: 'Suggest' },
    { value: 'auto', label: 'Auto' },
  ]

  return (
    <CollapsibleSection
      title="Status & Policy"
      icon={<Shield className="w-4 h-4" />}
      description="Control how notes are shared from this project."
      headerRight={
        !loading && (
          <Badge variant={enabled ? 'success' : 'default'}>
            <span className="flex items-center gap-1.5">
              {enabled ? <ShieldCheck className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
          </Badge>
        )
      }
      defaultOpen
    >
      {loading ? (
        <p className="text-xs text-gray-500">Loading...</p>
      ) : (
        <>
          {/* Toggle */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h4 className="text-sm font-medium text-gray-200">Sharing</h4>
              <p className="text-xs text-gray-500 mt-0.5">
                {enabled
                  ? 'Notes can be shared according to the policy below.'
                  : 'Sharing is disabled. No notes will be shared.'}
              </p>
            </div>
            <Button
              variant={enabled ? 'danger' : 'primary'}
              size="sm"
              onClick={handleToggle}
            >
              {enabled ? 'Disable' : 'Enable'}
            </Button>
          </div>

          {/* Policy fields */}
          {policy && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <StatBox label="Mode" value={policy.mode} />
                <StatBox label="Min Score" value={policy.min_shareability_score.toFixed(2)} />
                <StatBox label="L3 Scan" value={policy.l3_scan_enabled ? 'On' : 'Off'} />
                <StatBox
                  label="Overrides"
                  value={Object.keys(policy.type_overrides ?? {}).length.toString()}
                />
              </div>

              <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Edit Policy</h4>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <label className="text-xs text-gray-400 w-24 shrink-0">Mode</label>
                  <Select
                    options={modeOptions}
                    value={mode}
                    onChange={(v) => setMode(v as SharingMode)}
                    className="w-40"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-gray-400 w-24 shrink-0">Min Score</label>
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    className="w-40"
                  />
                </div>

                {/* Type overrides display */}
                {Object.keys(policy.type_overrides ?? {}).length > 0 && (
                  <div>
                    <label className="text-xs text-gray-400 block mb-1.5">Type Overrides</label>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(policy.type_overrides ?? {}).map(([type, action]) => (
                        <Badge key={type} variant={action === 'never' ? 'error' : action === 'auto' ? 'success' : 'warning'}>
                          {type}: {action}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-1">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSavePolicy}
                    disabled={saving}
                  >
                    {saving && <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                    Save Policy
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      <ConfirmDialog {...confirmDialog.dialogProps} />
    </CollapsibleSection>
  )
}

// ============================================================================
// SECTION 2: AUDIT TRAIL
// ============================================================================

function AuditTrailSection({ slug }: { slug: string }) {
  const [events, setEvents] = useState<SharingEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [offset, setOffset] = useState(0)
  const limit = 20

  const fetchEvents = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    try {
      const data = await sharingApi.getHistory(slug, { limit, offset })
      setEvents(data)
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [slug, offset])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const consentColor = (consent: SharingConsent) => {
    switch (consent) {
      case 'explicit_allow': return 'success'
      case 'explicit_deny': return 'error'
      case 'policy_auto': return 'info'
      default: return 'default'
    }
  }

  return (
    <CollapsibleSection
      title="Audit Trail"
      icon={<ScrollText className="w-4 h-4" />}
      description="Paginated history of sharing events for this project."
      headerRight={
        events.length > 0 ? (
          <Badge variant="default">{events.length} events</Badge>
        ) : undefined
      }
    >
      {loading && events.length === 0 ? (
        <p className="text-xs text-gray-500">Loading...</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-gray-500">No sharing events recorded yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-white/[0.06]">
                  <th className="pb-2 pr-3 font-medium">Timestamp</th>
                  <th className="pb-2 pr-3 font-medium">Action</th>
                  <th className="pb-2 pr-3 font-medium">Type</th>
                  <th className="pb-2 pr-3 font-medium">Consent</th>
                  <th className="pb-2 pr-3 font-medium">Source</th>
                  <th className="pb-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {events.map((ev) => (
                  <tr key={ev.id} className="text-gray-300">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-gray-500" />
                        {new Date(ev.timestamp).toLocaleString()}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant={ev.action === 'retracted' ? 'error' : 'info'}>
                        {ev.action}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-gray-400">{ev.artifact_type}</td>
                    <td className="py-2 pr-3">
                      <Badge variant={consentColor(ev.consent as SharingConsent)}>
                        {ev.consent}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-gray-500 font-mono truncate max-w-[120px]" title={ev.source_did}>
                      {ev.source_did.length > 20 ? `${ev.source_did.slice(0, 20)}...` : ev.source_did}
                    </td>
                    <td className="py-2 text-gray-500">{ev.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
            >
              Previous
            </Button>
            <span className="text-xs text-gray-500">
              Showing {offset + 1}–{offset + events.length}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOffset(offset + limit)}
              disabled={events.length < limit}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </CollapsibleSection>
  )
}

// ============================================================================
// SECTION 3: TOMBSTONES
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
      const data = await sharingApi.listTombstones(slug)
      setTombstones(data)
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
    if (!retractNoteId.trim()) {
      toast.error('Please enter a Note ID to retract')
      return
    }
    confirmDialog.open({
      title: 'Retract Shared Artifact',
      description: `This will create a tombstone for note "${retractNoteId}" and set its consent to ExplicitDeny. This action cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Retract',
      onConfirm: async () => {
        setRetracting(true)
        try {
          await sharingApi.retract(slug, {
            note_id: retractNoteId.trim(),
            reason: retractReason.trim() || undefined,
          })
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
    <CollapsibleSection
      title="Tombstones & Retraction"
      icon={<Skull className="w-4 h-4" />}
      description="Retracted artifacts and their cryptographic tombstones."
      headerRight={
        tombstones.length > 0 ? (
          <Badge variant="error">{tombstones.length} tombstones</Badge>
        ) : undefined
      }
    >
      {/* Retract form */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 mb-4">
        <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Retract an Artifact</h4>
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
          Enter a note ID to retract. This creates a tombstone and marks the note with ExplicitDeny consent.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Note UUID"
            value={retractNoteId}
            onChange={(e) => setRetractNoteId(e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Reason (optional)"
            value={retractReason}
            onChange={(e) => setRetractReason(e.target.value)}
            className="flex-1"
          />
          <Button
            variant="danger"
            size="sm"
            onClick={handleRetract}
            disabled={retracting || !retractNoteId.trim()}
            className="shrink-0"
          >
            {retracting ? (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            )}
            Retract
          </Button>
        </div>
      </div>

      {/* Tombstones list */}
      {loading ? (
        <p className="text-xs text-gray-500">Loading...</p>
      ) : tombstones.length === 0 ? (
        <p className="text-xs text-gray-500">No tombstones recorded. Retracted artifacts will appear here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b border-white/[0.06]">
                <th className="pb-2 pr-3 font-medium">Content Hash</th>
                <th className="pb-2 pr-3 font-medium">Issuer</th>
                <th className="pb-2 pr-3 font-medium">Issued At</th>
                <th className="pb-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {tombstones.map((t) => (
                <tr key={t.content_hash} className="text-gray-300">
                  <td className="py-2 pr-3 font-mono text-gray-400 truncate max-w-[180px]" title={t.content_hash}>
                    {t.content_hash.length > 30 ? `${t.content_hash.slice(0, 30)}...` : t.content_hash}
                  </td>
                  <td className="py-2 pr-3 font-mono text-gray-500 truncate max-w-[120px]" title={t.issuer_did}>
                    {t.issuer_did.length > 20 ? `${t.issuer_did.slice(0, 20)}...` : t.issuer_did}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {new Date(t.issued_at).toLocaleString()}
                  </td>
                  <td className="py-2 text-gray-500">{t.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog {...confirmDialog.dialogProps} />
    </CollapsibleSection>
  )
}

// ============================================================================
// SECTION 4: LAST REPORT
// ============================================================================

function LastReportSection({ slug }: { slug: string }) {
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
  }, [slug])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  return (
    <CollapsibleSection
      title="Privacy Report"
      icon={<BarChart3 className="w-4 h-4" />}
      description="Latest consent statistics for this project."
      defaultOpen
    >
      {loading ? (
        <p className="text-xs text-gray-500">Loading...</p>
      ) : !stats ? (
        <p className="text-xs text-gray-500">No report available. Enable sharing and set consent on notes to generate stats.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <StatBox label="Allowed" value={String(stats.consent_allowed)} />
            <StatBox label="Denied" value={String(stats.consent_denied)} highlight={stats.consent_denied > 0} />
            <StatBox label="Pending" value={String(stats.consent_pending)} highlight={stats.consent_pending > 0} />
            <StatBox label="Denied Reasons" value={String(stats.denied_reasons.length)} />
          </div>
          {generatedAt && (
            <p className="text-[10px] text-gray-500">
              Generated at {new Date(generatedAt).toLocaleString()}
            </p>
          )}
        </>
      )}
    </CollapsibleSection>
  )
}

// ============================================================================
// SECTION 5: PREVIEW (what would be shared)
// ============================================================================

function PreviewSection({ slug }: { slug: string }) {
  const [items, setItems] = useState<SharingPreviewItem[]>([])
  const [loading, setLoading] = useState(false)

  const fetchPreview = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    try {
      const data = await sharingApi.preview(slug)
      setItems(data)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    fetchPreview()
  }, [fetchPreview])

  const decisionColor = (d: string) => d === 'allow' ? 'success' as const : 'error' as const
  const consentColor = (c: string) => {
    switch (c) {
      case 'explicit_allow': return 'success' as const
      case 'explicit_deny': return 'error' as const
      case 'policy_auto': return 'info' as const
      default: return 'default' as const
    }
  }

  return (
    <CollapsibleSection
      title="Sharing Preview"
      icon={<Eye className="w-4 h-4" />}
      description="Preview which notes would be shared under the current policy."
      headerRight={
        items.length > 0 ? (
          <Badge variant="info">{items.length} notes</Badge>
        ) : undefined
      }
    >
      {loading ? (
        <p className="text-xs text-gray-500">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-gray-500">No notes to preview. The project may have no notes or sharing is disabled.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b border-white/[0.06]">
                <th className="pb-2 pr-3 font-medium">Note</th>
                <th className="pb-2 pr-3 font-medium">Score</th>
                <th className="pb-2 pr-3 font-medium">Consent</th>
                <th className="pb-2 font-medium">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {items.map((item) => (
                <tr key={item.note_id} className="text-gray-300">
                  <td className="py-2 pr-3 max-w-[360px]">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-mono text-gray-500" title={item.note_id}>
                        {item.note_id.slice(0, 8)}
                      </span>
                      <Badge variant="default">{item.note_type}</Badge>
                    </div>
                    {item.content_preview && (
                      <p className="text-[11px] text-gray-400 truncate leading-relaxed">{item.content_preview}</p>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-gray-400">{item.shareability_score.toFixed(2)}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={consentColor(item.consent)}>{item.consent}</Badge>
                  </td>
                  <td className="py-2">
                    <Badge variant={decisionColor(item.decision)}>
                      {item.decision === 'allow' ? (
                        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> allow</span>
                      ) : (
                        <span className="flex items-center gap-1"><XCircle className="w-3 h-3" /> deny</span>
                      )}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CollapsibleSection>
  )
}

// ============================================================================
// SECTION 6: SUGGEST (notes recommended for sharing)
// ============================================================================

function SuggestSection({ slug }: { slug: string }) {
  const [suggestions, setSuggestions] = useState<SharingSuggestionItem[]>([])
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  const fetchSuggestions = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    try {
      const data = await sharingApi.suggest(slug)
      setSuggestions(data)
    } catch {
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [slug])

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
    <CollapsibleSection
      title="Sharing Suggestions"
      icon={<Lightbulb className="w-4 h-4" />}
      description="Notes that score above the threshold but don't have consent set yet."
      headerRight={
        suggestions.length > 0 ? (
          <Badge variant="warning">{suggestions.length} pending</Badge>
        ) : undefined
      }
    >
      {loading ? (
        <p className="text-xs text-gray-500">Loading...</p>
      ) : suggestions.length === 0 ? (
        <p className="text-xs text-gray-500">No suggestions. All eligible notes already have consent set, or none score above threshold.</p>
      ) : (
        <div className="space-y-2">
          {suggestions.map((s) => (
            <div
              key={s.note_id}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-white/[0.06] bg-white/[0.02]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-mono text-gray-500" title={s.note_id}>
                    {s.note_id.slice(0, 8)}
                  </span>
                  <Badge variant="default">{s.note_type}</Badge>
                  <Badge variant="info">score: {s.shareability_score.toFixed(2)}</Badge>
                </div>
                {s.content_preview && (
                  <p className="text-[11px] text-gray-400 truncate leading-relaxed">{s.content_preview}</p>
                )}
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleConsent(s.note_id, 'explicit_allow')}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  Allow
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleConsent(s.note_id, 'explicit_deny')}
                >
                  <XCircle className="w-3.5 h-3.5 mr-1" />
                  Deny
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  )
}
