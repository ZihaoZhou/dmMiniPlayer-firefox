import { Nullable } from './typeUtils'
import Browser from 'webextension-polyfill'

export const mv3MoveTabsToPosition = (
  tab: chrome.tabs.Tab,
  position: [number, number],
) => {
  return Browser.windows.update(tab.windowId, {
    left: position[0],
    top: position[1],
  })
}

export const mv3UpdateTab = (
  tab: chrome.tabs.Tab,
  data: chrome.windows.UpdateInfo,
) => {
  return Browser.windows.update(tab.windowId, data)
}

export const mv3ResizeTabs = (
  tab: chrome.tabs.Tab,
  position: { width: number; height: number },
) => {
  return Browser.windows.update(tab.windowId, {
    width: position.width,
    height: position.height,
  })
}

const sensitive = 3
export const mv3GetDocPIPTab = (
  /**chrome系统页和docPIP属性都一样的，只能通过width判断了 */
  width: number,
) => {
  const id = getDocPIPTabId()
  console.log('id', id)
  return id
    ? Browser.tabs.get(id)
    : Browser.tabs.query({ active: true }).then((tabs) => {
        // 😅莫名其妙的实际width会少1
        return tabs.find(
          (tab) =>
            (tab.width ?? 0) + sensitive >= width &&
            (tab.width ?? 0) <= width + sensitive,
        )
      })
}

let docPIPTabId: Nullable<number> = null
export const getDocPIPTabId = () => docPIPTabId
export const setDocPIPTabId = (id: Nullable<number>) => {
  docPIPTabId = id
}
