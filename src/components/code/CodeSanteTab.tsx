import { useState } from 'react'
import type { TabItem } from '@/components/ui'
import { ViewTabs } from '@/components/ui'
import { HeartPulse, Workflow } from 'lucide-react'
import { useT } from '@/i18n'
import { CodeHealthTab } from './CodeHealthTab'
import { CodeProcessesTab } from './CodeProcessesTab'

interface CodeSanteTabProps {
  projectSlug: string | null
  onOpenFile: (path: string) => void
}

type SubTab = 'health' | 'processes'

/** "Health" section of the Code page: metrics / hotspots, and detected processes. */
export function CodeSanteTab({ projectSlug, onOpenFile }: CodeSanteTabProps) {
  const { t } = useT()
  const [subTab, setSubTab] = useState<SubTab>('health')
  const subTabs: TabItem[] = [
    { id: 'health', label: t('code.healthTab.metrics'), icon: <HeartPulse /> },
    { id: 'processes', label: t('code.healthTab.processes'), icon: <Workflow /> },
  ]

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        {t('code.healthTab.intro')}
      </p>

      <ViewTabs tabs={subTabs} value={subTab} onChange={(id) => setSubTab(id as SubTab)} label={t('code.page.tabs.health')} />

      {subTab === 'health' && <CodeHealthTab projectSlug={projectSlug} onOpenFile={onOpenFile} />}
      {subTab === 'processes' && <CodeProcessesTab projectSlug={projectSlug} onOpenFile={onOpenFile} />}
    </div>
  )
}
