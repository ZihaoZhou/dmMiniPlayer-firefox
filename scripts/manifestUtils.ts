import { createManifest } from '../src/manifest'
import {
  FIREFOX_WEB_ACCESSIBLE_RESOURCE_MATCHES,
  FIREFOX_WEB_ACCESSIBLE_RESOURCES,
} from '../src/shared/firefox'
import { extensionTarget } from './buildTarget'

export function createBuildManifest(
  resources: string[],
  options: { includeScripting?: boolean } = {},
) {
  const manifest = createManifest(extensionTarget)
  const webAccessibleMatches =
    extensionTarget === 'firefox'
      ? [...FIREFOX_WEB_ACCESSIBLE_RESOURCE_MATCHES]
      : ['<all_urls>']

  manifest.web_accessible_resources =
    extensionTarget === 'firefox'
      ? [
          {
            resources: [...FIREFOX_WEB_ACCESSIBLE_RESOURCES],
            matches: webAccessibleMatches,
          },
        ]
      : [
          {
            resources,
            matches: webAccessibleMatches,
          },
          {
            resources: ['assets/icon.png'],
            matches: webAccessibleMatches,
          },
        ]

  if (options.includeScripting) {
    manifest.permissions = Array.from(
      new Set([...(manifest.permissions ?? []), 'scripting']),
    )
  }

  return manifest
}
