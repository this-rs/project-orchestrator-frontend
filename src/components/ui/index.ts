export { AmbientBackground } from './AmbientBackground'
export { Branding } from './Branding'
export { Button } from './Button'
export { HaloPointer } from './HaloPointer'
export {
  Badge,
  TaskStatusBadge,
  PlanStatusBadge,
  NoteStatusBadge,
  ImportanceBadge,
  ReleaseStatusBadge,
  StepStatusBadge,
  MilestoneStatusBadge,
  InteractiveMilestoneStatusBadge,
  InteractivePlanStatusBadge,
  InteractiveTaskStatusBadge,
  InteractiveNoteStatusBadge,
  InteractiveStepStatusBadge,
  SkillStatusBadge,
  InteractiveSkillStatusBadge,
  DecisionStatusBadge,
  InteractiveDecisionStatusBadge,
} from './Badge'
export { Card, CardHeader, CardTitle, CardContent, CardFooter } from './Card'
export { Input, SearchInput } from './Input'
export { Textarea } from './Textarea'
export { Select } from './Select'
export { SearchableSelect } from './SearchableSelect'
export type { SearchableOption, SearchableSelectProps } from './SearchableSelect'
export { Spinner, LoadingPage } from './Spinner'
export { ProgressBar } from './ProgressBar'
export { ProgressLine } from './ProgressLine'
export { TaskProgress } from './TaskProgress'
export { EmptyState } from './EmptyState'
export { Dropdown } from './Dropdown'
export { Pagination } from './Pagination'
export { LoadMoreSentinel } from './LoadMoreSentinel'
export { ViewToggle } from './ViewToggle'
export type { ViewMode } from './ViewToggle'
export { ViewTabs } from './ViewTabs'
export type { ViewTab } from './ViewTabs'
export { CollapsibleMarkdown } from './CollapsibleMarkdown'
export { Dialog } from './Dialog'
export type { DialogProps } from './Dialog'
export { ConfirmDialog } from './ConfirmDialog'
export type { ConfirmDialogProps } from './ConfirmDialog'
export { FormDialog } from './FormDialog'
export type { FormDialogProps } from './FormDialog'
export { LinkEntityDialog } from './LinkEntityDialog'
export { LinkedEntityBadge } from './LinkedEntityBadge'
export { ToastContainer } from './Toast'
export { OverflowMenu } from './OverflowMenu'
export { SectionNav } from './SectionNav'
export { PageHeader } from './PageHeader'
export type { ParentLink } from './PageHeader'
export { StatusSelect } from './StatusSelect'
export { PageShell, PageContainer } from './PageShell'
export type { OverflowMenuAction } from './OverflowMenu'
export { RowCheckbox } from './RowCheckbox'
export { BulkActionBar } from './BulkActionBar'
export { Skeleton, SkeletonLine, SkeletonBadge, SkeletonCard, EntityRowSkeleton, EntityListSkeleton } from './Skeleton'
export { ErrorState } from './ErrorState'
export { Tooltip } from './Tooltip'
export { AnimatedCounter } from './AnimatedCounter'
export { StatCard } from './StatCard'
export { Sparkline } from './Sparkline'
export { PulseIndicator } from './PulseIndicator'
export { RadarChart } from './RadarChart'
export type { RadarAxis, RadarSize, RadarChartProps } from './RadarChart'
export { Graph3DErrorBoundary } from './Graph3DErrorBoundary'
export { CollapsibleSection } from './CollapsibleSection'
export type { CollapsibleSectionProps } from './CollapsibleSection'
export { MetricTooltip } from './MetricTooltip'
export { TabLayout } from './TabLayout'
export type { TabItem } from './TabLayout'
export { CompactStatCard } from './CompactStatCard'
export { WatcherToggle } from './WatcherToggle'

// ── Design-system foundation (see DESIGN.md) ─────────────────────────────
export { EntityRow, EntityList, ListGroup } from './EntityRow'
export { WindowedList, type WindowedItem } from './WindowedList'
export type { EntityRowProps } from './EntityRow'
export { MetaLine, Fact, Sep, RelativeTime } from './MetaLine'
export { StatusDot, StatusIcon, StatusText, StatusMenu, PriorityText, ToneText, TONE_ICONS } from './Status'
export { Meter, Gauge, StatTiles, ratioTone } from './Metrics'
export type { StatTile } from './Metrics'
export {
  STATUS_REGISTRY,
  TONE_CLASSES,
  getStatusMeta,
  getStatusOptions,
  getPriorityMeta,
  guessTone,
  humanizeStatus,
} from './statusMeta'
export type { StatusKind, StatusTone, StatusMeta, StatusValue } from './statusMeta'
export { FilterBar } from './FilterBar'
export { Switch } from './Switch'
export { Section, Facts } from './Section'
export {
  formatRelativeShort,
  formatAbsolute,
  formatDay,
  formatDurationMs,
  formatElapsed,
  formatCost,
  formatCompactNumber,
  pluralize,
  getRecencyGroup,
  groupByRecency,
  groupBy,
  RECENCY_GROUP_ORDER,
} from './format'
export type { RecencyGroup } from './format'
export {
  focusRing,
  focusRingInset,
  hitArea,
  rowInteractive,
  metaText,
  textLink,
  inlineLink,
  surface,
  displayTitle,
  pageTitle,
  sectionTitle,
  leadText,
  glassButton,
  glassFlat,
  iconButton,
  segmented,
  segmentItem,
} from './classes'
export { ConceptIntro } from './ConceptIntro'
export type { ConceptIntroProps } from './ConceptIntro'
export { computeMenuPosition, positionFloating, supportsAnchorPositioning } from './menuPosition'
export { useFloatingFallback } from './useFloatingFallback'

// ── Motion kit (DESIGN.md § Mouvement, « Kit ») — read each file's header for where it is allowed ──
export { Reveal } from './motion/Reveal'
export type { RevealProps, RevealDirection } from './motion/Reveal'
export { CountUp } from './motion/CountUp'
export type { CountUpProps } from './motion/CountUp'
export { SpotlightCard } from './motion/SpotlightCard'
export type { SpotlightCardProps } from './motion/SpotlightCard'
