import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Provider } from 'jotai'
import { MainLayout } from '@/layouts'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { UpdateBanner } from '@/components/UpdateBanner'
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
  SetupWizard,
} from '@/pages'

function App() {
  return (
    <Provider>
      <BrowserRouter>
        <UpdateBanner />
        <Routes>
          {/* Public routes (no auth required) */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/setup" element={<SetupWizard />} />

          {/* Protected routes (auth required) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<MainLayout />}>
              <Route index element={<Navigate to="/workspaces" replace />} />
              <Route path="workspaces" element={<WorkspacesPage />} />
              <Route path="workspaces/:slug" element={<WorkspaceDetailPage />} />
              <Route path="milestones" element={<MilestonesPage />} />
              <Route path="milestones/:milestoneId" element={<MilestoneDetailPage />} />
              <Route path="project-milestones/:milestoneId" element={<ProjectMilestoneDetailPage />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="projects/:slug" element={<ProjectDetailPage />} />
              <Route path="plans" element={<PlansPage />} />
              <Route path="plans/:planId" element={<PlanDetailPage />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="tasks/:taskId" element={<TaskDetailPage />} />
              <Route path="notes" element={<NotesPage />} />
              <Route path="code" element={<CodePage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </Provider>
  )
}

export default App
