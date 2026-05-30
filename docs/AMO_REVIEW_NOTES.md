# AMO Review Notes

## Build

Use the committed source tree and the checked-in lockfile.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build:firefox
pnpm archive:firefox
```

The production extension archive is written to:

```text
build/firefox-mv3-prod-<version>.zip
```

The source package can be generated from a clean git checkout with:

```bash
pnpm archive:firefox-source
```

## Scope

This Firefox fork is focused on Bilibili pages. Firefox builds do not request
`<all_urls>`.

Content scripts run on:

- `*://bilibili.com/*`
- `*://*.bilibili.com/*`

Host permissions are limited to:

- `*://bilibili.com/*`
- `*://*.bilibili.com/*`
- `*://*.hdslb.com/*`

`*.hdslb.com` is used for Bilibili static media such as covers, avatars, and
emoji assets referenced by Bilibili video/live data.

The source tree is forked from a multi-site upstream extension and still
contains upstream provider modules. The Firefox manifest intentionally limits
content script execution and host permissions to the Bilibili-related patterns
listed above.

## Data Collection

The extension does not collect, sell, or share user data with the extension
developer. It requests Bilibili-related endpoints to fetch video metadata,
playlist data, danmaku, and static media needed for the player. See
`docs/PRIVACY.md`.

The Firefox manifest declares:

```json
"data_collection_permissions": {
  "required": ["none"]
}
```

## Bundling

The submitted extension uses `tsup`/esbuild to bundle TypeScript, React/Preact
UI code, and third-party npm dependencies into WebExtension files. The source
package contains the original source and `pnpm-lock.yaml` for dependency
resolution.
