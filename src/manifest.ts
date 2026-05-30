import packageJson from '../package.json'

const version = packageJson.version
export type ExtensionTarget = 'chrome' | 'firefox'

export function createManifest(
  target: ExtensionTarget = 'chrome',
): chrome.runtime.ManifestV3 {
  const manifest: chrome.runtime.ManifestV3 = {
    name: '__MSG_appName__',
    description: '__MSG_appDesc__',
    author: 'apades' as any,
    manifest_version: 3,
    homepage_url: 'https://github.com/apades/dmMiniPlayer',
    version,
    icons: {
      '16': 'assets/icon16.png',
      '32': 'assets/icon32.png',
      '48': 'assets/icon48.png',
      '64': 'assets/icon64.png',
      '128': 'assets/icon128.png',
    },
    action: {
      default_icon: {
        '16': 'assets/icon16.png',
        '32': 'assets/icon32.png',
        '48': 'assets/icon48.png',
        '64': 'assets/icon64.png',
        '128': 'assets/icon128.png',
      },
      default_popup: 'popup.html',
    },
    host_permissions: ['<all_urls>'],
    permissions: [
      'storage',
      'contextMenus',
      'activeTab',
      'notifications',
      'tabs',
      // 'tabCapture',
    ],
    background: {
      service_worker: 'background.js',
      type: 'module',
    },
    content_scripts: [
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
    ],
    default_locale: 'en',
    web_accessible_resources: [
      {
        resources: ['assets/**/*'],
        matches: ['<all_urls>'],
      },
      {
        resources: ['assets/*'],
        matches: ['<all_urls>'],
      },
    ],
    commands: {
      back: {
        suggested_key: {
          default: 'Alt+Shift+Comma',
          windows: 'Alt+Shift+Comma',
          mac: 'Command+Shift+Left',
        },
        description: '__MSG_back__',
      },
      forward: {
        suggested_key: {
          default: 'Alt+Shift+Period',
          windows: 'Alt+Shift+Period',
          mac: 'Command+Shift+Right',
        },
        description: '__MSG_forward__',
      },
      'pause/play': {
        suggested_key: {
          default: 'Alt+Shift+M',
          windows: 'Alt+Shift+M',
          mac: 'Command+Shift+Space',
        },
        description: '__MSG_playOrPause__',
      },
      hide: {
        suggested_key: {
          default: 'Alt+Shift+H',
          windows: 'Alt+Shift+H',
          mac: 'Command+Shift+H',
        },
        description: '__MSG_hide__',
      },
      playbackRate: {
        description: '__MSG_playbackRate__',
      },
      quickHideToggle: {
        description: '__MSG_quickHideToggle__',
      },
    },
  }

  if (target !== 'firefox') {
    return manifest
  }

  manifest.permissions = Array.from(
    new Set([...(manifest.permissions ?? []), 'scripting']),
  )

  manifest.content_scripts = manifest.content_scripts?.flatMap((script) => {
    if (script.js?.[0] !== 'entry-all-frames.js') return script
    return [
      {
        ...script,
        js: ['entry-all-frames.js'],
      },
      {
        ...script,
        js: ['clogInject.js'],
      },
      {
        ...script,
        js: ['main.js'],
      },
    ]
  })

  return {
    ...manifest,
    background: {
      scripts: ['background.js'],
      type: 'module',
    } as any,
    browser_specific_settings: {
      gecko: {
        id: 'dmminiplayer-firefox@local',
        strict_min_version: '151.0',
        data_collection_permissions: {
          required: ['websiteActivity'],
        },
      },
    },
  } as chrome.runtime.ManifestV3
}

export const manifest: chrome.runtime.ManifestV3 = createManifest()
