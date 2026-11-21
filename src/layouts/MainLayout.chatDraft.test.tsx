import { it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'
import { useAtom } from 'jotai'
import { chatDraftInputAtom } from '@/atoms'

vi.mock('@/components/chat', () => ({ ChatPanel: () => null }))
vi.mock('@/components/auth/UserMenu', () => ({ UserMenu: () => null }))
vi.mock('@/components/WorkspaceSwitcher', () => ({ WorkspaceSwitcher: () => null }))
vi.mock('@/components/ui', () => ({ ToastContainer: () => null, HaloPointer: () => null, Branding: () => null }))
vi.mock('@/hooks', async () => ({
  ChromeWorkspaceSlugContext: (await import('react')).createContext<string | null>(null),
  useAttentionCountSource: () => {}, useMediaQuery: () => true,
  useCrudEventRefresh: () => {}, useModelCatalogEvents: () => {},
  useDragRegion: () => () => {}, useWindowFullscreen: () => false,
  useViewTransition: () => ({ navigate: () => {} }), useWorkspace: () => null,
}))
vi.mock('@/services/env', () => ({ isTauri: false }))
vi.mock('@/services/workspaces', () => ({ workspacesApi: { list: () => Promise.resolve({ items: [] }), listProjects: () => Promise.resolve([]) } }))
import { MainLayout } from './MainLayout'

function Composer() {
  const [draft, setDraft] = useAtom(chatDraftInputAtom)
  return <textarea aria-label="Composer" value={draft} onChange={(e) => setDraft(e.target.value)} />
}

it('does not carry a new conversation draft to another workspace', () => {
  localStorage.clear()
  render(<MemoryRouter initialEntries={['/workspace/a/plans']}>
    <Routes><Route path="/workspace/:slug" element={<MainLayout />}><Route path="plans" element={<Composer />} /></Route></Routes>
    <Link to="/workspace/a/plans">Workspace A</Link>
    <Link to="/workspace/b/plans">Workspace B</Link>
  </MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Composer'), { target: { value: 'Draft for A' } })
  fireEvent.click(screen.getByText('Workspace B'))
  expect((screen.getByLabelText('Composer') as HTMLTextAreaElement).value).toBe('')
  fireEvent.change(screen.getByLabelText('Composer'), { target: { value: 'Draft for B' } })
  fireEvent.click(screen.getByText('Workspace A'))
  expect((screen.getByLabelText('Composer') as HTMLTextAreaElement).value).toBe('Draft for A')
  fireEvent.click(screen.getByText('Workspace B'))
  expect((screen.getByLabelText('Composer') as HTMLTextAreaElement).value).toBe('Draft for B')
})
