import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { ProtocolNodeData, RunStatus } from '@/types/intelligence'
import { ENTITY_COLORS, NODE_SIZES } from '@/constants/intelligence'
import { Workflow } from 'lucide-react'
import { useWsAnimation } from '../useWsAnimation'

const categoryColors: Record<string, string> = {
  system: '#3B82F6',   // blue — auto-triggered
  business: '#F97316', // orange — agent-driven
}

/** Color mapping for run status overlays */
const runStatusColors: Record<RunStatus, { border: string; glow: string; bg: string }> = {
  running:   { border: '#22D3EE', glow: '#22D3EE', bg: '#083344' },  // cyan
  completed: { border: '#22C55E', glow: '#22C55E', bg: '#052e16' },  // green
  failed:    { border: '#EF4444', glow: '#EF4444', bg: '#450a0a' },  // red
  cancelled: { border: '#94A3B8', glow: '#94A3B8', bg: '#1e293b' },  // slate
}

function ProtocolNodeComponent({ data, selected }: NodeProps<Node<ProtocolNodeData>>) {
  const size = NODE_SIZES.protocol
  const color = ENTITY_COLORS.protocol
  const catColor = categoryColors[data.category] ?? color
  const animRef = useWsAnimation(data as Record<string, unknown>)

  const runStatus = data.runStatus
  const statusStyle = runStatus ? runStatusColors[runStatus] : null

  // Determine border & glow based on priority: runStatus > selected > default
  const borderColor = statusStyle ? statusStyle.border : selected ? '#FB923C' : catColor
  const bgColor = statusStyle ? statusStyle.bg : selected ? '#431407' : '#1a0f05'
  const boxShadow = statusStyle
    ? `0 0 14px ${statusStyle.glow}50, 0 0 6px ${statusStyle.glow}30`
    : selected
      ? `0 0 12px ${color}40`
      : data.skillId
        ? `0 0 8px ${color}25`
        : undefined

  return (
    <div
      ref={animRef}
      className="flex flex-col items-center justify-center gap-0.5 transition-all duration-150"
      style={{
        width: size.width,
        height: size.height,
        borderRadius: 10,
        background: bgColor,
        border: `2px solid ${borderColor}`,
        boxShadow,
        position: 'relative',
        overflow: 'visible',
      }}
      title={`${data.label} (${data.category})${runStatus ? ` — ${runStatus}` : ''}`}
    >
      {/* Pulsing ring overlay when a run is active */}
      {runStatus === 'running' && (
        <div
          style={{
            position: 'absolute',
            inset: -4,
            borderRadius: 14,
            border: `2px solid ${statusStyle!.border}`,
            opacity: 0.6,
            animation: 'fsm-pulse 2s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        />
      )}
      <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-orange-400 !border-0" />
      <Workflow size={16} color={runStatus === 'running' ? statusStyle!.border : catColor} />
      <span
        className="text-[7px] font-medium truncate max-w-[56px]"
        style={{ color: runStatus === 'running' ? '#A5F3FC' : '#FDBA74' }}
      >
        {data.label}
      </span>
      {/* Tiny status dot indicator */}
      {runStatus && (
        <div
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: statusStyle!.border,
            border: '1.5px solid #0f172a',
            animation: runStatus === 'running' ? 'fsm-pulse 2s ease-in-out infinite' : undefined,
          }}
          title={runStatus}
        />
      )}
      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-orange-400 !border-0" />
    </div>
  )
}

export const ProtocolNode = memo(ProtocolNodeComponent)
