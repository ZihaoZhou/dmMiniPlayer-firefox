import fs from 'fs-extra'
import { pr } from './utils.mjs'

const settingPanelFontFamily =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'

const settingPanelFontOverride = `
:host,
.render-root,
.render-root *,
.setting-panel,
.setting-panel * {
  font-family: ${settingPanelFontFamily};
}

.setting-panel button,
.setting-panel input,
.setting-panel select,
.setting-panel textarea {
  font-family: inherit;
}
`

export function writeSettingPanelCss(outputFile: string) {
  const css = fs.readFileSync(
    pr('../node_modules/@apad/setting-panel/lib/index.css'),
    'utf-8',
  )

  fs.writeFileSync(outputFile, `${css}\n${settingPanelFontOverride}`, 'utf-8')
}
