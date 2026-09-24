import { useState } from 'react'
import type { TabItem } from '@/components/ui'
import { SubTabs } from './SubTabs'
import { HeartPulse, Workflow } from 'lucide-react'
import { CodeHealthTab } from './CodeHealthTab'
import { CodeProcessesTab } from './CodeProcessesTab'

interface CodeSanteTabProps {
  projectSlug: string | null
}

type SubTab = 'health' | 'processes'

const SUB_TABS: TabItem[] = [
  { id: 'health', label: 'Métriques & Hotspots', icon: <HeartPulse className="w-4 h-4" /> },
  { id: 'processes', label: 'Processus', icon: <Workflow className="w-4 h-4" /> },
]

export function CodeSanteTab({ projectSlug }: CodeSanteTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('health')

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Indicateurs de santé du code : fonctions trop grosses, fichiers orphelins,
        points chauds de modification, et processus métier détectés.
      </p>

      <SubTabs tabs={SUB_TABS} active={subTab} onChange={(id) => setSubTab(id as SubTab)} label="Santé" />

      {subTab === 'health' && <CodeHealthTab projectSlug={projectSlug} />}

      {subTab === 'processes' && <CodeProcessesTab projectSlug={projectSlug} />}
    </div>
  )
}
