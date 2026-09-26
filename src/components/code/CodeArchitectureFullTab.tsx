import { useState } from 'react'
import type { TabItem } from '@/components/ui'
import { SubTabs } from './SubTabs'
import { Blocks, Users, GitFork } from 'lucide-react'
import { CodeArchitectureTab } from './CodeArchitectureTab'
import { CodeCommunitiesTab } from './CodeCommunitiesTab'
import { CodeHeritageTab } from './CodeHeritageTab'

interface CodeArchitectureFullTabProps {
  projectSlug: string | null
  workspaceSlug: string
}

type SubTab = 'overview' | 'communities' | 'heritage'

const SUB_TABS: TabItem[] = [
  { id: 'overview', label: 'Vue d\'ensemble', icon: <Blocks className="w-4 h-4" /> },
  { id: 'communities', label: 'Communautés', icon: <Users className="w-4 h-4" /> },
  { id: 'heritage', label: 'Héritage', icon: <GitFork className="w-4 h-4" /> },
]

export function CodeArchitectureFullTab({
  projectSlug,
  workspaceSlug,
}: CodeArchitectureFullTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('overview')

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Structure du code : vue d&apos;ensemble des modules, communautés de fichiers couplés,
        et hiérarchies d&apos;héritage.
      </p>

      <SubTabs tabs={SUB_TABS} active={subTab} onChange={(id) => setSubTab(id as SubTab)} label="Architecture" />

      {subTab === 'overview' && (
        <CodeArchitectureTab projectSlug={projectSlug} workspaceSlug={workspaceSlug} />
      )}

      {subTab === 'communities' && <CodeCommunitiesTab projectSlug={projectSlug} />}

      {subTab === 'heritage' && <CodeHeritageTab />}
    </div>
  )
}
