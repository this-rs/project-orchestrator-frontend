interface SkeletonProps {
  className?: string
  width?: string
  height?: string
}

/** Base skeleton block — a pulsing placeholder */
export function Skeleton({ className = '', width, height }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded bg-white/[0.06] ${className}`}
      style={{ width, height }}
    />
  )
}

/** A single line of text placeholder */
export function SkeletonLine({ className = '', width = '100%' }: { className?: string; width?: string }) {
  return <Skeleton className={`h-4 ${className}`} width={width} />
}

/** A badge-shaped placeholder */
export function SkeletonBadge({ className = '' }: { className?: string }) {
  return <Skeleton className={`h-5 w-16 rounded-full ${className}`} />
}

/** A card placeholder: same box and opaque surface as an `EntityCard` (icon tile, title, lines, badges). */
export function SkeletonCard({ className = '', lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div aria-hidden="true" className={`rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3 ${className}`}>
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 shrink-0 rounded-lg" />
        <SkeletonLine width="60%" className="h-5" />
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} width={i === lines - 1 ? '40%' : '90%'} />
      ))}
      <div className="flex gap-2 pt-1">
        <SkeletonBadge />
        <SkeletonBadge />
      </div>
    </div>
  )
}

/** Placeholder matching an EntityRow (dot + title + meta line). */
export function EntityRowSkeleton({ meta = true }: { meta?: boolean }) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 md:px-4" aria-hidden="true">
      <Skeleton className="mt-[7px] h-1.5 w-1.5 rounded-full" />
      <div className="flex-1 min-w-0 space-y-2 py-0.5">
        <div className="flex items-center gap-3">
          <SkeletonLine width="55%" className="h-3.5" />
          <Skeleton className="ml-auto h-3 w-8" />
        </div>
        {meta && <SkeletonLine width="35%" className="h-2.5" />}
      </div>
    </div>
  )
}

/** Loading state for an EntityList: `rows` placeholder rows inside the same card surface. */
export function EntityListSkeleton({ rows = 6, className = '' }: { rows?: number; className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.05] overflow-hidden ${className}`}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <EntityRowSkeleton key={i} />
      ))}
    </div>
  )
}
