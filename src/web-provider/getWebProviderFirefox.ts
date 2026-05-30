import { WebProvider } from '@root/core/WebProvider'
import { getProviderConfig } from '@root/shared/providerConfig'
import BilibiliLiveProvider from './bilibili/live'
import BilibiliVideoProvider from './bilibili/video'
import CommonProvider from './common'

export default function getWebProvider(): WebProvider {
  const providerKey = getProviderConfig(location.href)

  switch (providerKey) {
    case 'bilibili-live':
      return new BilibiliLiveProvider()
    case 'bilibili-video':
      return new BilibiliVideoProvider()
    default:
      return new CommonProvider()
  }
}
