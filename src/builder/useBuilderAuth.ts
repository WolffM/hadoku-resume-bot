import { useEffect, useState } from 'react'
import { whoami } from '@wolffm/prefs-client'
import { logger } from '@wolffm/logger/client'

// Ecosystem auth, matching the command station (hadoku_site ContactAdmin):
// resolve the caller's tier via edge-router's /session/whoami, and on anything
// short of admin bounce to the shared /auth sign-in page rather than showing a
// custom "enter a key" dead-end. /auth accepts a valid key (POST /session/create)
// and redirects back to `return`. No app-specific key handling lives here.

/** Send the browser to the ecosystem sign-in page, returning here afterwards. */
export function redirectToAuth(): void {
  if (typeof window === 'undefined') return
  const ret = encodeURIComponent(window.location.pathname + window.location.search)
  window.location.replace(`/auth?return=${ret}`)
}

export type AuthStatus = 'checking' | 'authorized' | 'redirecting'

export interface BuilderAuth {
  status: AuthStatus
  /** Display name from the key registry once authorized (null if unnamed). */
  name: string | null
}

export function useBuilderAuth(): BuilderAuth {
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    whoami()
      .then(who => {
        if (cancelled) return
        if (who.userType === 'admin') {
          setName(who.name ?? null)
          setStatus('authorized')
          return
        }
        logger.info('[builder] not admin, redirecting to sign in', { userType: who.userType })
        setStatus('redirecting')
        redirectToAuth()
      })
      .catch((err: unknown) => {
        // whoami() itself never rejects (it degrades to public), but stay
        // defensive: any failure means "not signed in" → sign-in page.
        if (cancelled) return
        logger.error('[builder] whoami failed', {
          error: err instanceof Error ? err.message : String(err)
        })
        setStatus('redirecting')
        redirectToAuth()
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { status, name }
}
