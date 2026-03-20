import { useState } from 'react'
import type { TabItem } from '@/components/ui'
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
      <p className="text-sm text-gray-400">
        Indicateurs de santé du code : fonctions trop grosses, fichiers orphelins,
        points chauds de modification, et processus métier détectés.
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

      {subTab === 'health' && <CodeHealthTab projectSlug={projectSlug} />}

      {subTab === 'processes' && <CodeProcessesTab projectSlug={projectSlug} />}
    </div>
  )
}
