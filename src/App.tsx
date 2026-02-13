import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { Provider } from 'jotai'
import { MainLayout } from '@/layouts'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { SetupGuard } from '@/components/SetupGuard'
import { UpdateBanner } from '@/components/UpdateBanner'
import { WebUpdateBanner } from '@/components/ui/WebUpdateBanner'
import { useTrayNavigation } from '@/hooks'
import { isTauri } from '@/services/env'
import {
  LoginPage,
  AuthCallbackPage,
  WorkspacesPage,
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
                    <Route path="/" element={<MainLayout />}>
                      <Route index element={<Navigate to="/workspaces" replace />} />
                      <Route path="workspaces" element={<WorkspacesPage />} />
                      <Route path="workspaces/:slug" element={<WorkspaceDetailPage />} />
                      <Route path="milestones" element={<MilestonesPage />} />
                      <Route path="milestones/:milestoneId" element={<MilestoneDetailPage />} />
                      <Route
                        path="project-milestones/:milestoneId"
                        element={<ProjectMilestoneDetailPage />}
                      />
                      <Route path="projects" element={<ProjectsPage />} />
                      <Route path="projects/:slug" element={<ProjectDetailPage />} />
                      <Route path="plans" element={<PlansPage />} />
                      <Route path="plans/:planId" element={<PlanDetailPage />} />
                      <Route path="tasks" element={<TasksPage />} />
                      <Route path="tasks/:taskId" element={<TaskDetailPage />} />
                      <Route path="notes" element={<NotesPage />} />
                      <Route path="code" element={<CodePage />} />
                      <Route path="feature-graphs/:id" element={<FeatureGraphDetailPage />} />
                    </Route>
                  </Route>
                </Route>
              </Route>
            </Routes>
          </div>
        </div>
      </BrowserRouter>
    </Provider>
  )
}

export default App
