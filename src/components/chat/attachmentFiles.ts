/**
 * The `File` behind each attachment the composer shows, by `localId`.
 *
 * Kept out of `attachmentState.ts` and out of the atom on purpose: that state
 * is a small value type that is compared, persisted and unit-tested by
 * content, while a `File` is a handle on gigabytes of disk that must die with
 * the chip it belongs to. These two functions are the whole rule, and they are
 * pure so the rule can be tested without a DOM.
 */
export type AttachmentFiles = ReadonlyMap<string, File>

/**
 * `files` without the entries whose attachment is gone.
 *
 * Returns the SAME map when nothing has to go: the caller runs this on every
 * change of the attachment list, and a fresh map each time would re-render a
 * subtree for nothing.
 */
export function retainFiles(files: AttachmentFiles, liveIds: Iterable<string>): AttachmentFiles {
  const live = new Set(liveIds)
  let stale = false
  for (const id of files.keys()) {
    if (!live.has(id)) {
      stale = true
      break
    }
  }
  if (!stale) return files

  const next = new Map<string, File>()
  for (const [id, file] of files) {
    if (live.has(id)) next.set(id, file)
  }
  return next
}

/**
 * The new map after one file was added: the stale entries dropped in the same
 * pass, so an upload cost never accumulates.
 */
export function withFile(
  files: AttachmentFiles,
  liveIds: Iterable<string>,
  localId: string,
  file: File,
): AttachmentFiles {
  const next = new Map(retainFiles(files, liveIds))
  next.set(localId, file)
  return next
}
