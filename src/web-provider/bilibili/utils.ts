import { getVideoInfoFromUrl } from '@pkgs/danmakuGetter/apiDanmaku/bilibili/BilibiliVideo'
import { DanmakuInitData } from '@root/core/danmaku/DanmakuEngine'
import type { SubtitleItem } from '@root/core/SubtitleManager/types'
import { getBiliBiliVideoDanmu } from '@root/danmaku/bilibili/videoBarrageClient/bilibili-api'
import { DanmakuStack } from '@root/danmaku/bilibili/videoBarrageClient/bilibili-evaolved/converter/danmaku-stack'
import { DanmakuType } from '@root/danmaku/bilibili/videoBarrageClient/bilibili-evaolved/converter/danmaku-type'
import {
  JsonDanmaku,
  getTextByType,
} from '@root/danmaku/bilibili/videoBarrageClient/bilibili-evaolved/download/utils'
import configStore from '@root/store/config'
import PostMessageEvent from '@root/shared/postMessageEvent'
import { onceCall, wait } from '@root/utils'
import AssParser from '@root/utils/AssParser'
import { onPostMessage, postMessageToTop } from '@root/utils/windowMessages'

const isFirefoxTarget = process.env.EXTENSION_TARGET === 'firefox'

const videoInfoReqCache = new Map<string, any>()

const cacheFetch: (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<any> = async (...args) => {
  const url = args[0].toString()
  if (videoInfoReqCache.has(url)) {
    return videoInfoReqCache.get(url)
  }
  const res = fetch(...args).then((res) => res.json())
  videoInfoReqCache.set(url, res)
  return res
}

export interface BiliBiliSubtitleRes {
  font_size: number
  font_color: string
  background_alpha: number
  background_color: string
  stroke: string
  body: Body[]
}
interface Body {
  from: number
  to: number
  location: number
  content: string
}
export const getSubtitles = async (
  url = location.href,
): Promise<SubtitleItem[]> => {
  const { aid, cid } = await getVideoInfoFromUrl(url)
  const infoData = await fetch(
    `https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`,
    {
      credentials: 'include',
    },
  )
    .then((res) => res.json())
    .then((res) => res.data)

  const subtitles = infoData.subtitle?.subtitles ?? []
  console.log('subtitles', subtitles)
  return subtitles.map((s: any) => ({
    label: s.lan_doc,
    value: s.subtitle_url,
  }))
}

export function getSubtitle(url: string): Promise<BiliBiliSubtitleRes> {
  return fetch(url).then((res) => res.json())
}

export const getDanmakus = onceCall(async (aid: string, cid: string) => {
  document.documentElement.setAttribute('dm-bili-danmaku-fetch-stage', 'start')
  document.documentElement.setAttribute('dm-bili-danmaku-aid', aid)
  document.documentElement.setAttribute('dm-bili-danmaku-cid', cid)
  if (!configStore.biliVideoDansFromBiliEvaolved) {
    document.documentElement.setAttribute(
      'dm-bili-danmaku-fetch-stage',
      'list-so',
    )
    const danmakus = isFirefoxTarget
      ? await getBiliBiliVideoDanmuInPageWorld(cid)
      : await getBiliBiliVideoDanmu(cid)
    document.documentElement.setAttribute(
      'dm-bili-danmaku-fetch-stage',
      'done',
    )
    document.documentElement.setAttribute(
      'dm-bili-danmaku-fetch-count',
      String(danmakus.length),
    )
    return danmakus
  } else {
    // 走bili-evaolved的
    let danmuContent = await getTextByType(
      configStore.biliVideoPakkuFilter ? 'ass' : 'originJson',
      { aid, cid },
    )

    if (configStore.biliVideoPakkuFilter) {
      return new AssParser(danmuContent).dans
    } else {
      let jsonArr = JSON.parse(danmuContent) as JsonDanmaku['jsonDanmakus']
      return jsonArr.map((d) => {
        let type = DanmakuStack.danmakuType[d.mode as DanmakuType]

        return {
          color: '#' + d.color.toString(16),
          text: d.content,
          time: d.progress ? d.progress / 1000 : 0,
          type: type == 'top' ? 'top' : 'right',
        } as DanmakuInitData
      })
    }
  }
})

export async function getVideoInfoFromUrlInPageWorld(_url: string) {
  const id = createRequestId()
  document.documentElement.setAttribute('dm-bili-content-info-send', id)
  const response = await waitForPostMessage(
    PostMessageEvent.bilibiliVideoInfo_resp,
    id,
    () => {
      postMessageToTop(PostMessageEvent.bilibiliVideoInfo, {
        id,
        url: _url,
      })
    },
  )
  document.documentElement.setAttribute('dm-bili-content-info-recv', id)
  if (!response.isOk || !response.aid || !response.cid) {
    throw new Error(response.errMsg || 'Failed to get Bilibili video info')
  }
  return {
    aid: response.aid,
    bid: response.bid || '',
    cid: response.cid,
  }
}

async function getBiliBiliVideoDanmuInPageWorld(
  cid: string,
): Promise<DanmakuInitData[]> {
  const id = createRequestId()
  document.documentElement.setAttribute('dm-bili-content-danmaku-send', id)
  const response = await waitForPostMessage(
    PostMessageEvent.bilibiliDanmaku_resp,
    id,
    () => {
      postMessageToTop(PostMessageEvent.bilibiliDanmaku, {
        id,
        cid,
      })
    },
  )
  document.documentElement.setAttribute('dm-bili-content-danmaku-recv', id)
  if (!response.isOk || !response.danmakus) {
    throw new Error(response.errMsg || 'Failed to get Bilibili danmaku')
  }
  return response.danmakus as DanmakuInitData[]
}

function createRequestId() {
  return `dm-bili-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function waitForPostMessage<T extends PostMessageEvent>(
  type: T,
  id: string,
  send: () => void,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      unListen()
      reject(new Error(`Timed out waiting for ${type}`))
    }, 10000)
    const unListen = onPostMessage(type, (data: any) => {
      if (data.id !== id) return
      window.clearTimeout(timer)
      unListen()
      resolve(data)
    })
    send()
  })
}

const getBidAndAidFromURL = (url: URL) => {
  // /list/* 列表播放模式的bvid在query里
  if (url.searchParams.get('bvid')) {
    return { bid: url.searchParams.get('bvid'), aid: '' }
  }

  const urlPathnameArr = url.pathname.split('/')

  // bid 模式
  const bidParam = urlPathnameArr.find((p) => /^bv/i.test(p[0] + p[1]))
  if (bidParam) {
    return { bid: bidParam.replace(/bv/i, ''), aid: '' }
  }

  // aid 模式
  const aidParam = urlPathnameArr.find((p) => /^av/i.test(p[0] + p[1]))
  if (aidParam) {
    return { bid: '', aid: aidParam.replace(/av/i, '') }
  }

  return { bid: '', aid: '' }
}
