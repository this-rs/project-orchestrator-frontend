/**
 * The silent refresh that runs when a page loads, before anything knows who
 * the person is. It is the only thing between a reload and the login page, so
 * it must tell a REFUSAL (the cookie is not valid) from a FAILURE (the server
 * is slow, restarting, unreachable): only a refusal means "sign in again".
 * Treating a 503 or a timeout as a refusal sent people to /login with a
 * perfectly good cookie.
 */

/** Waits between attempts; three retries cover a restart or a busy database. */
export const BOOT_REFRESH_RETRY_DELAYS_MS: readonly number[] = [1_000, 3_000, 8_000]

/** True when the server answered and said the cookie does not work. */
export function isDefinitiveRefusal(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status
  return status === 401 || status === 403
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Runs `refresh`, retrying only failures that say nothing about the cookie.
 * Resolves with the token, rejects with the last error (a refusal at once).
 */
export async function refreshAtBoot(
  refresh: () => Promise<string>,
  delays: readonly number[] = BOOT_REFRESH_RETRY_DELAYS_MS,
  sleep: (ms: number) => Promise<void> = realSleep,
): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await refresh()
    } catch (error) {
      if (isDefinitiveRefusal(error) || attempt >= delays.length) throw error
      await sleep(delays[attempt])
    }
  }
}
