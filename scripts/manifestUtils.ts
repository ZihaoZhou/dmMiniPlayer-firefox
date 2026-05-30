import { createManifest } from '../src/manifest'
import { extensionTarget } from './buildTarget'

export function createBuildManifest(
  resources: string[],
  options: { includeScripting?: boolean } = {},
) {
  const manifest = createManifest(extensionTarget)

  manifest.web_accessible_resources = [
    {
      resources,
      matches: ['<all_urls>'],
    },
    {
      resources: ['assets/icon.png'],
      matches: ['<all_urls>'],
    },
  ]

  if (options.includeScripting) {
    manifest.permissions = Array.from(
      new Set([...(manifest.permissions ?? []), 'scripting']),
    )
  }

  return manifest
}
