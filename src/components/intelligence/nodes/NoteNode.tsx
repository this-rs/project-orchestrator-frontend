import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { NoteNodeData } from '@/types/intelligence'
import { ENTITY_COLORS, NODE_SIZES } from '@/constants/intelligence'
import { StickyNote, AlertTriangle, Lightbulb, BookOpen } from 'lucide-react'
import { useAtomValue } from 'jotai'
import { energyHeatmapAtom } from '@/atoms/intelligence'

const noteIcons: Record<string, typeof StickyNote> = {
  gotcha: AlertTriangle,
  tip: Lightbulb,
  guideline: BookOpen,
}

const importanceOpacity: Record<string, number> = {
  critical: 1,
  high: 0.9,
  medium: 0.7,
  low: 0.5,
}

/**
 * Interpolate energy (0→1) to a color from red (#EF4444) through yellow (#F59E0B) to green (#22C55E).
 */
function energyToColor(energy: number): string {
  const e = Math.min(1, Math.max(0, energy))
  if (e < 0.5) {
    // red → yellow
    const t = e / 0.5
    const r = Math.round(239 + (245 - 239) * t)
    const g = Math.round(68 + (158 - 68) * t)
    const b = Math.round(68 + (11 - 68) * t)
    return `rgb(${r},${g},${b})`
  } else {
    // yellow → green
    const t = (e - 0.5) / 0.5
    const r = Math.round(245 + (34 - 245) * t)
    const g = Math.round(158 + (197 - 158) * t)
    const b = Math.round(11 + (94 - 11) * t)
    return `rgb(${r},${g},${b})`
  }
}

function NoteNodeComponent({ data, selected }: NodeProps<Node<NoteNodeData>>) {
  const size = NODE_SIZES.note
  const defaultColor = ENTITY_COLORS.note
  const Icon = noteIcons[data.noteType] ?? StickyNote
  const opacity = importanceOpacity[data.importance] ?? 0.7
  const energyGlow = data.energy > 0.7

  // Energy heatmap mode
  const heatmapEnabled = useAtomValue(energyHeatmapAtom)
  const color = heatmapEnabled ? energyToColor(data.energy) : defaultColor
  const heatmapBg = heatmapEnabled
    ? `${color}15`
    : selected ? '#422006' : '#1a1400'

  return (
    <div
      className="flex items-center justify-center transition-all duration-300"
      style={{
        width: size.width,
        height: size.height,
        borderRadius: '50%',
        background: heatmapBg,
        border: `2px solid ${selected ? '#FBBF24' : color}`,
        opacity,
        boxShadow: heatmapEnabled
          ? `0 0 ${8 + data.energy * 12}px ${color}60, inset 0 0 4px ${color}30`
          : energyGlow
            ? `0 0 14px ${defaultColor}60`
            : selected
              ? `0 0 8px ${defaultColor}40`
              : undefined,
      }}
      title={`[${data.noteType}] ${data.label}${heatmapEnabled ? ` (energy: ${(data.energy * 100).toFixed(0)}%)` : ''}`}
    >
      <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-amber-400 !border-0" />
      <Icon size={14} color={color} />
      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-amber-400 !border-0" />
    </div>
  )
}

export const NoteNode = memo(NoteNodeComponent)
