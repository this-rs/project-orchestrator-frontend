import { useState } from 'react'
import type { TabItem } from '@/components/ui'
import { ViewTabs } from '@/components/ui'
import { HeartPulse, Workflow } from 'lucide-react'
import { CodeHealthTab } from './CodeHealthTab'
import { CodeProcessesTab } from './CodeProcessesTab'

interface CodeSanteTabProps {
  projectSlug: string | null
  onOpenFile: (path: string) => void
}

type SubTab = 'health' | 'processes'

const SUB_TABS: TabItem[] = [
  { id: 'health', label: 'Metrics & hotspots', icon: <HeartPulse /> },
  { id: 'processes', label: 'Processes', icon: <Workflow /> },
]

/** "Health" section of the Code page: metrics / hotspots, and detected processes. */
export function CodeSanteTab({ projectSlug, onOpenFile }: CodeSanteTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('health')

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        God functions, orphan files, change hotspots, under-documented files and the business processes detected in
        the code.
      </p>

      <ViewTabs tabs={SUB_TABS} value={subTab} onChange={(id) => setSubTab(id as SubTab)} label="Health" />

      {subTab === 'health' && <CodeHealthTab projectSlug={projectSlug} onOpenFile={onOpenFile} />}
      {subTab === 'processes' && <CodeProcessesTab projectSlug={projectSlug} onOpenFile={onOpenFile} />}
    </div>
  )
}
