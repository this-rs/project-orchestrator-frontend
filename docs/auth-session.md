# Browser authentication sessions

The access token lives in memory; the shared HttpOnly refresh cookie restores a
session after a reload. The server rotates that cookie on each refresh, so the
frontend serializes cookie-changing operations across same-origin tabs using Web
Locks when available. A logout waits for an ongoing rotation before revoking
the resulting cookie. The lock is per origin: browsers without Web Locks and
different origins or ports sharing a cookie cannot coordinate this way.

OIDC authorization codes and refresh cookies are single-use. Their requests are
not automatically retried or aborted by the frontend's startup deadline: a
server may already have consumed the credential even if the response is late.
A genuine network failure after consumption can still require signing in again.
The callback only retries through the legacy Google endpoint when the server
explicitly says OIDC is not configured; policy rejections are shown directly.

When checking the current user, a temporary network or server error offers a
retry without revoking the session. A 401 first attempts token renewal.
