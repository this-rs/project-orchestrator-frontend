import { useState, useEffect } from 'react'
import { Button, Select, PageShell } from '@/components/ui'
import { workspacesApi } from '@/services'
import { useWorkspaceSlug } from '@/hooks'
import { CodeSearchTab, CodeArchitectureTab, CodeHealthTab, CodeCommunitiesTab, CodeProcessesTab, CodeHeritageTab, FileHistoryTab } from '@/components/code'

type CodeTab = 'search' | 'architecture' | 'health' | 'communities' | 'processes' | 'heritage' | 'history'

const TAB_CONFIG: { key: CodeTab; label: string; requiresProject?: boolean }[] = [
  { key: 'search', label: 'Search' },
  { key: 'architecture', label: 'Architecture' },
  { key: 'health', label: 'Health', requiresProject: true },
  { key: 'communities', label: 'Communities', requiresProject: true },
  { key: 'processes', label: 'Processes', requiresProject: true },
  { key: 'heritage', label: 'Heritage' },
  { key: 'history', label: 'File History' },
]

export function CodePage() {
  const wsSlug = useWorkspaceSlug()
  const [activeTab, setActiveTab] = useState<CodeTab>('search')

  // Project filter
  const [projects, setProjects] = useState<{ slug: string; name: string }[]>([])
  const [selectedProject, setSelectedProject] = useState('all')

  // Load workspace projects for filter
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
    { value: 'all', label: 'All workspace' },
    ...projects.map((p) => ({ value: p.slug, label: p.name })),
  ]

  const handleTabChange = (tab: CodeTab) => {
    // If tab requires a project and none selected, don't block but let tab handle it
    setActiveTab(tab)
  }

  return (
    <PageShell
      title="Code Explorer"
      description="Search and explore code in workspace projects"
      actions={
        <div className="flex flex-wrap gap-2">
          {TAB_CONFIG.map((tab) => (
            <Button
              key={tab.key}
              variant={activeTab === tab.key ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => handleTabChange(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      }
    >
      {/* Project filter */}
      {projects.length > 1 && (
        <div className="mb-4">
          <Select
            options={projectOptions}
            value={selectedProject}
            onChange={(value) => setSelectedProject(value)}
            className="w-full sm:w-48"
          />
        </div>
      )}

      {/* Tab content */}
      {activeTab === 'search' && (
        <CodeSearchTab projectSlug={projectSlug} workspaceSlug={wsSlug} />
      )}

      {activeTab === 'architecture' && (
        <CodeArchitectureTab projectSlug={projectSlug} workspaceSlug={wsSlug} />
      )}

      {activeTab === 'health' && (
        <CodeHealthTab projectSlug={projectSlug} />
      )}

      {activeTab === 'communities' && (
        <CodeCommunitiesTab projectSlug={projectSlug} />
      )}

      {activeTab === 'processes' && (
        <CodeProcessesTab projectSlug={projectSlug} />
      )}

      {activeTab === 'heritage' && (
        <CodeHeritageTab />
      )}

      {activeTab === 'history' && (
        <FileHistoryTab projectSlug={projectSlug} workspaceSlug={wsSlug} />
      )}
    </PageShell>
  )
}
