import type { WatchStatus } from '@/types'

/**
 * Whether a project is currently under the file watcher.
 *
 * Match on the project id first: the backend canonicalizes paths (symlinks
 * resolved), so a project whose `root_path` goes through a symlink never
 * string-matches `watched_paths`. Paths remain a fallback for a backend that
 * predates `watched_projects`, and for watches started without a project.
 */
export function isProjectWatched(
  status: WatchStatus | null | undefined,
  projectId: string | undefined,
  rootPath: string | undefined,
): boolean {
  if (!status) return false
  if (projectId && status.watched_projects?.some((p) => p.project_id === projectId)) return true
  if (!rootPath) return false
  return status.watched_paths.some(
    (wp) => wp === rootPath || rootPath.startsWith(wp + '/') || wp.startsWith(rootPath + '/'),
  )
}

/** Watched paths that belong to none of the known projects. */
export function unlinkedWatchedPaths(
  status: WatchStatus | null | undefined,
  projects: ReadonlyArray<{ id: string; root_path?: string }>,
): string[] {
  if (!status) return []
  const linked = new Set((status.watched_projects ?? []).map((p) => p.path))
  return status.watched_paths.filter(
    (wp) =>
      !linked.has(wp) &&
      !projects.some(
        (p) =>
          !!p.root_path &&
          (p.root_path === wp || wp.startsWith(p.root_path + '/') || p.root_path.startsWith(wp + '/')),
      ),
  )
}
