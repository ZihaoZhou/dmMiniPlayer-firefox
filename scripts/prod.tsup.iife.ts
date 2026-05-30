import { omit, pick } from '@root/utils'
import { defineConfig } from 'tsup'
import { shareConfig } from './shared.tsup'
import { extensionTarget } from './buildTarget'
import { pr } from './utils.mjs'

const iifeEntries = [
  'entry-inject-all-frames-top',
  'entry-inject-top',
  'entry-all-frames',
  'entry-init-ext-config',
]

if (extensionTarget === 'firefox') {
  iifeEntries.push('clogInject', 'main')
}

const entry = pick(shareConfig.entry, iifeEntries as any)
if (extensionTarget === 'firefox') {
  entry.main = pr('../src/contents/mainFirefox.ts')
}

export default defineConfig({
  ...omit(shareConfig, ['onSuccess']),
  entry,
  treeshake: true,
  splitting: false,
  clean: false,
  format: 'iife',
})
