import type { ExecutionPlace } from '@/types/chat'

/** Whether a session runs in the server's neutral folder (`execution_place: neutral`; absent = project). */
export const isNeutralPlace = (session: { execution_place?: ExecutionPlace | null }): boolean =>
  session.execution_place === 'neutral'
