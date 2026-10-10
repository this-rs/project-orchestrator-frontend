import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Folder, Search, Blocks, HeartPulse } from 'lucide-react'
import { PageShell, Select, TabLayout } from '@/components/ui'
import type { TabItem } from '@/components/ui'
import { workspacesApi } from '@/services'
import { useWorkspaceSlug } from '@/hooks'
import { useT } from '@/i18n'
import { CodeExplorerTab } from '@/components/code/CodeExplorerTab'
import { CodeArchitectureFullTab } from '@/components/code/CodeArchitectureFullTab'
import { CodeSanteTab } from '@/components/code/CodeSanteTab'
import { FileHistoryDrawer } from '@/components/code/FileHistoryDrawer'

type CodeTab = 'explorer' | 'architecture' | 'health'

const TAB_IDS: string[] = ['explorer', 'architecture', 'health']
/** Older links (`?tab=sante`) keep working. */
const LEGACY_TAB_IDS: Record<string, CodeTab> = { sante: 'health' }

/**
 * Code explorer. URL state (shareable, survives back navigation on phones):
 *   ?tab=explorer|architecture|health  ?project=<slug>  ?file=<path> (opens the file history sheet)
 */
export function CodePage() {
  const { t } = useT()
  const tabs: TabItem[] = [
    { id: 'explorer', label: t('code.page.tabs.explorer'), icon: <Search /> },
    { id: 'architecture', label: t('code.page.tabs.architecture'), icon: <Blocks /> },
    { id: 'health', label: t('code.page.tabs.health'), icon: <HeartPulse /> },
  ]
  const wsSlug = useWorkspaceSlug()
  const [params, setParams] = useSearchParams()

  const tabParam = params.get('tab') ?? ''
  const activeTab: CodeTab = TAB_IDS.includes(tabParam) ? (tabParam as CodeTab) : (LEGACY_TAB_IDS[tabParam] ?? 'explorer')
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

  /** Every tab opens a file's history through the URL, so the sheet is shareable and closes with Back. */
  const openFile = useCallback((path: string) => setParam('file', path), [setParam])
  const closeFile = useCallback(() => setParam('file', null), [setParam])

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
    { value: 'all', label: t('code.page.wholeWorkspace') },
    ...projects.map((p) => ({ value: p.slug, label: p.name })),
  ]

  return (
    <PageShell
      title={t('nav.concepts.code')}
      description={t('code.page.description')}
      intro="code"
      width="wide"
      filters={
        projects.length > 1 ? (
          <div className="sm:max-w-xs">
            <Select
              options={projectOptions}
              value={selectedProject}
              onChange={(value) => setParam('project', value === 'all' ? null : value)}
              icon={<Folder className="w-3 h-3" />}
            />
          </div>
        ) : undefined
      }
    >
      <TabLayout
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => setParam('tab', id === 'explorer' ? null : id)}
        label={t('code.page.sections')}
        className="pt-4"
      >
        {activeTab === 'explorer' && <CodeExplorerTab projectSlug={projectSlug} workspaceSlug={wsSlug} onOpenFile={openFile} />}
        {activeTab === 'architecture' && (
          <CodeArchitectureFullTab projectSlug={projectSlug} workspaceSlug={wsSlug} onOpenFile={openFile} />
        )}
        {activeTab === 'health' && <CodeSanteTab projectSlug={projectSlug} onOpenFile={openFile} />}
      </TabLayout>

      {fileParam && (
        <FileHistoryDrawer
          filePath={fileParam}
          projectSlug={projectSlug}
          workspaceSlug={wsSlug}
          onClose={closeFile}
          onNavigate={openFile}
        />
      )}
    </PageShell>
  )
}
