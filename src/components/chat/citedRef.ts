import { createContext } from 'react'
import type { ChatReference, EntityRef } from '@/refs/types'
import { workspacePath } from '@/utils/paths'

/** What the text around a citation already knows (labels of references the server resolved). */
export const KnownRefsContext = createContext<readonly ChatReference[]>([])

/** Where the application shows each kind (see the routes of `App.tsx`). */
const KIND_SEGMENT: Record<EntityRef['kind'], string> = {
  plan: 'plans',
  task: 'tasks',
  note: 'notes',
  decision: 'decisions',
  rfc: 'rfcs',
}

export const citedRefPath = (slug: string, ref: EntityRef): string =>
  workspacePath(slug, `/${KIND_SEGMENT[ref.kind]}/${ref.id}`)
