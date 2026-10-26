/**
 * A rebuild renames every chunk (`IsoSceneViz-abc123.js` -> `...-def456.js`). A tab that was
 * opened before the rebuild still holds the old index and asks for a file that no longer exists:
 * the dynamic `import()` rejects, and every lazy view in the chat (the 3D engine among them) shows
 * the browser's raw message — "Importing a module script failed." — instead of the view.
 *
 * Vite reports that failure as a `vite:preloadError` event. Reloading once picks up the new index
 * and the view opens. The reload is rate-limited: if the chunk is genuinely missing (a broken
 * deploy) reloading in a loop would trap the user, so after one attempt in `WINDOW_MS` we let the
 * error through to the caller, which can show it.
 */

const KEY = 'po:chunk-reload-at'
export const WINDOW_MS = 10_000

export function installChunkReload(win: Window = window, now: () => number = Date.now): () => void {
  const onPreloadError = (event: Event): void => {
    let previous = 0
    try {
      previous = Number(win.sessionStorage.getItem(KEY) ?? 0) || 0
    } catch {
      // storage disabled: still worth one reload, the page may simply be stale
    }
    if (previous !== 0 && now() - previous < WINDOW_MS) return
    try {
      win.sessionStorage.setItem(KEY, String(now()))
    } catch {
      // ignore: the reload below is what matters
    }
    event.preventDefault()
    win.location.reload()
  }
  win.addEventListener('vite:preloadError', onPreloadError)
  return () => win.removeEventListener('vite:preloadError', onPreloadError)
}
