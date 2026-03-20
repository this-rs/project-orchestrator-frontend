import { useState, useEffect, useCallback } from 'react'
import { Select, PageHeader, TabLayout } from '@/components/ui'
import type { TabItem } from '@/components/ui'
import { workspacesApi } from '@/services'
import { useWorkspaceSlug } from '@/hooks'
import { Search, Blocks, HeartPulse } from 'lucide-react'
import { CodeExplorerTab } from '@/components/code/CodeExplorerTab'
import { CodeArchitectureFullTab } from '@/components/code/CodeArchitectureFullTab'
import { CodeSanteTab } from '@/components/code/CodeSanteTab'

type CodeTab = 'explorer' | 'architecture' | 'sante'

const TABS: TabItem[] = [
  { id: 'explorer', label: 'Explorer', icon: <Search className="w-4 h-4" /> },
  { id: 'architecture', label: 'Architecture', icon: <Blocks className="w-4 h-4" /> },
  { id: 'sante', label: 'Santé', icon: <HeartPulse className="w-4 h-4" /> },
]

export function CodePage() {
  const wsSlug = useWorkspaceSlug()
  const [activeTab, setActiveTab] = useState<CodeTab>('explorer')

  // Project filter
  const [projects, setProjects] = useState<{ slug: string; name: string }[]>([])
  const [selectedProject, setSelectedProject] = useState('all')

  useEffect(() => {
    async function loadProjects() {
      try {
        const wsProjects = await workspacesApi.listProjects(wsSlug)
        setProjects(wsProjects.map((p) => ({ slug: p.slug, name: p.name })))
      } catch {
        // No projects available
      }
    }
    loadProjects()
  }, [wsSlug])

  const projectSlug = selectedProject !== 'all' ? selectedProject : null

  const projectOptions = [
    { value: 'all', label: 'Tout le workspace' },
    ...projects.map((p) => ({ value: p.slug, label: p.name })),
  ]

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId as CodeTab)
  }, [])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Code Explorer"
        description="Recherche, architecture et santé du code dans vos projets."
        actions={
          projects.length > 1 ? (
            <Select
              options={projectOptions}
              value={selectedProject}
              onChange={(value) => setSelectedProject(value)}
              className="w-48"
            />
          ) : undefined
        }
      />

      <TabLayout tabs={TABS} activeTab={activeTab} onTabChange={handleTabChange}>
        {activeTab === 'explorer' && (
          <div className="pt-4">
            <CodeExplorerTab projectSlug={projectSlug} workspaceSlug={wsSlug} />
          </div>
        )}

        {activeTab === 'architecture' && (
          <div className="pt-4">
            <CodeArchitectureFullTab projectSlug={projectSlug} workspaceSlug={wsSlug} />
          </div>
        )}

        {activeTab === 'sante' && (
          <div className="pt-4">
            <CodeSanteTab projectSlug={projectSlug} />
          </div>
        )}
      </TabLayout>
    </div>
  )
}
