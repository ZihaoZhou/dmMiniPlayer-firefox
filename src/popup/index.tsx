import { type FC, useEffect, useState } from 'react'
import Browser from 'webextension-polyfill'
import { createRoot } from 'react-dom/client'
import WebextEvent from '@root/shared/webextEvent'
import { FLOAT_BTN_HIDDEN } from '@root/shared/storeKey'
import { POPUP_MESSAGE_KIND } from '@root/shared/popupMessage'
import {
  getBrowserSyncStorage,
  setBrowserSyncStorage,
  useBrowserSyncStorage,
} from '@root/utils/storage'
import { t } from '../utils/i18n'

const isFirefoxTarget = process.env.EXTENSION_TARGET === 'firefox'
const FIREFOX_CONTENT_SCRIPT_FILES = [
  'entry-all-frames.js',
  'clogInject.js',
  'main.js',
]

const params = new URLSearchParams(location.search)
const isAutostart = params.get('autostart') === '1'

const timeout = <T,>(promise: Promise<T>, ms: number) =>
  Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => {
        resolve(null)
      }, ms)
    }),
  ])

const sendContentMessage = <T,>(tabId: number, event: WebextEvent) =>
  Browser.tabs.sendMessage(tabId, {
    kind: POPUP_MESSAGE_KIND,
    event,
  }) as Promise<T>

const canTalkToContentScript = async (tabId: number, timeoutMs = 800) => {
  const res = await timeout(
    sendContentMessage<string>(tabId, WebextEvent.hello).catch(() => null),
    timeoutMs,
  )
  return res === 'hi'
}

const setDiagnostic = (key: string, value: unknown) => {
  document.documentElement.setAttribute(`data-dm-popup-${key}`, String(value))
}

const getTargetTab = async () => {
  const targetUrl = params.get('targetUrl')

  if (targetUrl) {
    const tabs = await Browser.tabs.query({})
    setDiagnostic('tab-count', tabs.length)
    setDiagnostic('target-url', targetUrl)
    const targetTab = tabs.find((tab) => {
      if (!tab.id || !tab.url) return false
      return (
        tab.url === targetUrl ||
        tab.url.startsWith(targetUrl) ||
        targetUrl.startsWith(tab.url)
      )
    })
    if (targetTab) return targetTab
  }

  const tabs = await Browser.tabs.query({
    active: true,
    currentWindow: true,
  })
  return tabs[0]
}

const isUnsupportedUrl = (url?: string) =>
  !url ||
  url.startsWith('chrome://') ||
  url.startsWith('about:') ||
  url.startsWith('edge:')

const executeScript = (details: {
  target: { tabId: number; allFrames?: boolean }
  files: string[]
}) => {
  const scripting =
    (Browser as any).scripting ??
    (globalThis as any).browser?.scripting ??
    (globalThis as any).chrome?.scripting

  if (!scripting?.executeScript) {
    return Promise.reject(new Error('browser.scripting is unavailable'))
  }

  return Promise.resolve(scripting.executeScript(details))
}

const ensureContentScripts = async (tabId: number) => {
  if (!isFirefoxTarget) return

  let resultCount = 0
  for (const file of FIREFOX_CONTENT_SCRIPT_FILES) {
    try {
      const results = await executeScript({
        target: { tabId, allFrames: true },
        files: [file],
      })
      resultCount += (results as any[])?.length ?? 0
    } catch (allFramesError) {
      console.warn(`Failed to inject ${file} into all frames`, allFramesError)
      setDiagnostic(
        `inject-${file}-all-frames-error`,
        (allFramesError as Error).message,
      )
      const results = await executeScript({
        target: { tabId },
        files: [file],
      })
      resultCount += (results as any[])?.length ?? 0
    }
  }
  setDiagnostic('inject-result-count', resultCount)
}

