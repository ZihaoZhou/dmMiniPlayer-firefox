import { ATTR_DISABLE_INJECT_PIP, VIDEO_ID_ATTR } from '@root/shared/config'
import PostMessageEvent from '@root/shared/postMessageEvent'
import { tryCatch, uuid, wait } from '@root/utils'
import { postStartPIPDataMsg } from '@root/utils/pip'
import { onPostMessage, postMessageToTop } from '@root/utils/windowMessages'

let hasInit = false
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
    document.documentElement.setAttribute('dm-docpip-main-open-request', data.id)
    try {
      const pipWindow = await window.documentPictureInPicture.requestWindow({
        width: data.width,
        height: data.height,
      })
      document.documentElement.setAttribute('dm-docpip-main-opened', 'true')
      postMessageToTop(PostMessageEvent.openDocPIPWindow_resp, {
        id: data.id,
        isOk: true,
        innerWidth: pipWindow.innerWidth,
        innerHeight: pipWindow.innerHeight,
      })
    } catch (error) {
      document.documentElement.setAttribute(
        'dm-docpip-main-open-error',
        ((error as any)?.toString && (error as any).toString()) ||
          (error as Error)?.message ||
          String(error),
      )
      postMessageToTop(PostMessageEvent.openDocPIPWindow_resp, {
        id: data.id,
        isOk: false,
        errMsg:
          ((error as any)?.toString && (error as any).toString()) ||
          (error as Error)?.message ||
          String(error),
      })
    }
  })

  onPostMessage(PostMessageEvent.appendDocPIPRoot, (data) => {
    document.documentElement.setAttribute('dm-docpip-main-request', data.id)
    try {
      const playerEl = document.getElementById(data.id)
      if (!playerEl) throw new Error(`DocPiP root not found: ${data.id}`)

      document.documentElement.setAttribute('dm-docpip-main-found-root', 'true')
      const pipDocument = window.documentPictureInPicture?.window?.document
      if (!pipDocument?.body) throw new Error('DocPiP document is not ready')

      document.documentElement.setAttribute('dm-docpip-main-has-document', 'true')
      pipDocument.body.appendChild(playerEl)
      document.documentElement.setAttribute('dm-docpip-main-appended', 'true')
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
    } catch (error) {
      document.documentElement.setAttribute(
        'dm-docpip-main-error',
        ((error as any)?.toString && (error as any).toString()) ||
          (error as Error)?.message ||
          String(error),
      )
      postMessageToTop(PostMessageEvent.appendDocPIPRoot_resp, {
        id: data.id,
        isOk: false,
        errMsg:
          ((error as any)?.toString && (error as any).toString()) ||
          (error as Error)?.message ||
          String(error),
      })
    }
  })

  onPostMessage(PostMessageEvent.bilibiliVideoInfo, async (data) => {
    document.documentElement.setAttribute('dm-bili-main-info-request', data.id)
    try {
      const url = new URL(data.url)
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

      document.documentElement.setAttribute(
        'dm-bili-main-info-url',
        videoInfo.toString(),
      )
      const res = await fetch(videoInfo.toString(), {
        credentials: 'include',
      }).then((response) => response.json())
      const info = res.data
      const pages = info.pages ?? []
      const cid = pid === 1 ? info.cid : pages[pid - 1]?.cid || info.cid
      document.documentElement.setAttribute('dm-bili-main-info-done', data.id)
      document.documentElement.setAttribute('dm-bili-main-info-aid', info.aid)
      document.documentElement.setAttribute('dm-bili-main-info-cid', cid)
      postMessageToTop(PostMessageEvent.bilibiliVideoInfo_resp, {
        id: data.id,
        isOk: true,
        aid: info.aid,
        bid: info.bvid,
        cid,
      })
    } catch (error) {
      document.documentElement.setAttribute(
        'dm-bili-main-info-error',
        ((error as any)?.toString && (error as any).toString()) ||
          (error as Error)?.message ||
          String(error),
      )
      postMessageToTop(PostMessageEvent.bilibiliVideoInfo_resp, {
        id: data.id,
        isOk: false,
        errMsg:
          ((error as any)?.toString && (error as any).toString()) ||
          (error as Error)?.message ||
          String(error),
      })
    }
  })

  onPostMessage(PostMessageEvent.bilibiliDanmaku, async (data) => {
    document.documentElement.setAttribute('dm-bili-main-danmaku-request', data.id)
    document.documentElement.setAttribute('dm-bili-main-danmaku-cid', data.cid)
    try {
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

      document.documentElement.setAttribute('dm-bili-main-danmaku-done', data.id)
      document.documentElement.setAttribute(
        'dm-bili-main-danmaku-count',
        String(danmakus.length),
      )
      postMessageToTop(PostMessageEvent.bilibiliDanmaku_resp, {
        id: data.id,
        isOk: true,
        danmakus,
      })
    } catch (error) {
      document.documentElement.setAttribute(
        'dm-bili-main-danmaku-error',
        ((error as any)?.toString && (error as any).toString()) ||
          (error as Error)?.message ||
          String(error),
      )
      postMessageToTop(PostMessageEvent.bilibiliDanmaku_resp, {
        id: data.id,
        isOk: false,
        errMsg:
          ((error as any)?.toString && (error as any).toString()) ||
          (error as Error)?.message ||
          String(error),
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
