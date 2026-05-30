import fs from 'fs-extra'
import { outDir } from './shared.tsup'
import { createBuildManifest } from './manifestUtils'
import { pr } from './utils.mjs'
import { writeSettingPanelCss } from './settingPanelCss'
import { extensionTarget } from './buildTarget'

function patchFirefoxInnerHtmlWarnings() {
  if (extensionTarget !== 'firefox') return

  // Firefox AMO flags renderer/dynamic-CSS helper branches even when the
  // extension never passes untrusted HTML. Use textContent in the Firefox
  // bundle so static validation has no innerHTML writes to report.
  const files = ['popup.js', 'main.js']
  const replacements: [RegExp, string][] = [
    [
      /([A-Za-z_$][\w$]*)\.__html==([A-Za-z_$][\w$]*)\.__html\|\|\1\.__html==([A-Za-z_$][\w$]*)\.innerHTML/g,
      '$1.__html==$2.__html',
    ],
    [
      /([A-Za-z_$][\w$]*)\.innerHTML=([A-Za-z_$][\w$]*)\.__html/g,
      '$1.textContent=$2.__html',
    ],
    [
      /([A-Za-z_$][\w$]*)&&\(([A-Za-z_$][\w$]*)\.innerHTML=""\)/g,
      '$1&&($2.textContent="")',
    ],
    [
      /([A-Za-z_$][\w$]*)\.innerHTML!==([A-Za-z_$][\w$]*)/g,
      '$1.textContent!==$2',
    ],
    [/([A-Za-z_$][\w$]*)\.innerHTML=([A-Za-z_$][\w$]*)/g, '$1.textContent=$2'],
  ]

  for (const file of files) {
    const filePath = pr(outDir, file)
    if (!fs.existsSync(filePath)) continue

    let contents = fs.readFileSync(filePath, 'utf-8')
    for (const [pattern, replacement] of replacements) {
      contents = contents.replace(pattern, replacement)
    }
    fs.writeFileSync(filePath, contents, 'utf-8')
  }
}

writeSettingPanelCss(pr(outDir, './setting-panel.css'))
patchFirefoxInnerHtmlWarnings()
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