const Page_popup: FC = () => {
  const [status, setStatus] = useState(isAutostart ? 'init' : 'menu')
  const [errorType, setErrorType] = useState('')
  const [isLoading, setLoading] = useState(isAutostart)
  const [isFloatButtonVisible, setFloatButtonVisible] = useState(true)

  useEffect(
    () =>
      useBrowserSyncStorage(FLOAT_BTN_HIDDEN, (hidden) => {
        setFloatButtonVisible(!hidden)
      }),
    [],
  )

  const prepareTab = async () => {
    setStatus('query-tabs')
    const tab = await getTargetTab()
    setDiagnostic('selected-tab-id', tab?.id)
    setDiagnostic('selected-tab-url', tab?.url)
    if (!tab?.id || isUnsupportedUrl(tab.url)) {
      setErrorType('no-support')
      return null
    }

    setStatus('hello')
    if (await canTalkToContentScript(tab.id)) {
      setDiagnostic('inject-skipped', 'content-ready')
      return tab
    }

    setStatus('inject')
    await ensureContentScripts(tab.id)
    setStatus('hello')
    if (!(await canTalkToContentScript(tab.id, 3000))) {
      setErrorType('helloFailed')
      return null
    }
    return tab
  }

  const startPIP = async () => {
    setLoading(true)
    setErrorType('')
    try {
      const tab = await prepareTab()
      if (!tab?.id) return

      setStatus('hello')
      const res = await timeout(
        sendContentMessage<string>(tab.id, WebextEvent.hello).catch(
          () => null,
        ),
        3000,
      )
      if (!res) {
        setErrorType('helloFailed')
        return
      }

      setStatus('request-pip')
      const pipRes = await timeout(
        sendContentMessage<{
          state: 'ok' | 'error'
          errType?: string
        }>(tab.id, WebextEvent.requestVideoPIP).catch(() => null),
        5000,
      )
      if (!pipRes) {
        setErrorType('helloFailed')
        return
      }
      if (pipRes.state === 'ok') {
        window.close()
        return
      }
      if (pipRes.state === 'error' && pipRes.errType) {
        setErrorType(pipRes.errType)
      }
    } catch (error) {
      console.error('Failed to start PiP from popup', error)
      setErrorType('helloFailed')
    } finally {
      setLoading(false)
    }
  }

  const openSetting = async () => {
    setLoading(true)
    setErrorType('')
    try {
      const tab = await prepareTab()
      if (!tab?.id) return

      setStatus('open-setting')
      const res = await timeout(
        sendContentMessage<string>(tab.id, WebextEvent.openSetting).catch(
          () => null,
        ),
        3000,
      )
      if (!res) {
        setErrorType('helloFailed')
        return
      }
      window.close()
    } catch (error) {
      console.error('Failed to open setting from popup', error)
      setErrorType('helloFailed')
    } finally {
      setLoading(false)
    }
  }

  const toggleFloatButton = async () => {
    const hidden = !!(await getBrowserSyncStorage(FLOAT_BTN_HIDDEN))
    await setBrowserSyncStorage(FLOAT_BTN_HIDDEN, !hidden)
  }

  useEffect(() => {
    if (!isAutostart) return
    startPIP()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-dm-popup-status', status)
    document.documentElement.setAttribute(
      'data-dm-popup-loading',
      String(isLoading),
    )
    if (errorType) {
      document.documentElement.setAttribute('data-dm-popup-error', errorType)
    } else {
      document.documentElement.removeAttribute('data-dm-popup-error')
    }
  }, [errorType, isLoading, status])

  return (
    <>
      <style>{`
        html,
        body {
          margin: 0;
          min-width: 220px;
          background: Canvas;
          color: CanvasText;
          font: menu;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .popup-menu {
          box-sizing: border-box;
          padding: 6px;
        }

        .menu-item {
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          min-height: 32px;
          padding: 6px 10px;
          border: 0;
          border-radius: 4px;
          background: transparent;
          color: inherit;
          font: inherit;
          text-align: left;
          cursor: default;
          user-select: none;
        }

        .menu-item:hover {
          background: color-mix(in srgb, Highlight 16%, transparent);
        }

        .menu-item:disabled {
          opacity: 0.55;
        }

        .checkbox-item input {
          margin: 0;
          width: 14px;
          height: 14px;
        }

        .error-text,
        .status-text {
          padding: 6px 10px 4px;
          max-width: 240px;
          font-size: 12px;
          color: color-mix(in srgb, CanvasText 64%, transparent);
        }
      `}</style>
      <div className="popup-menu">
        <button
          className="menu-item"
          disabled={isLoading}
          onClick={openSetting}
        >
          <span>{t('menu.openSetting')}</span>
        </button>
        <label className="menu-item checkbox-item">
          <input
            checked={isFloatButtonVisible}
            disabled={isLoading}
            type="checkbox"
            onChange={toggleFloatButton}
          />
          <span>{t('menu.showFloatBtn')}</span>
        </label>
        {errorType && (
          <div className="error-text">
            {errorType === 'no-support'
              ? t('popup.noSupport')
              : t('popup.helloFailed')}
          </div>
        )}
        {isAutostart && isLoading && (
          <div className="status-text">{status}</div>
        )}
      </div>
    </>
  )
}

createRoot(document.getElementById('app')!).render(<Page_popup />)
