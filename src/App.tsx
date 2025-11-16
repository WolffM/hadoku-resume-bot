import React, { useEffect, useRef, useState } from 'react'
import type { ResumeBotAppProps } from './entry'

export default function App(props: ResumeBotAppProps = {}) {
  const { theme = 'default' } = props
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
    <div ref={containerRef} className="resume-bot-container">
      <div className="resume-bot">
        <header className="resume-bot__header">
          <h1>resume bot</h1>
        </header>

        <main className="resume-bot__content">
          <p>Theme: {theme}</p>
        </main>
      </div>
    </div>
  )
}
