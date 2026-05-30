import { ATTR_DISABLE_INJECT_PIP, VIDEO_ID_ATTR } from '@root/shared/config'
import {
  formatDiagnosticError,
  setDiagnosticAttr,
} from '@root/shared/diagnostics'
import PostMessageEvent from '@root/shared/postMessageEvent'
import { tryCatch, uuid, wait } from '@root/utils'
import { postStartPIPDataMsg } from '@root/utils/pip'
import { onPostMessage, postMessageToTop } from '@root/utils/windowMessages'

let hasInit = false
let pendingDocPIPAppendCount = 0
const docPIPRootIdPattern = /^dm-docpip-root-[a-z0-9-]+$/i

function isBilibiliHost(hostname: string) {
  return hostname === 'bilibili.com' || hostname.endsWith('.bilibili.com')
}

function assertBilibiliPage() {
  if (!isBilibiliHost(location.hostname)) {
    throw new Error('Bilibili page-world request is only allowed on Bilibili')
  }
}

function assertBilibiliUrl(url: URL) {
  if (!isBilibiliHost(url.hostname)) {
    throw new Error('Bilibili request URL host is not allowed')
  }
}

function assertDocPIPRootId(id: string) {
  if (!docPIPRootIdPattern.test(id)) {
    throw new Error('Invalid DocPiP root id')
  }
}

