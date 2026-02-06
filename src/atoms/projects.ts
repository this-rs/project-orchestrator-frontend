import { atom } from 'jotai'
import type { Project, ProjectRoadmap } from '@/types'

export const projectsAtom = atom<Project[]>([])

export const projectsLoadingAtom = atom<boolean>(false)

export const selectedProjectSlugAtom = atom<string | null>(null)

export const selectedProjectAtom = atom<Project | null>((get) => {
  const slug = get(selectedProjectSlugAtom)
  const projects = get(projectsAtom)
  return projects.find((p) => p.slug === slug) ?? null
})

export const projectRoadmapAtom = atom<ProjectRoadmap | null>(null)
