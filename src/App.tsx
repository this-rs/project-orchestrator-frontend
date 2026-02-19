import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { Provider, useAtomValue } from 'jotai'
import { MainLayout } from '@/layouts'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { SetupGuard } from '@/components/SetupGuard'
import { WorkspaceRouteGuard } from '@/components/WorkspaceRouteGuard'
import { UpdateBanner } from '@/components/UpdateBanner'
import { WebUpdateBanner } from '@/components/ui/WebUpdateBanner'
import { AmbientBackground } from '@/components/ui'
import { useTrayNavigation } from '@/hooks'
import { isTauri } from '@/services/env'
import { activeWorkspaceSlugAtom } from '@/atoms'
import { workspacePath } from '@/utils/paths'
import {
  LoginPage,
  AuthCallbackPage,
  WorkspaceSelectorPage,
  WorkspaceDetailPage,
  MilestonesPage,
  MilestoneDetailPage,
  ProjectMilestoneDetailPage,
  ProjectsPage,
  ProjectDetailPage,
  PlansPage,
  PlanDetailPage,
  TasksPage,
  TaskDetailPage,
  NotesPage,
  CodePage,
  FeatureGraphDetailPage,
  NotFoundPage,
  SetupWizard,
} from '@/pages'

/**
 * Captures the `?from=tray` query parameter on first render and stores
 * it in `trayNavigationAtom` so that downstream guards can respect the
 * navigation intent from the system tray menu.
 *
 * Must be rendered INSIDE BrowserRouter and BEFORE any guards.
 */
function TrayNavigationCapture() {
  useTrayNavigation()
  return <Outlet />
}

/**
 * Redirects `/` to the last used workspace or to the workspace selector.
 * Reads the persisted slug from localStorage via activeWorkspaceSlugAtom.
 */
function RootRedirect() {
  const lastSlug = useAtomValue(activeWorkspaceSlugAtom)
  if (lastSlug) {
    return <Navigate to={workspacePath(lastSlug, '/projects')} replace />
  }
  return <Navigate to="/workspace-selector" replace />
}

/**
 * Redirects legacy flat URLs (/plans, /tasks, etc.) to workspace-scoped ones.
 * Falls back to workspace-selector if no workspace is stored.
 */
function LegacyRedirect({ path }: { path: string }) {
  const lastSlug = useAtomValue(activeWorkspaceSlugAtom)
  if (lastSlug) {
    return <Navigate to={workspacePath(lastSlug, path)} replace />
  }
  return <Navigate to="/workspace-selector" replace />
}

/**
 * Enables native macOS rounded corners + shadow via Cocoa layer API.
 * Requires the Rust side to register the `enable_modern_window_style` command
 * from the `mac_rounded_corners` plugin module.
 *
 * No-op on non-macOS platforms and in web mode.
 */
function useMacRoundedCorners() {
  useEffect(() => {
    if (!isTauri) return

    let cleanup: (() => void) | undefined
    ;(async () => {
      try {
        const { enableModernWindowStyle, cleanupRoundedCorners } = await import(
          '@cloudworxx/tauri-plugin-mac-rounded-corners'
        )
        await enableModernWindowStyle({ cornerRadius: 10 })
        cleanup = cleanupRoundedCorners
      } catch {
        // Rust commands not registered — silently skip (web dev, Linux, Windows)
      }
    })()

    return () => cleanup?.()
  }, [])
}

function App() {
  useMacRoundedCorners()

  return (
    <Provider>
      <BrowserRouter>
        <div className="tauri-window flex h-dvh flex-col overflow-hidden">
          <AmbientBackground />
          <div className="flex min-h-0 flex-1 flex-col">
            <UpdateBanner />
            <WebUpdateBanner />
            <Routes>
              {/* Capture ?from=tray before any guard runs */}
              <Route element={<TrayNavigationCapture />}>
                {/* Public routes (no auth required) */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/auth/callback" element={<AuthCallbackPage />} />
                <Route path="/setup" element={<SetupWizard />} />

                {/* Setup guard: checks /api/setup-status before proceeding.
                    If not configured → redirects to /setup. */}
                <Route element={<SetupGuard />}>
                  {/* Protected routes (auth required) */}
                  <Route element={<ProtectedRoute />}>
                    {/* Root → redirect to last workspace or selector */}
                    <Route path="/" element={<RootRedirect />} />

                    {/* Workspace selector (no sidebar) */}
                    <Route path="/workspace-selector" element={<WorkspaceSelectorPage />} />

                    {/* ===== Workspace-scoped routes ===== */}
                    <Route path="/workspace/:slug" element={<WorkspaceRouteGuard />}>
                      <Route element={<MainLayout />}>
                        <Route index element={<Navigate to="projects" replace />} />
                        <Route path="overview" element={<WorkspaceDetailPage />} />
                        <Route path="projects" element={<ProjectsPage />} />
                        <Route path="projects/:projectSlug" element={<ProjectDetailPage />} />
                        <Route path="milestones" element={<MilestonesPage />} />
                        <Route path="milestones/:milestoneId" element={<MilestoneDetailPage />} />
                        <Route
                          path="project-milestones/:milestoneId"
                          element={<ProjectMilestoneDetailPage />}
                        />
                        <Route path="plans" element={<PlansPage />} />
                        <Route path="plans/:planId" element={<PlanDetailPage />} />
                        <Route path="tasks" element={<TasksPage />} />
                        <Route path="tasks/:taskId" element={<TaskDetailPage />} />
                        <Route path="notes" element={<NotesPage />} />
                        <Route path="code" element={<CodePage />} />
                        <Route path="feature-graphs/:id" element={<FeatureGraphDetailPage />} />
                        <Route path="*" element={<NotFoundPage embedded />} />
                      </Route>
                    </Route>

                    {/* ===== Legacy redirects (bookmarks, old URLs) ===== */}
                    <Route path="/workspaces" element={<LegacyRedirect path="/projects" />} />
                    <Route path="/workspaces/:slug" element={<LegacyRedirect path="/overview" />} />
                    <Route path="/projects" element={<LegacyRedirect path="/projects" />} />
                    <Route path="/plans" element={<LegacyRedirect path="/plans" />} />
                    <Route path="/tasks" element={<LegacyRedirect path="/tasks" />} />
                    <Route path="/notes" element={<LegacyRedirect path="/notes" />} />
                    <Route path="/milestones" element={<LegacyRedirect path="/milestones" />} />
                    <Route path="/code" element={<LegacyRedirect path="/code" />} />
                  </Route>
                </Route>

                {/* Catch-all: unknown routes outside the protected layout */}
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </div>
        </div>
      </BrowserRouter>
    </Provider>
  )
}

export default App
