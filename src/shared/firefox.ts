export const FIREFOX_ADDON_ID = 'dmminiplayer-firefox@local'
export const FIREFOX_MIN_VERSION = '151.0'

export const FIREFOX_CONTENT_SCRIPT_PLAN = [
  {
    js: ['entry-init-ext-config.js'],
    run_at: 'document_start',
    matches: ['<all_urls>'],
    all_frames: true,
  },
  {
    js: ['entry-inject-top.js'],
    run_at: 'document_start',
    world: 'MAIN',
    matches: ['<all_urls>'],
  },
  {
    js: ['entry-inject-all-frames-top.js'],
    run_at: 'document_start',
    world: 'MAIN',
    matches: ['<all_urls>'],
    all_frames: true,
  },
  {
    js: ['entry-all-frames.js'],
    run_at: 'document_end',
    matches: ['<all_urls>'],
    all_frames: true,
  },
  {
    js: ['clogInject.js'],
    run_at: 'document_end',
    matches: ['<all_urls>'],
    all_frames: true,
  },
  {
    js: ['main.js'],
    run_at: 'document_end',
    matches: ['<all_urls>'],
    all_frames: true,
  },
] as const
