import { PIP_WINDOW_CONFIG } from '@root/shared/storeKey'
import WebextEvent from '@root/shared/webextEvent'
import PostMessageEvent from '@root/shared/postMessageEvent'
import configStore, { videoBorderType } from '@root/store/config'
import { calculateNewDimensions, createElement } from '@root/utils'
import { getDocPIPBorderSize } from '@root/utils/docPIP'
import {
  getBrowserSyncStorage,
  setBrowserSyncStorage,
} from '@root/utils/storage'
import { sendMessage } from 'webext-bridge/content-script'
import { onPostMessage, postMessageToTop } from '@root/utils/windowMessages'
import { MovePIPAfterOpenType, Position } from '@root/types/config'
import { autorun } from 'mobx'
import { HtmlVideoPlayer } from '../VideoPlayer/HtmlVideoPlayer'
import { PlayerEvent } from '../event'
import { WebProvider } from '.'

const isFirefoxTarget = process.env.EXTENSION_TARGET === 'firefox'

function getFirefoxWrappedObject<T>(value: T): T {
  if (!isFirefoxTarget) return value
  return ((value as any)?.wrappedJSObject ?? value) as T
}

async function requestDocPIPWindow(options: {
  width?: number
  height?: number
}) {
  if (!isFirefoxTarget) {
    return window.documentPictureInPicture.requestWindow(options)
  }

  const id = createDocPIPRootId()
  const response = await new Promise<{
    isOk: boolean
    errMsg?: string
  }>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      unListen()
      reject(new Error('Timed out opening DocPiP window in page world'))
    }, 3000)
    const unListen = onPostMessage(
      PostMessageEvent.openDocPIPWindow_resp,
      (data) => {
        if (data.id !== id) return
        window.clearTimeout(timer)
        unListen()
        resolve(data)
      },
    )

    postMessageToTop(PostMessageEvent.openDocPIPWindow, {
      id,
      width: options.width,
      height: options.height,
    })
  })

  if (!response.isOk) {
    throw new Error(response.errMsg || 'Failed to open DocPiP window')
  }

  const pipWindow = window.documentPictureInPicture.window
  if (!pipWindow) throw new Error('DocPiP window is not available')
  return pipWindow
}

function getDocPIPDocument(pipWindow: Window) {
  return getFirefoxWrappedObject(pipWindow).document
}

function createDocPIPRootId() {
  return `dm-docpip-root-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`
}

async function appendPlayerElToPIPWindow(
  pipWindow: Window,
  playerEl: HTMLElement,
) {
  if (!isFirefoxTarget) {
    getDocPIPDocument(pipWindow).body.appendChild(playerEl)
    return
  }

  const id = playerEl.id || createDocPIPRootId()
  const styleText = playerEl.getAttribute('style') ?? ''
  playerEl.id = id
  playerEl.setAttribute(
    'style',
    `${styleText};position:fixed!important;left:-100000px!important;top:0!important;width:1px!important;height:1px!important;overflow:hidden!important;`,
  )
  document.body.appendChild(playerEl)

  const response = await new Promise<{
    isOk: boolean
    errMsg?: string
    bodyChildren?: number
  } | null>((resolve) => {
    const timer = window.setTimeout(() => {
      unListen()
      resolve(null)
    }, 500)
    const unListen = onPostMessage(
      PostMessageEvent.appendDocPIPRoot_resp,
      (data) => {
        if (data.id !== id) return
        window.clearTimeout(timer)
        unListen()
        resolve(data)
      },
    )

    postMessageToTop(PostMessageEvent.appendDocPIPRoot, {
      id,
      styleText,
    })
  })

  if (!response) return

  if (!response.isOk) {
    throw new Error(response.errMsg || 'Failed to move DocPiP root')
  }

  document.documentElement.setAttribute(
    'dm-docpip-body-children',
    String(response.bodyChildren ?? ''),
  )
}

export default class DocPIPWebProvider extends WebProvider {
  declare miniPlayer: HtmlVideoPlayer
  protected override MiniPlayer = HtmlVideoPlayer

  pipWindow?: Window

