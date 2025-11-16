import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from './App'
// REQUIRED: Import @wolffm/themes CSS - DO NOT REMOVE
import '@wolffm/themes/themes.css'
import './styles/index.css'

// Props interface for configuration from parent app
export interface YourAppProps {
  theme?: string // Theme passed from parent (e.g., 'default', 'ocean', 'forest')
  userType?: 'public' | 'friend' | 'admin'
  sessionId?: string
}

// Extend HTMLElement to include __root property
interface YourAppElement extends HTMLElement {
  __root?: Root
}

// Mount function - called by parent to initialize your app
export function mount(el: HTMLElement, props: YourAppProps = {}) {
  const root = createRoot(el)
  root.render(<App {...props} />)
  ;(el as YourAppElement).__root = root
  console.log('[your-app] Mounted successfully', props)
}

// Unmount function - called by parent to cleanup your app
export function unmount(el: HTMLElement) {
  ;(el as YourAppElement).__root?.unmount()
  console.log('[your-app] Unmounted successfully')
}
