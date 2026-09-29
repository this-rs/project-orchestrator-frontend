import { useState } from 'react'
import type { TabItem } from '@/components/ui'
import { ViewTabs } from '@/components/ui'
import { Blocks, Users, GitFork } from 'lucide-react'
import { CodeArchitectureTab } from './CodeArchitectureTab'
import { CodeCommunitiesTab } from './CodeCommunitiesTab'
import { CodeHeritageTab } from './CodeHeritageTab'

interface CodeArchitectureFullTabProps {
  projectSlug: string | null
  workspaceSlug: string
  onOpenFile: (path: string) => void
}

type SubTab = 'overview' | 'communities' | 'heritage'

const SUB_TABS: TabItem[] = [
  { id: 'overview', label: 'Overview', icon: <Blocks /> },
  { id: 'communities', label: 'Communities', icon: <Users /> },
  { id: 'heritage', label: 'Heritage', icon: <GitFork /> },
]

/** "Architecture" section of the Code page: overview, coupled communities, inheritance. */
export function CodeArchitectureFullTab({ projectSlug, workspaceSlug, onOpenFile }: CodeArchitectureFullTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('overview')

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Shape of the code: key files and languages, communities of tightly coupled files, inheritance hierarchies.
      </p>

      <ViewTabs tabs={SUB_TABS} value={subTab} onChange={(id) => setSubTab(id as SubTab)} label="Architecture" />

      {subTab === 'overview' && <CodeArchitectureTab projectSlug={projectSlug} workspaceSlug={workspaceSlug} onOpenFile={onOpenFile} />}
      {subTab === 'communities' && <CodeCommunitiesTab projectSlug={projectSlug} />}
      {subTab === 'heritage' && <CodeHeritageTab />}
    </div>
  )
}
