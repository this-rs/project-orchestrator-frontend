/**
 * Project profile — the one place that names the two kinds of project.
 *
 * `software` is a codebase: a folder to index, synced and watched. `work` is
 * plans, tasks, notes and documents with no folder (an event, a budget, a
 * hiring round). The wire value stays `profile: software | work`; only the
 * words here are for people.
 *
 * Labels are English for now; they move to `src/i18n` once the i18n
 * foundation (#252) is merged.
 */
import { Code, Files, type LucideIcon } from 'lucide-react'
import type { Project, ProjectProfile } from '@/types'

export const PROJECT_PROFILES: readonly ProjectProfile[] = ['software', 'work'] as const

export const PROJECT_PROFILE_TEXT = {
  /** Field label and fact title. */
  type: 'Type',
  software: {
    label: 'With code',
    description: 'A folder on this machine, indexed and kept in sync.',
  },
  work: {
    label: 'Without code',
    description: 'Plans, tasks, notes and documents. No folder.',
  },
  folder: {
    label: 'Folder',
    placeholder: '/path/to/project',
    required: 'A project with code needs its folder',
    browse: 'Browse for folder',
  },
} as const

const ICONS: Record<ProjectProfile, LucideIcon> = { software: Code, work: Files }

/** A payload without `profile` predates the field: it is a codebase. */
export function profileOf(project: Pick<Project, 'profile'> | null | undefined): ProjectProfile {
  return project?.profile === 'work' ? 'work' : 'software'
}

export function profileLabel(profile: ProjectProfile): string {
  return PROJECT_PROFILE_TEXT[profile].label
}

export function profileIcon(profile: ProjectProfile): LucideIcon {
  return ICONS[profile]
}

/** Only a codebase can be synced or watched; a `work` project has nothing to index. */
export function hasCodebase(project: Pick<Project, 'profile' | 'root_path'>): boolean {
  return profileOf(project) === 'software'
}
