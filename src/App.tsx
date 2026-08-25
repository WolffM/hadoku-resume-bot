import React, { lazy, Suspense, useRef, useState, type RefObject } from 'react'
import { AppHeader, LoadingSkeleton } from '@wolffm/task-ui-components'
import { useHadokuTheme, HadokuThemeRoot } from '@wolffm/themes'
import type { ResumeBotAppProps } from './entry'
import type { ChatInterfaceRef } from './components/ChatInterface'

const ResumeViewer = lazy(() => import('./components/ResumeViewer'))
const ChatInterface = lazy(() => import('./components/ChatInterface'))

/**
 * Provider boundary. Theme state belongs to the platform (@wolffm/themes),
 * not to this app — the local hooks/useTheme.ts, prefs/themePrefs.ts and
 * app/themeConfig.tsx copies are gone. AppHeader renders the shared picker
 * from this context, so nothing below passes one.
 */
export default function App(props: ResumeBotAppProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  return (
    <HadokuThemeRoot theme={props.theme} containerRef={containerRef}>
      <AppInner {...props} containerRef={containerRef} />
    </HadokuThemeRoot>
  )
}

function AppInner(props: ResumeBotAppProps & { containerRef: RefObject<HTMLDivElement | null> }) {
  const { containerRef } = props
  const chatRef = useRef<ChatInterfaceRef>(null)

  // Detect system preference for loading skeleton
  const [systemPrefersDark] = useState(() => {
    if (window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return false
  })

  // Theme comes from <HadokuThemeRoot> above — one implementation for
  // every app, instead of this repo's former hooks/useTheme.ts copy.
  const { theme, isDarkTheme, isThemeReady, isInitialThemeLoad } = useHadokuTheme()

  const handleAskAbout = (text: string) => {
    chatRef.current?.askAbout(text)
  }

  // Show loading skeleton during initial theme load to prevent FOUC
  if (isInitialThemeLoad && !isThemeReady) {
    return <LoadingSkeleton isDarkTheme={systemPrefersDark} />
  }

  return (
    <div
      ref={containerRef}
      className="resume-bot-container"
      data-theme={theme}
      data-dark-theme={isDarkTheme ? 'true' : 'false'}
    >
      <div className="resume-bot">
        <AppHeader title="Resume" />

        <main className="resume-bot__content">
          <div className="resume-bot__resume-section">
            <Suspense
              fallback={
                <div className="resume-viewer resume-viewer--loading">
                  <p>Loading resume...</p>
                </div>
              }
            >
              <ResumeViewer
                onAskAbout={handleAskAbout}
                ownerName={props.ownerName}
                contactUrl={props.contactUrl}
              />
            </Suspense>
          </div>
          <div className="resume-bot__chat-section">
            <Suspense fallback={<div className="chat-interface__loading">Loading chat...</div>}>
              <ChatInterface ref={chatRef} ownerName={props.ownerName} />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}
