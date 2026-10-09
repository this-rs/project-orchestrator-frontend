import { useState } from 'react'
import type { TabItem } from '@/components/ui'
import { ViewTabs } from '@/components/ui'
import { Blocks, Users, GitFork } from 'lucide-react'
import { useT } from '@/i18n'
import { CodeArchitectureTab } from './CodeArchitectureTab'
import { CodeCommunitiesTab } from './CodeCommunitiesTab'
import { CodeHeritageTab } from './CodeHeritageTab'

interface CodeArchitectureFullTabProps {
  projectSlug: string | null
  workspaceSlug: string
  onOpenFile: (path: string) => void
}

type SubTab = 'overview' | 'communities' | 'heritage'

/** "Architecture" section of the Code page: overview, coupled communities, inheritance. */
export function CodeArchitectureFullTab({ projectSlug, workspaceSlug, onOpenFile }: CodeArchitectureFullTabProps) {
  const { t } = useT()
  const [subTab, setSubTab] = useState<SubTab>('overview')
  const subTabs: TabItem[] = [
    { id: 'overview', label: t('code.architectureTab.overview'), icon: <Blocks /> },
    { id: 'communities', label: t('code.architectureTab.communities'), icon: <Users /> },
    { id: 'heritage', label: t('code.architectureTab.heritage'), icon: <GitFork /> },
  ]

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        {t('code.architectureTab.intro')}
      </p>

      <ViewTabs tabs={subTabs} value={subTab} onChange={(id) => setSubTab(id as SubTab)} label={t('code.page.tabs.architecture')} />

      {subTab === 'overview' && <CodeArchitectureTab projectSlug={projectSlug} workspaceSlug={workspaceSlug} onOpenFile={onOpenFile} />}
      {subTab === 'communities' && <CodeCommunitiesTab projectSlug={projectSlug} />}
      {subTab === 'heritage' && <CodeHeritageTab />}
    </div>
  )
}
