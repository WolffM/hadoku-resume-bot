import React, { lazy, Suspense, useEffect, useRef, useState, type RefObject } from 'react'
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

  /**
   * Open state of the mobile chat panel. Only the narrow layout reads it: above
   * the breakpoint the chat pane is a permanent column and the class this
   * toggles has no rules attached, so one piece of state serves both layouts and
   * the chat is never remounted (and never loses its transcript) on a resize or
   * a device rotation.
   */
  const [chatOpen, setChatOpen] = useState(false)

  const handleAskAbout = (text: string) => {
    // On mobile the chat is behind the bubble, so a question asked from the
    // résumé's context menu has to bring the panel with it.
    setChatOpen(true)
    chatRef.current?.askAbout(text)
  }

  useEffect(() => {
    if (!chatOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setChatOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [chatOpen])

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
          {/* Mobile only: taps outside the open panel dismiss it. A button
              rather than a bare div so the same affordance is reachable from a
              keyboard; `display: none` keeps it out of the tab order whenever
              the panel is closed or the layout is wide. */}
          <button
            type="button"
            className={
              chatOpen
                ? 'resume-bot__chat-scrim resume-bot__chat-scrim--open'
                : 'resume-bot__chat-scrim'
            }
            aria-label="Close chat"
            onClick={() => setChatOpen(false)}
          />
          <div
            id="resume-bot-chat"
            className={
              chatOpen
                ? 'resume-bot__chat-section resume-bot__chat-section--open'
                : 'resume-bot__chat-section'
            }
          >
            <Suspense fallback={<div className="chat-interface__loading">Loading chat...</div>}>
              <ChatInterface ref={chatRef} ownerName={props.ownerName} />
            </Suspense>
          </div>
        </main>

        {/* The bubble is always in the DOM and hidden by the stylesheet above the
            mobile breakpoint, so the wide layout is untouched by any of this. */}
        <button
          type="button"
          className="resume-bot__chat-fab"
          aria-expanded={chatOpen}
          aria-controls="resume-bot-chat"
          aria-label={chatOpen ? 'Close chat' : 'Chat about this resume'}
          onClick={() => setChatOpen(open => !open)}
        >
          {chatOpen ? <CloseIcon /> : <ChatIcon />}
        </button>
      </div>
    </div>
  )
}

/* Inline so the widget ships no icon dependency and the glyphs inherit the
 * bubble's colour. */
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
      <path d="M12 3c-4.97 0-9 3.36-9 7.5 0 2.3 1.25 4.36 3.2 5.73-.14 1.2-.6 2.3-1.36 3.24a.5.5 0 0 0 .46.82c1.9-.3 3.44-1.05 4.6-1.9.67.14 1.37.21 2.1.21 4.97 0 9-3.36 9-7.5S16.97 3 12 3Z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
