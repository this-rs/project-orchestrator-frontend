import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize, Minimize, ChevronRight } from 'lucide-react'
import { useT } from '@/i18n'
import { iconButton } from '@/components/ui/classes'
import {
  TREEMAP_PRISMS, buildFileMetrics, buildTree, findEntry, breadcrumbFor, layoutFolder, prismColor,
  type TmNode, type TmEdge, type TreemapPrism, type TreeEntry,
} from './treemapLayout'

interface TreemapViewProps {
  nodes: TmNode[]
  edges: TmEdge[]
  selectedId?: string | null
  onSelect: (id: string) => void
  /** Rendered inside the map (e.g. NodeInspector overlay). */
  children?: React.ReactNode
  className?: string
}

const GAP = 2
const MIN_LABEL_W = 56
const MIN_LABEL_H = 22

export function TreemapView({ nodes, edges, selectedId, onSelect, children, className = '' }: TreemapViewProps) {
  const { t } = useT()
  const [prism, setPrism] = useState<TreemapPrism>('risk')
  const [folder, setFolder] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const mapRef = useRef<HTMLDivElement>(null)

  const root = useMemo(() => buildTree(buildFileMetrics(nodes, edges)), [nodes, edges])
  const current = findEntry(root, folder) ?? root
  const crumbs = useMemo(() => breadcrumbFor(root, current.path), [root, current.path])

  // Observe the map element itself: it is the same DOM node in inline and
  // fullscreen mode, so any size change (window, fullscreen, layout) is seen.
  useEffect(() => {
    const el = mapRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setSize((s) => (Math.round(s.w) === Math.round(r.width) && Math.round(s.h) === Math.round(r.height) ? s : { w: r.width, h: r.height }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [fullscreen])

  const placed = useMemo(
    () => layoutFolder(current, { x: 0, y: 0, w: size.w, h: size.h }, prism),
    [current, size.w, size.h, prism],
  )

  const crumbName = (c: { name: string; path: string }) => (c.path === '' ? t('graph.unified.treemapView.root') : c.name)
  const fsLabel = fullscreen ? t('graph.unified.exitFullscreen') : t('graph.unified.fullscreen')

  const open = (e: TreeEntry) => {
    if (e.id) onSelect(e.id)
    else setFolder(e.path)
  }

  return (
    <div
      className={`flex flex-col bg-[var(--color-surface-base)] ${fullscreen ? 'fixed inset-0 z-[9999]' : 'h-[420px] sm:h-[540px]'} ${className}`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 border-b border-white/[0.06]">
        <nav aria-label={t('graph.unified.treemapView.path')} className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-xs">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1
            return (
              <span key={c.path || 'root'} className="flex items-center gap-1 min-w-0">
                {i > 0 && <ChevronRight size={12} className="text-[color:var(--text-tertiary)] shrink-0" aria-hidden="true" />}
                {last ? (
                  <span aria-current="page" className="truncate text-[color:var(--text-primary)] font-medium">{crumbName(c)}</span>
                ) : (
                  <button type="button" onClick={() => setFolder(c.path)} className="truncate text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]">
                    {crumbName(c)}
                  </button>
                )}
              </span>
            )
          })}
        </nav>
        <div role="group" aria-label={t('graph.unified.treemapView.prism')} className="flex items-center gap-1">
          {TREEMAP_PRISMS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={prism === p}
              onClick={() => setPrism(p)}
              className={`rounded-md px-2 py-1 text-[11px] ${prism === p ? 'bg-[var(--color-primary-muted)] text-[color:var(--text-primary)]' : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'}`}
            >
              {t(`graph.unified.treemapView.${p}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          className={iconButton('secondary', 'size-8')}
          title={fsLabel}
          aria-label={fsLabel}
        >
          {fullscreen ? <Minimize size={14} aria-hidden="true" /> : <Maximize size={14} aria-hidden="true" />}
        </button>
      </div>

      <div ref={mapRef} className="relative min-h-0 flex-1 overflow-hidden">
        {root.fileCount === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-[color:var(--text-secondary)]">
            {t('graph.unified.treemapView.empty')}
          </p>
        ) : (
          placed.map(({ entry, rect, intensity }) => {
            const w = Math.max(0, rect.w - GAP)
            const h = Math.max(0, rect.h - GAP)
            const showLabel = w >= MIN_LABEL_W && h >= MIN_LABEL_H
            const showBadges = w >= 96 && h >= 40
            const selected = !!entry.id && entry.id === selectedId
            const badges = [
              entry.notes > 0 && t('graph.unified.treemapView.notes', { n: entry.notes }),
              entry.decisions > 0 && t('graph.unified.treemapView.decisions', { n: entry.decisions }),
              entry.openTasks > 0 && t('graph.unified.treemapView.openTasks', { n: entry.openTasks }),
            ].filter(Boolean) as string[]
            return (
              <button
                key={entry.path}
                type="button"
                onClick={() => open(entry)}
                title={`${entry.path} · ${badges.join(' · ')}`}
                aria-label={t('graph.unified.treemapView.open', { name: entry.name })}
                aria-pressed={entry.id ? selected : undefined}
                className={`absolute overflow-hidden rounded-sm border text-left transition-[filter] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] ${selected ? 'border-[var(--color-primary)]' : 'border-white/[0.06]'}`}
                style={{
                  left: rect.x + GAP / 2,
                  top: rect.y + GAP / 2,
                  width: w,
                  height: h,
                  background: prismColor(prism, intensity),
                }}
              >
                {showLabel && (
                  <span className="block p-1 text-[11px] leading-tight">
                    <span className="block truncate font-medium text-[color:var(--text-primary)]">{entry.name}</span>
                    {!entry.id && showBadges && (
                      <span className="block truncate text-[color:var(--text-tertiary)]">
                        {t('graph.unified.treemapView.files', { n: entry.fileCount })}
                      </span>
                    )}
                    {showBadges && badges.length > 0 && (
                      <span className="block truncate text-[color:var(--text-secondary)]">{badges.join(' · ')}</span>
                    )}
                  </span>
                )}
              </button>
            )
          })
        )}
        {children}
      </div>
    </div>
  )
}
