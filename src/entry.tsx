import { createRoot, type Root } from 'react-dom/client'
import { logger } from '@wolffm/logger/client'
import App from './App'
import { setApiBaseUrl } from './services/api'
// REQUIRED: Import @wolffm/themes CSS - DO NOT REMOVE
import '@wolffm/themes/style.css'
// REQUIRED: Import theme picker CSS
import '@wolffm/task-ui-components/theme-picker.css'
import '@wolffm/task-ui-components/app-header.css'
import './styles/index.css'

// Props interface for configuration from parent app
export interface ResumeBotAppProps {
  /**
   * The app's DISPLAY NAME, resolved by the platform from hadoku_site's
   * spec/categories.json — the same file that titles the browser tab and the
   * homepage tile. Render this; never hard-code the name in this repo.
   *
   * Absent when the app runs standalone (its own vite dev server, no host),
   * which is what `__HADOKU_APP_NAME__` covers — see vite.config.ts.
   */
  appName?: string
  theme?: string // Theme passed from parent (e.g., 'default', 'ocean', 'forest')
  // API root (required), e.g. '/resume/api' or 'https://api.yourapp.com/api'.
  // Endpoints are appended directly: ${apiBaseUrl}/chat, ${apiBaseUrl}/resume.
  apiBaseUrl: string
  ownerName?: string // Name shown in chat welcome message (default: 'the candidate')
  // Where the toolbar's "Schedule a Meeting" button points. Defaults to the
  // host site's own /contact/ page, which is where the widget's deployment
  // (hadoku.me/resume) keeps its scheduling form.
  contactUrl?: string
}

// Extend HTMLElement to include __root property
interface ResumeBotAppElement extends HTMLElement {
  __root?: Root
}

// Mount function - called by parent to initialize resume bot
export function mount(el: HTMLElement, props: ResumeBotAppProps) {
  // Set the API base URL for all API calls
  setApiBaseUrl(props.apiBaseUrl)

  const root = createRoot(el)
  root.render(<App {...props} />)
  ;(el as ResumeBotAppElement).__root = root
  logger.info('[resume-bot] Mounted successfully', {
    theme: props.theme,
    apiBaseUrl: props.apiBaseUrl
  })
}

// Unmount function - called by parent to cleanup resume bot
export function unmount(el: HTMLElement) {
  ;(el as ResumeBotAppElement).__root?.unmount()
  logger.info('[resume-bot] Unmounted successfully')
}
