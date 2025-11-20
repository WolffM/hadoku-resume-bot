import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from './App'
// REQUIRED: Import @wolffm/themes CSS - DO NOT REMOVE
import '@wolffm/themes/style.css'
import './styles/index.css'

// Props interface for configuration from parent app
export interface ResumeBotAppProps {
  theme?: string
}

// Extend HTMLElement to include __root property
interface ResumeBotAppElement extends HTMLElement {
  __root?: Root
}

// Mount function - called by parent to initialize resume bot
export function mount(el: HTMLElement, props: ResumeBotAppProps = {}) {
  const root = createRoot(el)
  root.render(<App {...props} />)
  ;(el as ResumeBotAppElement).__root = root
  console.log('[resume-bot] Mounted successfully', props)
}

// Unmount function - called by parent to cleanup resume bot
export function unmount(el: HTMLElement) {
  ;(el as ResumeBotAppElement).__root?.unmount()
  console.log('[resume-bot] Unmounted successfully')
}
