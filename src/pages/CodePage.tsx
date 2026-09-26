import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Folder, Search, Blocks, HeartPulse } from 'lucide-react'
import { PageContainer, Select, TabLayout } from '@/components/ui'
import type { TabItem } from '@/components/ui'
import { workspacesApi } from '@/services'
import { useWorkspaceSlug } from '@/hooks'
import { CodeExplorerTab } from '@/components/code/CodeExplorerTab'
import { CodeArchitectureFullTab } from '@/components/code/CodeArchitectureFullTab'
import { CodeSanteTab } from '@/components/code/CodeSanteTab'
import { FileHistoryDrawer } from '@/components/code/FileHistoryDrawer'

type CodeTab = 'explorer' | 'architecture' | 'sante'

const TABS: TabItem[] = [
  { id: 'explorer', label: 'Explorer', icon: <Search className="w-4 h-4" aria-hidden="true" /> },
  { id: 'architecture', label: 'Architecture', icon: <Blocks className="w-4 h-4" aria-hidden="true" /> },
  { id: 'sante', label: 'Santé', icon: <HeartPulse className="w-4 h-4" aria-hidden="true" /> },
]
const TAB_IDS = TABS.map((t) => t.id)

/**
 * Code explorer. URL state (shareable, survives back navigation on phones):
 *   ?tab=explorer|architecture|sante  ?project=<slug>  ?file=<path> (opens the file history sheet)
 */
export function CodePage() {
  const wsSlug = useWorkspaceSlug()
  const [params, setParams] = useSearchParams()

  const tabParam = params.get('tab')
  const activeTab: CodeTab = tabParam && TAB_IDS.includes(tabParam) ? (tabParam as CodeTab) : 'explorer'
  const selectedProject = params.get('project') || 'all'
  const fileParam = params.get('file')

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value === null) next.delete(key)
          else next.set(key, value)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  // Project filter
  const [projects, setProjects] = useState<{ slug: string; name: string }[]>([])

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

  return (
    <PageContainer width="full" className="space-y-3 md:space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-[1_1_12rem]">
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-gray-100">Code Explorer</h1>
          <p className="hidden sm:block mt-0.5 text-sm text-gray-500">Recherche, architecture et santé du code de vos projets.</p>
        </div>
        {projects.length > 1 && (
          <div className="w-full sm:w-56">
            <Select
              options={projectOptions}
              value={selectedProject}
              onChange={(value) => setParam('project', value === 'all' ? null : value)}
              icon={<Folder className="w-3 h-3" />}
            />
          </div>
        )}
      </header>

      <TabLayout tabs={TABS} activeTab={activeTab} onTabChange={(id) => setParam('tab', id === 'explorer' ? null : id)}>
        <div className="pt-4">
          {activeTab === 'explorer' && <CodeExplorerTab projectSlug={projectSlug} workspaceSlug={wsSlug} />}
          {activeTab === 'architecture' && <CodeArchitectureFullTab projectSlug={projectSlug} workspaceSlug={wsSlug} />}
          {activeTab === 'sante' && <CodeSanteTab projectSlug={projectSlug} />}
        </div>
      </TabLayout>

      {fileParam && (
        <FileHistoryDrawer
          filePath={fileParam}
          projectSlug={projectSlug}
          workspaceSlug={wsSlug}
          onClose={() => setParam('file', null)}
          onNavigate={(path) => setParam('file', path)}
        />
      )}
    </PageContainer>
  )
}
