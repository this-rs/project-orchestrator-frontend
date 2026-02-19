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

/** A full card placeholder mimicking a Card component */
export function SkeletonCard({ className = '', lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={`bg-surface-raised rounded-xl border border-border-subtle shadow-sm p-4 space-y-3 ${className}`}>
      {/* Header line */}
      <SkeletonLine width="60%" className="h-5" />
      {/* Body lines */}
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} width={i === lines - 1 ? '40%' : '90%'} />
      ))}
      {/* Bottom badges */}
      <div className="flex gap-2 pt-1">
        <SkeletonBadge />
        <SkeletonBadge />
      </div>
    </div>
  )
}
