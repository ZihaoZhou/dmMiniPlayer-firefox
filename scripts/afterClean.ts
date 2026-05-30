import fs from 'fs-extra'
import { outDir } from './shared.tsup'
import { createBuildManifest } from './manifestUtils'
import { pr } from './utils.mjs'
import { writeSettingPanelCss } from './settingPanelCss'
import { extensionTarget } from './buildTarget'

writeSettingPanelCss(pr(outDir, './setting-panel.css'))
fs.writeJSONSync(
  pr(outDir, './build-info.json'),
  {
    diagnostics:
      process.env.ENABLE_FIREFOX_DIAGNOSTICS === '1' ||
      process.env.ENABLE_FIREFOX_DIAGNOSTICS === 'true',
    target: extensionTarget,
  },
  { spaces: 2 },
)

const manifest = createBuildManifest(fs.readdirSync(pr(outDir)))
fs.writeJSONSync(pr(outDir, './manifest.json'), manifest, { spaces: 2 })
