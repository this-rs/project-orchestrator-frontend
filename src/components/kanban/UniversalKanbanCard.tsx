import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { fadeInUp, useReducedMotion } from '@/utils/motion'

interface UniversalKanbanCardProps {
  id: string
  children: ReactNode
  onClick?: () => void
}

/**
 * Wraps a kanban card with motion animations:
 * - fadeInUp for appearance
 * - fadeOut + scale for removal
 * - layoutId for smooth column transitions
 * - Respects useReducedMotion
 */
export function UniversalKanbanCard({ id, children, onClick }: UniversalKanbanCardProps) {
  const reducedMotion = useReducedMotion()

  if (reducedMotion) {
    return (
      <div onClick={onClick}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      layoutId={`kanban-card-${id}`}
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, y: -10, scale: 0.95, transition: { duration: 0.15 } }}
      layout
      onClick={onClick}
    >
      {children}
    </motion.div>
  )
}
