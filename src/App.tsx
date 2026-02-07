import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Provider } from 'jotai'
import { MainLayout } from '@/layouts'
import {
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
} from '@/pages'

function App() {
  return (
    <Provider>
      <BrowserRouter>
        <Routes>
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
        </Routes>
      </BrowserRouter>
    </Provider>
  )
}

export default App
