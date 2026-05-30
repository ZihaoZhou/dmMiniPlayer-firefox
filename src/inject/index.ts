import { injectFunction } from '@root/utils/injectFunction'
import { get } from '@root/utils'
import { onMessage_inject, sendMessage_inject } from './injectListener'
import './eventHacker'
import './createElementHacker'
import './netflix'
// import './fetchHacker'

if (process.env.EXTENSION_TARGET !== 'firefox') {
  onMessage_inject('run-code', async (data) => {
    // console.log('runFn', data)
    let fn = new Function(`return (${data.function})(...arguments)`)

    let rs = await fn(...(data.args ?? []))
    return rs
  })
}

function getDeeperGetter(obj: any, key: string) {
  if (!obj) return undefined
  const val = Object.getOwnPropertyDescriptor(obj, key)
  if (val && val.get) return val.get
  return getDeeperGetter(Object.getPrototypeOf(obj), key)
}

onMessage_inject('document-visibility:force-visible', () => {
  try {
    const originGetter = getDeeperGetter(document, 'visibilityState')
    window.__restoreDocumentVisibilityStateGetter = () => {
      Object.defineProperty(document, 'visibilityState', {
        get: originGetter,
      })
    }
  } catch (error) {
    console.error('没法设置还原document.visibilityState的getter', error)
  }

  try {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get() {
        return 'visible'
      },
    })
  } catch (error) {
    console.error('没法注入document.visibilityState的getter', error)
  }
})

onMessage_inject('document-visibility:restore', () => {
  if (window.__restoreDocumentVisibilityStateGetter) {
    window.__restoreDocumentVisibilityStateGetter()
  } else {
    console.error('没有找到window.__restoreDocumentVisibilityStateGetter')
  }
})

onMessage_inject('document-visibility:dispatch-change', () => {
  document.dispatchEvent(new Event('visibilitychange'))
})

onMessage_inject('get-data', (data) => {
  const rs = get(window, data.keys.join('.'))
  return rs
})

onMessage_inject('msg-test', (data) => {
  console.log('top window msg-test log', data)
  return data
})

onMessage_inject('inject-api:run', (data) => {
  injectFunction(get(window, data.origin) as any, data.keys, (...args) => {
    sendMessage_inject('inject-api:onTrigger', {
      args,
      event: data.onTriggerEvent,
    })
  })
})

try {
  const HISTORY_INJECT_SITE = [
    'https://www.youtube.com',
    'https://www.bilibili.com',
    'https://ddys.art',
    'https://ddys.pro',
    // 'https://www.netflix.com',
  ]

  // youtube的history.pushState是提前存好地址了的，这后面再改就没用了，所以需要提前修改
  if (HISTORY_INJECT_SITE.includes(window.location.origin)) {
    try {
      console.log('💀 history inject')
      injectFunction(
        get(window, 'history') as any,
        ['pushState', 'forward', 'replaceState'],
        (...args) => {
          sendMessage_inject('inject-api:onTrigger', {
            args,
            event: 'history',
          })
        },
      )

      History.prototype.pushState = history.pushState
      History.prototype.replaceState = history.replaceState
      History.prototype.forward = history.forward
    } catch (error) {}
  }
} catch (error) {
  console.error(error)
}

// chrome.scripting.executeScript({
//   world: ''
// })

// ;(()=>{
//   let code = `let rsv = new Function('return 1')()`
//   let file = new File([code], 'test.js', { type: 'text/javascript' })
//   let src = URL.createObjectURL(file)

//   let myPolicy = trustedTypes.createPolicy('myPolicy', {
//     createHTML: (string) => string, // Or implement sanitization logic here
//     createScriptURL: (string) => string,
//     createScript: (string) => string,
//   })

//   let el = document.createElement('script')
//   // let txt = myPolicy.createScript(`let rsv = new Function('return 1')()`)
//   let txt = myPolicy.createScriptURL(src)

//   el.src = txt
//   // el.innerHTML = txt
//   document.body.appendChild(el)
// })()
