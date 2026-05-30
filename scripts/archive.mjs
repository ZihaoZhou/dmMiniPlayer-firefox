import fs from 'fs-extra'
import archiver from 'archiver'
import packageData from '../package.json' with { type: 'json' }
import { pr } from './utils.mjs'

const args = process.argv.slice(2)
const isSizeTest = args.includes('--size-test')
const targetArg = args.find((arg) => arg.startsWith('--target'))
const target = targetArg?.includes('=')
  ? targetArg.split('=')[1]
  : targetArg
    ? args[args.indexOf(targetArg) + 1]
    : 'chrome'

const version = packageData.version
const getBuildName = (ver) => `${target}-mv3-prod-${ver}.zip`
const getSizeTestName = (ver) => `size-test-${ver}.zip`
const codeBuildOutDir = pr('../dist')
const zipOutDir = pr('../build')

if (!fs.existsSync(zipOutDir)) {
  fs.mkdirSync(zipOutDir)
}

const getName = () => {
  if (!isSizeTest) return getBuildName(version)
  let count = 0
  while (true) {
    const fileName = getSizeTestName(count)
    if (fs.existsSync(pr(zipOutDir, fileName))) {
      count++
      continue
    }
    return fileName
  }
}

async function main() {
  const archive = archiver('zip', {
    zlib: { level: 9 },
  })
  archive.pipe(fs.createWriteStream(pr(zipOutDir, getName())))
  archive.directory(codeBuildOutDir, false)
  await archive.finalize()
  if (!isSizeTest) {
    fs.readdirSync(zipOutDir)
      .filter((fileName) => /^size-test-.*\.zip$/.test(fileName))
      .forEach((fileName) => fs.removeSync(pr(zipOutDir, fileName)))
  }
}

main()
