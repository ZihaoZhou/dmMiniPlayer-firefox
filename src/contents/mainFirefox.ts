import {
  formatDiagnosticError,
  setDiagnosticAttr,
} from '@root/shared/diagnostics'

const FIREFOX_MAIN_WRAPPER_KEY = '__DM_MINI_PLAYER_FIREFOX_MAIN_WRAPPER__'

if ((window as any)[FIREFOX_MAIN_WRAPPER_KEY]) {
  setDiagnosticAttr('dm-main-wrapper-duplicate', 'true')
} else {
  ;(window as any)[FIREFOX_MAIN_WRAPPER_KEY] = true
  setDiagnosticAttr('dm-main-wrapper-loaded', 'true')

  import('./main')
    .then(() => {
      setDiagnosticAttr('dm-main-imported', 'true')
    })
    .catch((error) => {
      console.error('Failed to import Firefox content main', error)
      setDiagnosticAttr('dm-main-import-error-name', error?.name || 'Error')
      setDiagnosticAttr(
        'dm-main-import-error-message',
        String(error?.message || error || 'unknown error'),
      )
      setDiagnosticAttr('dm-main-import-error', formatDiagnosticError(error))
    })
}
