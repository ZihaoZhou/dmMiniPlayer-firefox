import type { ExtensionTarget } from '../manifest'

export const extensionTarget: ExtensionTarget =
  process.env.EXTENSION_TARGET === 'firefox' ? 'firefox' : 'chrome'

export const isFirefoxTarget = extensionTarget === 'firefox'
