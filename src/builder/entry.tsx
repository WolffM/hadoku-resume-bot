import { createRoot, type Root } from 'react-dom/client'
import { logger } from '@wolffm/logger/client'
import { BuilderApp } from './BuilderApp'
import { setBuilderApiBaseUrl } from './api'
// Theme tokens (@wolffm/themes) are provided by the host page; builder.css
// references them with fallbacks so it degrades gracefully on its own.
import './builder.css'

export interface ResumeBuilderProps {
  theme?: string
  /** Backend path/URL, e.g. '/resume' — builder calls ${apiBaseUrl}/api/builder/*. */
  apiBaseUrl: string
}

interface BuilderElement extends HTMLElement {
  __root?: Root
}

export function mount(el: HTMLElement, props: ResumeBuilderProps) {
  setBuilderApiBaseUrl(props.apiBaseUrl)
  const root = createRoot(el)
  root.render(<BuilderApp />)
  ;(el as BuilderElement).__root = root
  logger.info('[resume-builder] Mounted', { apiBaseUrl: props.apiBaseUrl })
}

export function unmount(el: HTMLElement) {
  ;(el as BuilderElement).__root?.unmount()
  logger.info('[resume-builder] Unmounted')
}
