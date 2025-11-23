import React, { useRef, useState } from 'react'
import { ConnectedThemePicker, LoadingSkeleton } from '@wolffm/task-ui-components'
import { THEME_ICON_MAP } from '@wolffm/themes'
import { useTheme } from './hooks/useTheme'
import type { ResumeBotAppProps } from './entry'
import ChatInterface, { type ChatInterfaceRef } from './components/ChatInterface'
import ResumeViewer from './components/ResumeViewer'

export default function App(props: ResumeBotAppProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<ChatInterfaceRef>(null)

  // Detect system preference for loading skeleton
  const [systemPrefersDark] = useState(() => {
    if (window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return false
  })

  const { theme, setTheme, isDarkTheme, isThemeReady, isInitialThemeLoad, THEME_FAMILIES } =
    useTheme({
      propsTheme: props.theme,
      experimentalThemes: false, // Set to true to enable experimental themes
      containerRef
    })

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
        <header className="resume-bot__header">
          <h1>Resume</h1>

          {/* Theme Picker */}
          <ConnectedThemePicker
            themeFamilies={THEME_FAMILIES}
            currentTheme={theme}
            onThemeChange={setTheme}
            getThemeIcon={(themeName: string) => {
              const Icon = THEME_ICON_MAP[themeName as keyof typeof THEME_ICON_MAP]
              return Icon ? <Icon /> : null
            }}
          />
        </header>

        <main className="resume-bot__content">
          <div className="resume-bot__resume-section">
            <ResumeViewer onAskAbout={handleAskAbout} />
          </div>
          <div className="resume-bot__chat-section">
            <ChatInterface ref={chatRef} />
          </div>
        </main>
      </div>
    </div>
  )
}
