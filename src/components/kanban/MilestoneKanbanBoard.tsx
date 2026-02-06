import { useMemo, useState, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import type { MilestoneStatus } from '@/types'
import { useIsMobile } from '@/hooks'
import { MilestoneKanbanCard, MilestoneKanbanCardOverlay } from './MilestoneKanbanCard'
import type { MilestoneWithProgress } from './MilestoneKanbanCard'

interface MilestoneKanbanBoardProps {
  milestones: MilestoneWithProgress[]
  onMilestoneStatusChange: (milestoneId: string, newStatus: MilestoneStatus) => Promise<void>
  onMilestoneClick?: (milestoneId: string) => void
  loading?: boolean
}

const columns: { id: MilestoneStatus; title: string; color: string }[] = [
  { id: 'planned', title: 'Planned', color: 'gray' },
  { id: 'open', title: 'Open', color: 'blue' },
  { id: 'in_progress', title: 'In Progress', color: 'yellow' },
  { id: 'completed', title: 'Completed', color: 'green' },
  { id: 'closed', title: 'Closed', color: 'purple' },
]

const colorMap: Record<string, { border: string; bg: string; text: string; dropHighlight: string }> = {
  gray: {
    border: 'border-l-gray-500',
    bg: 'bg-gray-500/10',
    text: 'text-gray-400',
    dropHighlight: 'bg-gray-500/20 border-gray-500/50',
  },
  blue: {
    border: 'border-l-blue-500',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    dropHighlight: 'bg-blue-500/20 border-blue-500/50',
  },
  yellow: {
    border: 'border-l-yellow-500',
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    dropHighlight: 'bg-yellow-500/20 border-yellow-500/50',
  },
  green: {
    border: 'border-l-green-500',
    bg: 'bg-green-500/10',
    text: 'text-green-400',
    dropHighlight: 'bg-green-500/20 border-green-500/50',
  },
  purple: {
    border: 'border-l-purple-500',
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    dropHighlight: 'bg-purple-500/20 border-purple-500/50',
  },
}

export function MilestoneKanbanBoard({ milestones, onMilestoneStatusChange, onMilestoneClick, loading }: MilestoneKanbanBoardProps) {
  const [activeMilestone, setActiveMilestone] = useState<MilestoneWithProgress | null>(null)
  const isMobile = useIsMobile()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const milestonesByStatus = useMemo(() => {
    const grouped: Record<MilestoneStatus, MilestoneWithProgress[]> = {
      planned: [],
      open: [],
      in_progress: [],
      completed: [],
      closed: [],
    }
    for (const m of milestones) {
      const status = (m.status?.toLowerCase() || 'open') as MilestoneStatus
      if (grouped[status]) {
        grouped[status].push(m)
      }
    }
    return grouped
  }, [milestones])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const milestone = (event.active.data.current as { milestone: MilestoneWithProgress } | undefined)?.milestone
    if (milestone) setActiveMilestone(milestone)
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveMilestone(null)
      const { active, over } = event
      if (!over) return

      const milestoneId = active.id as string
      const newStatus = over.id as MilestoneStatus

      const milestone = milestones.find((m) => m.id === milestoneId)
      if (!milestone) return
      const currentStatus = (milestone.status?.toLowerCase() || 'open') as MilestoneStatus
      if (currentStatus === newStatus) return

      try {
        await onMilestoneStatusChange(milestoneId, newStatus)
      } catch (error) {
        console.error('Failed to update milestone status:', error)
      }
    },
    [milestones, onMilestoneStatusChange],
  )

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div key={col.id} className="min-w-[200px] flex-1">
            <div className="h-10 bg-[#1a1d27] rounded-t-lg animate-pulse" />
            <div className="h-[200px] bg-[#1a1d27]/30 rounded-b-lg border border-t-0 border-white/[0.06] animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  if (isMobile) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory">
        {columns.map((col) => (
          <div key={col.id} className="w-[80vw] shrink-0 snap-start">
            <MilestoneKanbanColumn
              id={col.id}
              title={col.title}
              milestones={milestonesByStatus[col.id]}
              color={col.color}
              onMilestoneClick={onMilestoneClick}
              fullWidth
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <MilestoneKanbanColumn
            key={col.id}
            id={col.id}
            title={col.title}
            milestones={milestonesByStatus[col.id]}
            color={col.color}
            onMilestoneClick={onMilestoneClick}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeMilestone ? <MilestoneKanbanCardOverlay milestone={activeMilestone} /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function MilestoneKanbanColumn({
  id,
  title,
  milestones,
  color,
  onMilestoneClick,
  fullWidth = false,
}: {
  id: MilestoneStatus
  title: string
  milestones: MilestoneWithProgress[]
  color: string
  onMilestoneClick?: (milestoneId: string) => void
  fullWidth?: boolean
}) {
  const { isOver, setNodeRef } = useDroppable({ id })
  const colors = colorMap[color] || colorMap.blue

  return (
    <div className={`flex flex-col flex-1 ${fullWidth ? 'min-w-0' : 'min-w-[200px]'}`}>
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg ${colors.bg} border-l-4 ${colors.border}`}>
        <h3 className={`text-sm font-semibold ${colors.text}`}>{title}</h3>
        <span className="text-xs text-gray-500 bg-[#1a1d27] rounded-full px-2 py-0.5">
          {milestones.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 p-2 space-y-2 rounded-b-lg border border-t-0 border-white/[0.06] min-h-[200px] ${fullWidth ? 'max-h-[calc(100dvh-200px)]' : 'max-h-[calc(100vh-280px)]'} overflow-y-auto transition-colors duration-150 ${
          isOver ? colors.dropHighlight : 'bg-[#1a1d27]/30'
        }`}
      >
        {milestones.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-xs text-gray-600">
            No milestones
          </div>
        ) : (
          milestones.map((m) => (
            <MilestoneKanbanCard
              key={m.id}
              milestone={m}
              onClick={() => onMilestoneClick?.(m.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
