import fs from 'fs-extra'
import { outDir } from './shared.tsup'
import { createBuildManifest } from './manifestUtils'
import { pr } from './utils.mjs'
import { writeSettingPanelCss } from './settingPanelCss'

writeSettingPanelCss(pr(outDir, './setting-panel.css'))

const manifest = createBuildManifest(fs.readdirSync(pr(outDir)))
fs.writeJSONSync(pr(outDir, './manifest.json'), manifest, { spaces: 2 })
