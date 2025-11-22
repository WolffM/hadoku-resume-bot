import { createRoot, type Root } from 'react-dom/client'
import { logger } from '@wolffm/task-ui-components'
import App from './App'
import { setApiBaseUrl } from './services/api'
// REQUIRED: Import @wolffm/themes CSS - DO NOT REMOVE
import '@wolffm/themes/style.css'
// REQUIRED: Import theme picker CSS
import '@wolffm/task-ui-components/theme-picker.css'
import './styles/index.css'

// Props interface for configuration from parent app
export interface ResumeBotAppProps {
  theme?: string // Theme passed from parent (e.g., 'default', 'ocean', 'forest')
  apiBaseUrl: string // Backend API URL (required, e.g., 'https://api.yourapp.com')
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
