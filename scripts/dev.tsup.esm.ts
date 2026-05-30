import { defineConfig } from 'tsup'
import fs from 'fs-extra'
import { omit } from '@root/utils'
import { outDir, shareConfig } from './shared.tsup'
import { pr } from './utils.mjs'
import { outputListener } from './plugin/outputListener'
import { createBuildManifest } from './manifestUtils'
import { writeSettingPanelCss } from './settingPanelCss'

export default defineConfig({
  ...omit(shareConfig, ['onSuccess']),
  esbuildPlugins: [...shareConfig.esbuildPlugins, outputListener()],
  async onSuccess() {
    writeSettingPanelCss(pr(outDir, './setting-panel.css'))
    const manifest = createBuildManifest(fs.readdirSync(pr(outDir)), {
      includeScripting: true,
    })
    fs.writeJSONSync(pr(outDir, './manifest.json'), manifest, { spaces: 2 })
  },
  entry: {
    ...omit(shareConfig.entry, ['entry-all-frames']),
    'inject-top': pr('../src/contents/inject-top.ts'),
    'inject-all-frames-top': pr('../src/contents/inject-all-frames-top.ts'),
  },
  treeshake: false,
  minify: false,
  watch: true,
  splitting: false,
  clean: false,
})
