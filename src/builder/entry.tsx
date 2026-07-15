import { createRoot, type Root } from 'react-dom/client'
import { logger } from '@wolffm/logger/client'
import { BuilderApp } from './BuilderApp'
import { setBuilderApiBaseUrl } from './api'
// CSS is inlined into the bundle (not emitted as a separate asset) so builder.js
// is fully self-contained — it can be served from /mf/resume/builder.js and
// mounted by a bare page with no <link> wiring. Theme tokens come from the host
// page; builder.css references them with fallbacks so it degrades standalone.
import builderCss from './builder.css?inline'

function injectStyles() {
  if (document.getElementById('rb-builder-styles')) return
  const style = document.createElement('style')
  style.id = 'rb-builder-styles'
  style.textContent = builderCss
  document.head.appendChild(style)
}

export interface ResumeBuilderProps {
  theme?: string
  /** Backend path/URL, e.g. '/resume' — builder calls ${apiBaseUrl}/api/builder/*. */
  apiBaseUrl: string
}

interface BuilderElement extends HTMLElement {
  __root?: Root
}

export function mount(el: HTMLElement, props: ResumeBuilderProps) {
  injectStyles()
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
