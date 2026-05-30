import { execFileSync } from 'node:child_process'
import fs from 'fs-extra'
import packageJson from '../package.json' with { type: 'json' }
import { pr } from './utils.mjs'

const status = execFileSync('git', ['status', '--porcelain'], {
  encoding: 'utf8',
}).trim()

if (status) {
  throw new Error('Refusing to create source archive from a dirty worktree')
}

const outputDir = pr('../build')
const output = pr(
  outputDir,
  `firefox-source-${packageJson.version}.zip`,
)

fs.ensureDirSync(outputDir)
fs.removeSync(output)

execFileSync('git', ['archive', '--format=zip', `--output=${output}`, 'HEAD'], {
  stdio: 'inherit',
})

console.log(`Created ${output}`)
