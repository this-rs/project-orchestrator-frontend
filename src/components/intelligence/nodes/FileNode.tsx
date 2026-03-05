import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { FileNodeData } from '@/types/intelligence'
import { ENTITY_COLORS, NODE_SIZES } from '@/constants/intelligence'
import { FileCode2, MessageCircle } from 'lucide-react'
import { useAtomValue } from 'jotai'
import { touchesHeatmapAtom } from '@/atoms/intelligence'
import { useWsAnimation } from '../useWsAnimation'

const riskColors: Record<string, string> = {
  critical: '#EF4444',
  high: '#F59E0B',
  medium: '#3B82F6',
  low: '#6B7280',
}

/**
 * Interpolate churn score (0→1) to a green intensity for TOUCHES heatmap.
 * Low churn = dim green, high churn = bright hot green/yellow.
 */
function churnToColor(churn: number): string {
  const c = Math.min(1, Math.max(0, churn))
  if (c < 0.5) {
    // dark green → bright green
    const t = c / 0.5
    const r = Math.round(34 + (134 - 34) * t)
    const g = Math.round(197 + (239 - 197) * t)
    const b = Math.round(94 + (128 - 94) * t)
    return `rgb(${r},${g},${b})`
  } else {
    // bright green → yellow-green
    const t = (c - 0.5) / 0.5
    const r = Math.round(134 + (250 - 134) * t)
    const g = Math.round(239 + (204 - 239) * t)
    const b = Math.round(128 + (21 - 128) * t)
    return `rgb(${r},${g},${b})`
  }
}

function FileNodeComponent({ data, selected }: NodeProps<Node<FileNodeData>>) {
  const size = NODE_SIZES.file
  const color = ENTITY_COLORS.file
  const riskBorder = data.riskLevel ? riskColors[data.riskLevel] : color
  const touchesHeatmap = useAtomValue(touchesHeatmapAtom)
  const animRef = useWsAnimation(data as Record<string, unknown>)

  // DISCUSSED marker: backend sends `discussed: true` in attributes
  const isDiscussed = (data as Record<string, unknown>).discussed === true

  // TOUCHES heatmap: churn_score from backend attributes
  const churnScore = (data as Record<string, unknown>).churnScore as number | undefined
  const churn = churnScore ?? 0
  const showChurnGlow = touchesHeatmap && churn > 0

  let bg = selected ? '#1e3a5f' : '#0f172a'
  let borderColor = selected ? '#60A5FA' : riskBorder
  let shadow = selected ? `0 0 12px ${color}40` : undefined
  let iconColor = color

  if (showChurnGlow) {
    const heatColor = churnToColor(churn)
    bg = `${heatColor}15`
    borderColor = heatColor
    shadow = `0 0 ${6 + churn * 14}px ${heatColor}60, inset 0 0 4px ${heatColor}20`
    iconColor = heatColor
  }

  return (
    <div
      ref={animRef}
      className="relative flex flex-col items-center justify-center transition-all duration-200"
      style={{
        width: size.width,
        height: size.height,
        borderRadius: 6,
        background: bg,
        border: `2px solid ${borderColor}`,
        boxShadow: shadow,
      }}
      title={`${data.path ?? data.label}${isDiscussed ? ' (discussed)' : ''}${showChurnGlow ? ` (churn: ${(churn * 100).toFixed(0)}%)` : ''}`}
    >
      <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-blue-400 !border-0" />
      <FileCode2 size={16} color={iconColor} />
      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-blue-400 !border-0" />

      {/* DISCUSSED badge — small chat bubble indicator */}
      {isDiscussed && (
        <div
          className="absolute -top-1.5 -right-1.5 flex items-center justify-center rounded-full"
          style={{
            width: 14,
            height: 14,
            background: '#1e293b',
            border: '1.5px solid #D1D5DB',
            boxShadow: '0 0 4px rgba(209, 213, 219, 0.3)',
          }}
          title="Discussed in chat session"
        >
          <MessageCircle size={8} color="#D1D5DB" />
        </div>
      )}
    </div>
  )
}

export const FileNode = memo(FileNodeComponent)
