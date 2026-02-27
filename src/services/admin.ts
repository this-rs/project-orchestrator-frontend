import { api } from './api'
import type { SkillDetectionResult } from '@/types'

export const adminApi = {
  detectSkills: (projectId: string) =>
    api.post<SkillDetectionResult>('/admin/detect-skills', { project_id: projectId }),
}