  override async onOpenPlayer() {
    // 在标题后添加 ' - PIP'
    const title = document.title
    const pipTitle = title + ' - PIP'
    document.title = pipTitle

    // Firefox requires requestWindow() to happen before async extension hops,
    // otherwise transient user activation can be lost.
    const pipWindowConfig = isFirefoxTarget
      ? undefined
      : await getBrowserSyncStorage(PIP_WINDOW_CONFIG)
    let width = pipWindowConfig?.width ?? this.webVideo.clientWidth,
      height = pipWindowConfig?.height ?? this.webVideo.clientHeight

    console.log('[docPIP_WH] pipWindowConfig', pipWindowConfig)
    // cw / ch = vw / vh
    const vw = this.webVideo.videoWidth,
      vh = this.webVideo.videoHeight

    switch (configStore.videoNoBorder) {
      // cw = vw / vh * ch
      case videoBorderType.height: {
        width = (vw / vh) * height
        break
      }
      // ch = vh / vw * cw
      case videoBorderType.width: {
        height = (vh / vw) * width
        break
      }
    }

    let pipWindow: Window
    let playerEl: HTMLElement | undefined

    if (isFirefoxTarget) {
      document.documentElement.setAttribute('dm-docpip-stage', 'request-window')
      console.log('[docPIP_WH] real width height', { width, height })
      pipWindow = await requestDocPIPWindow({
        width,
        height,
      })
      document.documentElement.setAttribute('dm-docpip-stage', 'init-player')
      this.pipWindow = pipWindow
      await this.miniPlayer.init()
      document.documentElement.setAttribute('dm-docpip-stage', 'player-inited')
      playerEl = this.miniPlayer.playerRootEl
    } else {
      await sendMessage(WebextEvent.beforeStartPIP, null)
      await this.miniPlayer.init()
      playerEl = this.miniPlayer.playerRootEl
      console.log('[docPIP_WH] real width height', { width, height })
      pipWindow = await requestDocPIPWindow({
        width,
        height,
      })
      this.pipWindow = pipWindow
    }

    if (!playerEl) {
      console.error('不正常的miniPlayer.init()，没有 playerEl', this.miniPlayer)
      throw Error('不正常的miniPlayer.init()')
    }

    // docPIP有自带的样式，需要覆盖掉。Firefox 需要先把样式放进
    // playerEl，再交给 MAIN world 移动到 DocPiP document。
    const docPIPRootStyle = createElement('style', {
      innerHTML: `body{
  margin: 0;
  background-color: #000;
}
video{
  width: 100%;
  height: 100%;
}
canvas{
  position: fixed;
  top: 0;
  left: 0;
  z-index: 10;
  width: 100%;
  pointer-events: none;
}`,
    })
    playerEl.appendChild(docPIPRootStyle)

    document.documentElement.setAttribute('dm-docpip-stage', 'append-player')
    await appendPlayerElToPIPWindow(pipWindow, playerEl)
    document.documentElement.setAttribute('dm-docpip-stage', 'player-appended')

    const resizePIP = (size: { width: number; height: number }) => {
      if (isFirefoxTarget) {
        try {
          pipWindow.resizeTo(size.width, size.height)
        } catch (error) {
          console.warn('Failed to resize Document PiP window', error)
        }
        return
      }
      return sendMessage(WebextEvent.resizeDocPIP, {
        ...size,
        docPIPWidth: pipWindow.innerWidth,
      })
    }

    const updatePIPRect = (rect: {
      width?: number
      height?: number
      left?: number
      top?: number
    }) => {
      if (isFirefoxTarget) {
        try {
          if (rect.width || rect.height) {
            pipWindow.resizeTo(
              rect.width ?? pipWindow.outerWidth,
              rect.height ?? pipWindow.outerHeight,
            )
          }
          if (rect.left != null || rect.top != null) {
            pipWindow.moveTo(
              rect.left ?? pipWindow.screenLeft,
              rect.top ?? pipWindow.screenTop,
            )
          }
        } catch (error) {
          console.warn('Failed to update Document PiP window rect', error)
        }
        return
      }
      return sendMessage(WebextEvent.updateDocPIPRect, {
        ...rect,
        docPIPWidth: pipWindow.innerWidth,
      })
    }

    if (isFirefoxTarget) {
      getBrowserSyncStorage(PIP_WINDOW_CONFIG).then((config) => {
        if (!config) return
        updatePIPRect({
          width: config.width,
          height: config.height,
          left: config.left,
          top: config.top,
        })
      })
    } else {
      // 这里await会莫名其妙使webVideo被暂停
      sendMessage(WebextEvent.afterStartPIP, {
        width: pipWindow.innerWidth,
      }).then(() => {
        switch (configStore.movePIPInOpen) {
          case MovePIPAfterOpenType.lastPos: {
            const [borX, borY] = getDocPIPBorderSize(pipWindow)
            console.log('borX, borY', borX, borY)

            let [realWidth, realHeight] = [width + borX, height + borY]

            // 低DPR屏幕到高DPR屏幕需要缩小wh，高到低就不需要😓
            if (
              pipWindowConfig?.pipDPR &&
              pipWindowConfig?.pipDPR > window.devicePixelRatio
            ) {
              realWidth = ~~(realWidth / pipWindowConfig?.pipDPR)
              realHeight = ~~(realHeight / pipWindowConfig?.pipDPR)
            }

            // ! 已经确定是chrome的bug，网页里第二次打开不会按照width和height来设置窗口大小，需要自己调整
            updatePIPRect({
              width: realWidth,
              height: realHeight,
              left: pipWindowConfig?.left,
              top: pipWindowConfig?.top,
            })
            break
          }
          case MovePIPAfterOpenType.custom: {
            const [borX, borY] = getDocPIPBorderSize(pipWindow)
            // ! 已经确定是chrome的bug，第二次打开不会按照width和height来设置窗口大小
            resizePIP({
              width: width + borX,
              height: height + borY,
            })

            this.addOnUnloadFn(
              autorun(() => {
                const [x, y] = (() => {
                  switch (configStore.movePIPInOpen_basePos) {
                    case Position['topLeft']:
                      return [0, 0]
                    case Position['topRight']:
                      return [screen.width - width, 0]
                    case Position['bottomLeft']:
                      return [0, screen.height - height]
                    case Position['bottomRight']:
                      return [screen.width - width, screen.height - height]
                  }
                })()

                updatePIPRect({
                  left: x + configStore.movePIPInOpen_offsetX,
                  top: y + configStore.movePIPInOpen_offsetY,
                })
              }),
            )
            break
          }
        }
      })
    }

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      e.stopPropagation()
      const isUp = e.deltaY < 0

      const {
        outerHeight: height,
        outerWidth: width,
        screenLeft: left,
        screenTop: top,
      } = pipWindow
      const scale = isUp ? 1.03 : 0.97

      const { width: sw, height: sh } = screen

      const x = sw / 2 - left > left + width - sw / 2 ? 'left' : 'right'
      const y = sh / 2 - top > top + height - sh / 2 ? 'top' : 'bottom'

      const [newWidth, newHeight] = calculateNewDimensions(width, height, scale)

      switch (`${x}${y}`) {
        case 'lefttop':
          resizePIP({
            height: newHeight,
            width: newWidth,
          })
          break
        case 'righttop': {
          const newLeft = left - (newWidth - width)
          updatePIPRect({
            height: newHeight,
            width: newWidth,
            left: newLeft,
          })
          break
        }
        case 'leftbottom': {
          const newTop = top - (newHeight - height)
          updatePIPRect({
            height: newHeight,
            width: newWidth,
            top: newTop,
          })
          break
        }
        case 'rightbottom': {
          const newLeft = left - (newWidth - width)
          const newTop = top - (newHeight - height)
          updatePIPRect({
            height: newHeight,
            width: newWidth,
            left: newLeft,
            top: newTop,
          })
        }
      }
    }
    pipWindow.addEventListener('wheel', handleWheel, {
      passive: false,
      capture: true,
    })

