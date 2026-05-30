const FIREFOX_MAIN_WRAPPER_KEY = '__DM_MINI_PLAYER_FIREFOX_MAIN_WRAPPER__'

if ((window as any)[FIREFOX_MAIN_WRAPPER_KEY]) {
  document.documentElement.setAttribute('dm-main-wrapper-duplicate', 'true')
} else {
  ;(window as any)[FIREFOX_MAIN_WRAPPER_KEY] = true
  document.documentElement.setAttribute('dm-main-wrapper-loaded', 'true')

  import('./main')
    .then(() => {
      document.documentElement.setAttribute('dm-main-imported', 'true')
    })
    .catch((error) => {
      console.error('Failed to import Firefox content main', error)
      document.documentElement.setAttribute(
        'dm-main-import-error-name',
        String(error?.name || 'Error'),
      )
      document.documentElement.setAttribute(
        'dm-main-import-error-message',
        String(error?.message || error || 'unknown error'),
      )
      document.documentElement.setAttribute(
        'dm-main-import-error',
        String(error?.stack || error?.message || error || 'unknown error'),
      )
    })
}
