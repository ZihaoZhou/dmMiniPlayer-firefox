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
const manifestPath = pr(codeBuildOutDir, 'manifest.json')
const buildInfoPath = pr(codeBuildOutDir, 'build-info.json')

if (!fs.existsSync(zipOutDir)) {
  fs.mkdirSync(zipOutDir)
}

function validateBuildTarget() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Build manifest not found: ${manifestPath}`)
  }

  const manifest = fs.readJSONSync(manifestPath)
  const buildInfo = fs.existsSync(buildInfoPath)
    ? fs.readJSONSync(buildInfoPath)
    : null
  const isFirefoxBuild = !!manifest.browser_specific_settings?.gecko
  if (buildInfo?.target && buildInfo.target !== target) {
    throw new Error(
      `Refusing to create a ${target} archive from a ${buildInfo.target} dist`,
    )
  }
  if (target === 'firefox' && !isFirefoxBuild) {
    throw new Error('Refusing to create a Firefox archive from a non-Firefox dist')
  }
  if (target === 'chrome' && isFirefoxBuild) {
    throw new Error('Refusing to create a Chrome archive from a Firefox dist')
  }
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
  validateBuildTarget()

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
