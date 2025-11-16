import React, { useEffect, useRef, useState } from 'react'
import type { YourAppProps } from './entry'

export default function App(props: YourAppProps = {}) {
  const { theme = 'default', userType = 'public', sessionId = 'public' } = props
  const containerRef = useRef<HTMLDivElement>(null)

  // Detect and sync with browser's color scheme preference
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return false
  })

  // Listen for browser theme changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setIsDarkTheme(e.matches)

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  // REQUIRED: Apply theme attributes for @wolffm/themes integration
  // These attributes are REQUIRED for theming to work correctly
  useEffect(() => {
    if (containerRef.current) {
      // REQUIRED: data-theme attribute (e.g., 'default', 'ocean', 'forest')
      containerRef.current.setAttribute('data-theme', theme)
      // REQUIRED: data-dark-theme attribute ('true' or 'false')
      containerRef.current.setAttribute('data-dark-theme', isDarkTheme ? 'true' : 'false')
    }
  }, [theme, isDarkTheme])

  return (
    <div ref={containerRef} className="your-app-container">
      <div className="your-app">
        <header className="your-app__header">
          <h1>Your App</h1>
        </header>

        <main className="your-app__content">
          <p>User Type: {userType}</p>
          <p>Session ID: {sessionId}</p>
          <p>Theme: {theme}</p>
          <p>Dark Mode: {isDarkTheme ? 'Yes' : 'No'}</p>
        </main>
      </div>
    </div>
  )
}
