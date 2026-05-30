import { ATTR_DISABLE } from '@root/shared/config'
import { LOCALE } from '@root/shared/storeKey'
import { getBrowserLocalStorage } from '@root/utils/storage'

const ENTRY_ALL_FRAMES_KEY = '__DM_MINI_PLAYER_ENTRY_ALL_FRAMES__'

if ((window as any)[ENTRY_ALL_FRAMES_KEY]) {
  document.documentElement.setAttribute('dm-entry-all-frames-duplicate', 'true')
} else {
  ;(window as any)[ENTRY_ALL_FRAMES_KEY] = true
  document.documentElement.setAttribute('dm-entry-all-frames-loaded', 'true')
  window.addEventListener('error', (event) => {
    document.documentElement.setAttribute(
      'dm-content-error',
      `${event.message || 'unknown error'} @ ${event.filename}:${event.lineno}`,
    )
  })
  window.addEventListener('unhandledrejection', (event) => {
    document.documentElement.setAttribute(
      'dm-content-rejection',
      String(event.reason?.message || event.reason || 'unknown rejection'),
    )
  })
  ;(async () => {
    if (document.documentElement.getAttribute(ATTR_DISABLE)) return

    await getBrowserLocalStorage(LOCALE).then((LOCALE) => {
      if (!LOCALE) return
      window.__LOCALE = LOCALE
    })
    if (process.env.EXTENSION_TARGET === 'firefox') return
    await Promise.all([
      import(chrome.runtime.getURL('clogInject.js')),
      import(chrome.runtime.getURL('main.js')),
    ])
  })().catch(console.error)
}
