import { useState } from 'react'
import type { TabItem } from '@/components/ui'
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
      <p className="text-sm text-gray-400">
        Structure du code : vue d&apos;ensemble des modules, communautés de fichiers couplés,
        et hiérarchies d&apos;héritage.
      </p>

      <div className="flex gap-2">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id as SubTab)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              subTab === tab.id
                ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                : 'bg-white/[0.04] text-gray-400 border border-white/[0.06] hover:bg-white/[0.08]'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'overview' && (
        <CodeArchitectureTab projectSlug={projectSlug} workspaceSlug={workspaceSlug} />
      )}

      {subTab === 'communities' && <CodeCommunitiesTab projectSlug={projectSlug} />}

      {subTab === 'heritage' && <CodeHeritageTab />}
    </div>
  )
}