    // 挂载事件
    pipWindow.addEventListener('pagehide', () => {
      // 保存画中画的大小
      if (!this.isQuickHiding) {
        const [width, height] = [
          pipWindow.innerWidth + configStore.saveWidthOnDocPIPCloseOffset,
          pipWindow.innerHeight + configStore.saveHeightOnDocPIPCloseOffset,
        ]
        console.log('[docPIP_WH] save width and height', { width, height })
        setBrowserSyncStorage(PIP_WINDOW_CONFIG, {
          height,
          width,
          left: pipWindow.screenLeft,
          top: pipWindow.screenTop,
          mainDPR: window.devicePixelRatio,
          pipDPR: pipWindow.devicePixelRatio,
        })
      }
      this.emit(PlayerEvent.close)
      pipWindow.removeEventListener('wheel', handleWheel, { capture: true })
      sendMessage(WebextEvent.closePIP, null).catch(() => {})

      // 恢复原始标题
      document.title = title
    })
    pipWindow.addEventListener('resize', () => {
      this.emit(PlayerEvent.resize)
    })

    this.on(PlayerEvent.close, () => {
      try {
        pipWindow.close()
      } catch (error) {}
    })

    const keepAlive = setInterval(() => {
      sendMessage(WebextEvent.keepAlive, null)
    }, 1000)
    this.addOnUnloadFn(() => {
      clearInterval(keepAlive)
    })
  }

  override close(): void {
    this.pipWindow?.close?.()
  }
}
