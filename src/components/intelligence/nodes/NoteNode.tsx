import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { NoteNodeData } from '@/types/intelligence'
import { ENTITY_COLORS, NODE_SIZES } from '@/constants/intelligence'
import { StickyNote, AlertTriangle, Lightbulb, BookOpen } from 'lucide-react'
import { useAtomValue } from 'jotai'
import { energyHeatmapAtom } from '@/atoms/intelligence'
import { activationStateAtom } from '../SpreadingActivation'
import { useWsAnimation } from '../useWsAnimation'

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
    const t = e / 0.5
    const r = Math.round(239 + (245 - 239) * t)
    const g = Math.round(68 + (158 - 68) * t)
    const b = Math.round(68 + (11 - 68) * t)
    return `rgb(${r},${g},${b})`
  } else {
    const t = (e - 0.5) / 0.5
    const r = Math.round(245 + (34 - 245) * t)
    const g = Math.round(158 + (197 - 158) * t)
    const b = Math.round(11 + (94 - 11) * t)
    return `rgb(${r},${g},${b})`
  }
}

function NoteNodeComponent({ data, selected, id }: NodeProps<Node<NoteNodeData>>) {
  const size = NODE_SIZES.note
  const defaultColor = ENTITY_COLORS.note
  const Icon = noteIcons[data.noteType] ?? StickyNote
  const baseOpacity = importanceOpacity[data.importance] ?? 0.7
  const energyGlow = data.energy > 0.7
  const animRef = useWsAnimation(data as Record<string, unknown>)

  // Energy heatmap mode
  const heatmapEnabled = useAtomValue(energyHeatmapAtom)

  // Spreading activation overlay
  const activation = useAtomValue(activationStateAtom)
  const isDirect = activation.directIds.has(id)
  const isPropagated = activation.propagatedIds.has(id)
  const isActivated = isDirect || isPropagated
  const activationScore = activation.scores.get(id) ?? 0
  const hasActiveSearch = activation.phase !== 'idle'

  // Color priority: activation > heatmap > default
  let color = defaultColor
  let bg = selected ? '#422006' : '#1a1400'
  let shadow: string | undefined
  let opacity = baseOpacity

  if (isActivated) {
    // Activation mode — cyan for direct, violet for propagated
    const activColor = isDirect ? '#22d3ee' : '#a78bfa'  // cyan-400 / violet-400
    const activBg = isDirect ? '#083344' : '#1e1b4b'     // cyan-950 / violet-950
    const glowSize = 8 + activationScore * 16
    color = activColor
    bg = activBg
    shadow = `0 0 ${glowSize}px ${activColor}80, 0 0 ${glowSize * 2}px ${activColor}30`
    opacity = 1
  } else if (hasActiveSearch) {
    // Dim non-activated notes during active search
    opacity = 0.2
  } else if (heatmapEnabled) {
    color = energyToColor(data.energy)
    bg = `${color}15`
    shadow = `0 0 ${8 + data.energy * 12}px ${color}60, inset 0 0 4px ${color}30`
  } else {
    shadow = energyGlow
      ? `0 0 14px ${defaultColor}60`
      : selected
        ? `0 0 8px ${defaultColor}40`
        : undefined
  }

  return (
    <div
      ref={animRef}
      className={`flex items-center justify-center transition-all ${isActivated ? 'duration-500' : 'duration-300'}`}
      style={{
        width: size.width,
        height: size.height,
        borderRadius: '50%',
        background: bg,
        border: `2px solid ${selected ? '#FBBF24' : color}`,
        opacity,
        boxShadow: shadow,
        // Scale up activated nodes slightly
        transform: isActivated ? `scale(${1 + activationScore * 0.3})` : undefined,
      }}
      title={`[${data.noteType}] ${data.label}${isActivated ? ` (activation: ${(activationScore * 100).toFixed(0)}%)` : heatmapEnabled ? ` (energy: ${(data.energy * 100).toFixed(0)}%)` : ''}`}
    >
      <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-amber-400 !border-0" />
      <Icon size={14} color={color} />
      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-amber-400 !border-0" />
    </div>
  )
}

export const NoteNode = memo(NoteNodeComponent)