function main() {
  if (hasInit) return
  hasInit = true
  const originReqPIP = HTMLVideoElement.prototype.requestPictureInPicture

  HTMLVideoElement.prototype.requestPictureInPicture = function () {
    const [cannotAccessTop] = tryCatch(() => top!.document)
    if (cannotAccessTop) return originReqPIP.bind(this)()

    if (!this.getAttribute(VIDEO_ID_ATTR)) {
      this.setAttribute(VIDEO_ID_ATTR, uuid())
    }

    // ? 很奇怪在agemys里requestPictureInPicture不能是async function，不然连第一行都没法运行
    return new Promise(async (res) => {
      postStartPIPDataMsg(
        null,
        this,
        'HTMLVideoElement.prototype.requestPictureInPicture',
      )
      const [{ isOk }] = await onPostMessage(
        PostMessageEvent.startPIPFromFloatButton_resp,
      )
      if (isOk) return res(window as any as PictureInPictureWindow)
      return res(originReqPIP.bind(this)())
    })
  }

  onPostMessage(PostMessageEvent.openDocPIPWindow, async (data) => {
    setDiagnosticAttr('dm-docpip-main-open-request', data.id)
    try {
      assertDocPIPRootId(data.id)
      const pipWindow = await window.documentPictureInPicture.requestWindow({
        width: data.width,
        height: data.height,
      })
      pendingDocPIPAppendCount += 1
      setDiagnosticAttr('dm-docpip-main-opened', 'true')
      postMessageToTop(PostMessageEvent.openDocPIPWindow_resp, {
        id: data.id,
        isOk: true,
        innerWidth: pipWindow.innerWidth,
        innerHeight: pipWindow.innerHeight,
      })
    } catch (error) {
      setDiagnosticAttr('dm-docpip-main-open-error', formatDiagnosticError(error))
      postMessageToTop(PostMessageEvent.openDocPIPWindow_resp, {
        id: data.id,
        isOk: false,
        errMsg: formatDiagnosticError(error),
      })
    }
  })

  onPostMessage(PostMessageEvent.appendDocPIPRoot, (data) => {
    setDiagnosticAttr('dm-docpip-main-request', data.id)
    try {
      assertDocPIPRootId(data.id)
      if (pendingDocPIPAppendCount < 1) {
        throw new Error('DocPiP root append was not opened by this session')
      }
      const playerEl = document.getElementById(data.id)
      if (!playerEl) throw new Error(`DocPiP root not found: ${data.id}`)

      setDiagnosticAttr('dm-docpip-main-found-root', 'true')
      const pipDocument = window.documentPictureInPicture?.window?.document
      if (!pipDocument?.body) throw new Error('DocPiP document is not ready')

      setDiagnosticAttr('dm-docpip-main-has-document', 'true')
      pipDocument.body.appendChild(playerEl)
      setDiagnosticAttr('dm-docpip-main-appended', 'true')
      if (data.styleText) {
        playerEl.setAttribute('style', data.styleText)
      } else {
        playerEl.removeAttribute('style')
      }

      postMessageToTop(PostMessageEvent.appendDocPIPRoot_resp, {
        id: data.id,
        isOk: true,
        bodyChildren: pipDocument.body.children.length,
      })
      pendingDocPIPAppendCount -= 1
    } catch (error) {
      setDiagnosticAttr('dm-docpip-main-error', formatDiagnosticError(error))
      postMessageToTop(PostMessageEvent.appendDocPIPRoot_resp, {
        id: data.id,
        isOk: false,
        errMsg: formatDiagnosticError(error),
      })
    }
  })

  onPostMessage(PostMessageEvent.bilibiliVideoInfo, async (data) => {
    setDiagnosticAttr('dm-bili-main-info-request', data.id)
    try {
      assertBilibiliPage()
      const url = new URL(data.url)
      assertBilibiliUrl(url)
      const pid = +(url.searchParams.get('p') ?? 1)
      const urlPathnameArr = url.pathname.split('/')
      const bidParam = urlPathnameArr.find((p) => /^bv/i.test(p[0] + p[1]))
      const aidParam = urlPathnameArr.find((p) => /^av/i.test(p[0] + p[1]))
      const videoInfo = new URL('https://api.bilibili.com/x/web-interface/view')

      if (url.searchParams.get('bvid')) {
        videoInfo.searchParams.set('bvid', url.searchParams.get('bvid')!)
      } else if (bidParam) {
        videoInfo.searchParams.set('bvid', bidParam)
      } else if (aidParam) {
        videoInfo.searchParams.set('aid', aidParam.replace(/av/i, ''))
      }

      setDiagnosticAttr('dm-bili-main-info-url', videoInfo.toString())
      const res = await fetch(videoInfo.toString(), {
        credentials: 'include',
      }).then((response) => response.json())
      const info = res.data
      const pages = info.pages ?? []
      const cid = pid === 1 ? info.cid : pages[pid - 1]?.cid || info.cid
      setDiagnosticAttr('dm-bili-main-info-done', data.id)
      setDiagnosticAttr('dm-bili-main-info-aid', info.aid)
      setDiagnosticAttr('dm-bili-main-info-cid', cid)
      postMessageToTop(PostMessageEvent.bilibiliVideoInfo_resp, {
        id: data.id,
        isOk: true,
        aid: info.aid,
        bid: info.bvid,
        cid,
      })
    } catch (error) {
      setDiagnosticAttr('dm-bili-main-info-error', formatDiagnosticError(error))
      postMessageToTop(PostMessageEvent.bilibiliVideoInfo_resp, {
        id: data.id,
        isOk: false,
        errMsg: formatDiagnosticError(error),
      })
    }
  })

  onPostMessage(PostMessageEvent.bilibiliDanmaku, async (data) => {
    setDiagnosticAttr('dm-bili-main-danmaku-request', data.id)
    setDiagnosticAttr('dm-bili-main-danmaku-cid', data.cid)
    try {
      assertBilibiliPage()
      if (!/^\d+$/.test(data.cid)) throw new Error('Invalid Bilibili cid')
      const xmlText = await fetch(
        `https://api.bilibili.com/x/v1/dm/list.so?oid=${data.cid}`,
        {
          credentials: 'include',
        },
      ).then((response) => response.text())
      const doc = new DOMParser().parseFromString(xmlText, 'text/xml')
        .documentElement
      const ignoreTypes = new Set(['6', '7', '8', '9'])
      const danmakus = Array.from(doc.querySelectorAll('d'))
        .map((xmlDan) => {
          const attr = xmlDan.getAttribute('p')
          if (!attr) return null
          const [startTime, danmakuType, , color] = attr.split(',')
          if (ignoreTypes.has(danmakuType)) return null
          return {
            color: '#' + (+color).toString(16).padStart(6, '0'),
            text: xmlDan.textContent || '',
            time: +startTime,
            type: danmakuType === '4' || danmakuType === '5' ? 'top' : 'right',
          }
        })
        .filter(Boolean)
        .sort((a, b) => a!.time - b!.time)

      setDiagnosticAttr('dm-bili-main-danmaku-done', data.id)
      setDiagnosticAttr(
        'dm-bili-main-danmaku-count',
        String(danmakus.length),
      )
      postMessageToTop(PostMessageEvent.bilibiliDanmaku_resp, {
        id: data.id,
        isOk: true,
        danmakus,
      })
    } catch (error) {
      setDiagnosticAttr('dm-bili-main-danmaku-error', formatDiagnosticError(error))
      postMessageToTop(PostMessageEvent.bilibiliDanmaku_resp, {
        id: data.id,
        isOk: false,
        errMsg: formatDiagnosticError(error),
      })
    }
  })
}

if (!document.documentElement.getAttribute(ATTR_DISABLE_INJECT_PIP)) {
  main()
} else {
  const observer = new MutationObserver((mutations) => {
    if (document.documentElement.getAttribute(ATTR_DISABLE_INJECT_PIP)) return
    main()
    observer.disconnect()
  })
  observer.observe(document.documentElement, {
    attributes: true,
  })
}
