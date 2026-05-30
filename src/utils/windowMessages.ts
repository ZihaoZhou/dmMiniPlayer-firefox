import PostMessageEvent, {
  PostMessageProtocolMap,
} from '@root/shared/postMessageEvent'
import { isArray } from '@root/utils/lodash'
import mitt from 'mitt'
import Events2 from './Events2'
import { dq, isUndefined } from '.'

const ID = 'dmMiniPlayer'

export function postMessageToTop<
  T extends PostMessageEvent,
  data extends PostMessageProtocolMap[T],
>(...[type, data]: data extends undefined ? [T] : [T, data]) {
  return top?.postMessage(
    {
      ID,
      type,
      data,
    },
    '*',
  )
}

export function postMessageToChild<
  T extends PostMessageEvent,
  data extends PostMessageProtocolMap[T],
>(
  ...[type, data, target]: data extends undefined
    ? [T, undefined?, Window?]
    : [T, data, Window?]
) {
  let targets = !isUndefined(target)
    ? isArray(target)
      ? target
      : [target]
    : dq('iframe').map((iframe) => iframe.contentWindow!)

  const sendOk: Window[] = []
  targets.forEach((target) => {
    try {
      target!.postMessage(
        {
          ID,
          type,
          data,
        },
        '*',
      )
      sendOk.push(target)
    } catch (error) {}
  })
  return sendOk
}

const eventSource = new Events2()
window.addEventListener('message', (event) => {
  try {
    const data = event.data
    if (data?.ID !== ID) return
    eventSource.emit(data.type, {
      data: data.data,
      source: event.source,
    })
  } catch (error) {
    // Some pages post cross-origin wrapped objects whose getters can throw.
    // Ignore those unrelated messages instead of breaking our bridge.
  }
})

export function onPostMessage<T extends PostMessageEvent>(
  type: T,
  callback: (data: PostMessageProtocolMap[T], source: Window) => void,
): () => void
export function onPostMessage<T extends PostMessageEvent>(
  type: T,
): Promise<[data: PostMessageProtocolMap[T], source: Window]>
export function onPostMessage<T extends PostMessageEvent>(
  type: T,
  callback?: (data: PostMessageProtocolMap[T], source: Window) => void,
) {
  if (callback)
    return eventSource.on2(type as any, ({ data, source }: any) => {
      callback(data, source)
    })

  return new Promise((resolve) => {
    const unListen = eventSource.on2(type as any, ({ data, source }: any) => {
      resolve([data, source])
      unListen()
    })
  })
}
