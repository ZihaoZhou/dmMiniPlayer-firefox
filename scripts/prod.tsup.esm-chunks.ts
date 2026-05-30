import { defineConfig } from 'tsup'
import { omit } from '@root/utils'
import { shareConfig } from './shared.tsup'
import { extensionTarget } from './buildTarget'

const omittedEntries = [
  'entry-inject-all-frames-top',
  'entry-inject-top',
  'entry-all-frames',
  'entry-init-ext-config',
]

if (extensionTarget === 'firefox') {
  omittedEntries.push('main', 'clogInject')
}

export default defineConfig({
  ...shareConfig,
  entry: omit(shareConfig.entry, omittedEntries as any),
  treeshake: true,
  splitting: true,
  format: 'esm',
})
