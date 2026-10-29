/**
 * A local file's object URL, for a preview that cannot wait for the server.
 *
 * No caching and no fetch: the `File` already holds the bytes. The URL is
 * revoked as soon as the file changes or the component goes away, which is what
 * keeps a composer left open for an hour from pinning every screenshot the user
 * tried and then removed.
 */
import { useEffect, useState } from 'react'

export function useFilePreviewUrl(file: File | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL of the previous file must stop being rendered NOW: it is revoked on the next line and a stale `src` would show a broken image.
      setUrl(null)
      return
    }
    const created = URL.createObjectURL(file)
    setUrl(created)
    return () => URL.revokeObjectURL(created)
  }, [file])

  return url
}
