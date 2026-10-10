/**
 * Project profile — the one place that names the two kinds of project.
 *
 * `software` is a codebase: a folder to index, synced and watched. `work` is
 * plans, tasks, notes and documents with no folder (an event, a budget, a
 * hiring round). The wire value stays `profile: software | work`; only the
 * words here are for people.
 *
 * The words live in `src/i18n` (`forms.projectProfile`); they are read when
 * used, so they follow the language on screen.
 */
import { Code, Files, type LucideIcon } from 'lucide-react'
import type { Project, ProjectProfile } from '@/types'
import { activeTranslator } from '@/i18n/active'
import type { MessageKey } from '@/i18n/catalog'

export const PROJECT_PROFILES: readonly ProjectProfile[] = ['software', 'work'] as const

const tr = (key: MessageKey): string => activeTranslator().t(key)

export const PROJECT_PROFILE_TEXT = {
  /** Field label and fact title. */
  get type() {
    return tr('forms.field.type')
  },
  software: {
    get label() {
      return tr('forms.projectProfile.software.label')
    },
    get description() {
      return tr('forms.projectProfile.software.description')
    },
  },
  work: {
    get label() {
      return tr('forms.projectProfile.work.label')
    },
    get description() {
      return tr('forms.projectProfile.work.description')
    },
  },
  folder: {
    get label() {
      return tr('forms.projectProfile.folder.label')
    },
    get placeholder() {
      return tr('forms.projectProfile.folder.placeholder')
    },
    get required() {
      return tr('forms.projectProfile.folder.required')
    },
    get browse() {
      return tr('forms.projectProfile.folder.browse')
    },
  },
}

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
