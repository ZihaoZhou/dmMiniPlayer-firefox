import Browser from 'webextension-polyfill'

const CLOG_INJECT_KEY = '__DM_MINI_PLAYER_CLOG_INJECT__'

if ((window as any)[CLOG_INJECT_KEY]) {
  document.documentElement.setAttribute('dm-clog-inject-duplicate', 'true')
} else {
  ;(window as any)[CLOG_INJECT_KEY] = true

  const extStorage = Browser.storage.local

  const oClog = console.log

  window.showLog = process.env.NODE_ENV === 'development'

  extStorage.get('showLog').then((res) => {
    if (typeof res?.['showLog'] == 'undefined') return

    window.showLog = res['showLog']
  })

  window.console.log = (...args: any[]) => {
    if (!window.showLog) return
    oClog(...args)
  }

  window.setShowLog = (show: boolean) => {
    window.showLog = show
    extStorage.set({ showLog: show })
  }
}
