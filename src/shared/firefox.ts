export const FIREFOX_ADDON_ID = '@dmminiplayer-firefox'
export const FIREFOX_MIN_VERSION = '151.0'

const isFirefoxDiagnosticsBuild =
  process.env.ENABLE_FIREFOX_DIAGNOSTICS === '1' ||
  process.env.ENABLE_FIREFOX_DIAGNOSTICS === 'true'

export const FIREFOX_BILIBILI_PAGE_MATCHES = [
  '*://bilibili.com/*',
  '*://*.bilibili.com/*',
] as const

export const FIREFOX_DIAGNOSTIC_PAGE_MATCHES = [
  'http://127.0.0.1/*',
  'http://localhost/*',
] as const

export const FIREFOX_PAGE_MATCHES = [
  ...FIREFOX_BILIBILI_PAGE_MATCHES,
  ...(isFirefoxDiagnosticsBuild ? FIREFOX_DIAGNOSTIC_PAGE_MATCHES : []),
] as const

export const FIREFOX_BILIBILI_HOST_PERMISSIONS = [
  ...FIREFOX_PAGE_MATCHES,
  '*://*.hdslb.com/*',
] as const

export const FIREFOX_WEB_ACCESSIBLE_RESOURCE_MATCHES = [
  ...FIREFOX_PAGE_MATCHES,
] as const

export const FIREFOX_WEB_ACCESSIBLE_RESOURCES = [
  'assets/**/*',
  'assets/*',
  '*.css',
  'clogInject.js',
  'main.js',
] as const

export const FIREFOX_CONTENT_SCRIPT_PLAN = [
  {
    js: ['entry-init-ext-config.js'],
    run_at: 'document_start',
    matches: FIREFOX_PAGE_MATCHES,
    all_frames: true,
  },
  {
    js: ['entry-inject-top.js'],
    run_at: 'document_start',
    world: 'MAIN',
    matches: FIREFOX_PAGE_MATCHES,
  },
  {
    js: ['entry-inject-all-frames-top.js'],
    run_at: 'document_start',
    world: 'MAIN',
    matches: FIREFOX_PAGE_MATCHES,
    all_frames: true,
  },
  {
    js: ['entry-all-frames.js'],
    run_at: 'document_end',
    matches: FIREFOX_PAGE_MATCHES,
    all_frames: true,
  },
  {
    js: ['clogInject.js'],
    run_at: 'document_end',
    matches: FIREFOX_PAGE_MATCHES,
    all_frames: true,
  },
  {
    js: ['main.js'],
    run_at: 'document_end',
    matches: FIREFOX_PAGE_MATCHES,
    all_frames: true,
  },
] as const
