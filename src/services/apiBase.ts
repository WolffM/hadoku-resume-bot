// Shared normalisation for the `apiBaseUrl` mount prop.
//
// Historically resume-bot was handed the *app* root ('/resume') and appended
// '/api/...' itself, while every other hadoku child app is handed the *API*
// root ('/oss/api', '/jobplatform/api') and appends only the endpoint. This
// makes the same prop mean two different things depending on the app.
//
// Migration is two-sided (package + hadoku_site) and hadoku_site auto-bumps
// @wolffm/* on publish, so there is no window in which both flip at once.
// Instead: accept BOTH shapes. Strip a trailing '/api' before appending, so
// '/resume' and '/resume/api' resolve identically.
//
// Once hadoku_site is on '/resume/api' everywhere, a deliberate major can drop
// this shim along with the '/api' in the call sites.
export function normalizeApiBase(url: string): string {
  const trimmed = url.replace(/\/+$/, '')
  return trimmed.endsWith('/api') ? trimmed.slice(0, -'/api'.length) : trimmed
}
