# dmMiniPlayer Firefox

Firefox 版弹幕小窗播放器。这个 fork 基于
[apades/dmMiniPlayer](https://github.com/apades/dmMiniPlayer)，目标是让
Bilibili 视频在 Firefox / macOS 上也能用带弹幕的 Document Picture-in-Picture
小窗播放。

当前重点测试目标是 Bilibili 视频页。上游支持的其它站点和功能可能仍然存在，
但这个 fork 暂不承诺 Firefox 下全部可用。

## 当前状态

- 支持 Firefox MV3 构建。
- 支持在 Firefox 的 Document Picture-in-Picture 小窗里播放视频和弹幕。
- 支持小窗内播放控制、设置面板、弹幕设置和基础快捷操作。
- 页面悬浮按钮已做 Firefox 区分，避免和 Firefox 原生 PiP 按钮混淆。
- 已有 Firefox smoke/regression 测试覆盖 popup、设置面板、悬浮按钮、DocPiP
  打开、控制栏和关闭路径。
- 当前 production Firefox build 通过 `web-ext lint --source-dir dist`，无
  errors、notices、warnings。

## 已知限制

Firefox 的 Document Picture-in-Picture 目前表现为一个小型浏览器窗口，不是
Chrome 那种更接近原生无边框的 PiP surface。扩展可以控制窗口内的播放器内容，
但不能通过 WebExtension 隐藏 Firefox 自己的窗口标题栏、地址栏或 macOS
红黄绿按钮。

地址栏和工具栏可以通过 Firefox 的 `userChrome.css` 做用户侧隐藏。macOS
原生标题栏和红黄绿按钮不能靠扩展或 `userChrome.css` 彻底移除，需要浏览器侧
改动。

```css
/* dmMiniPlayer Firefox Document PiP chrome cleanup - begin */
@media (display-mode: picture-in-picture) {
  #navigator-toolbox,
  #TabsToolbar,
  #nav-bar,
  #PersonalToolbar,
  #toolbar-menubar {
    min-height: 0 !important;
    height: 0 !important;
    max-height: 0 !important;
    border: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    overflow: hidden !important;
    visibility: collapse !important;
  }

  #document-pip-return-to-opener-button,
  #urlbar-container,
  #identity-box,
  #tracking-protection-icon-container {
    display: none !important;
  }
}
/* dmMiniPlayer Firefox Document PiP chrome cleanup - end */
```

## 临时安装

```bash
pnpm i
pnpm build:firefox
```

然后打开 Firefox：

1. 进入 `about:debugging#/runtime/this-firefox`
2. 点击 `Load Temporary Add-on...`
3. 选择 `dist/manifest.json`

临时安装在 Firefox 重启后会失效。正式使用需要 AMO 签名版。

安装后在 Bilibili 视频页点击扩展图标，选择 `Open danmaku mini player`。
如果页面是在安装前已经打开的，扩展会尝试补注入脚本；失败时刷新页面再试。

## 开发

环境要求：

- Node.js >= 24.11.0
- pnpm >= 10.0.0
- Firefox
- geckodriver，仓库依赖里已锁定

常用命令：

```bash
pnpm build:firefox
pnpm test:firefox-regression
pnpm archive:firefox
pnpm archive:firefox-source
```

如果本机没有全局 `pnpm`，可以临时用：

```bash
npx pnpm@10.23.0 test:firefox-regression
```

`pnpm archive:firefox` 会生成：

```text
build/firefox-mv3-prod-<version>.zip
```

`pnpm archive:firefox-source` 会从干净的 git `HEAD` 生成 AMO 源码包：

```text
build/firefox-source-<version>.zip
```

## AMO 上架准备

当前已经能生成 Firefox zip。提交 AMO 前建议准备：

- 补齐商店截图、说明、隐私声明和 reviewer notes。
- 首次提交前确认 `browser_specific_settings.gecko.id` 没有和已有 AMO 扩展冲突。

因为本项目使用 tsup 打包/压缩，提交 AMO 时需要同时上传源码包。源码包可用
`pnpm archive:firefox-source` 生成；构建说明和 reviewer notes 见
[`docs/AMO_REVIEW_NOTES.md`](./docs/AMO_REVIEW_NOTES.md)。

Firefox 构建的权限已收窄到 Bilibili 相关域名：

- content scripts: `*://bilibili.com/*`, `*://*.bilibili.com/*`
- host permissions: `*://bilibili.com/*`, `*://*.bilibili.com/*`,
  `*://*.hdslb.com/*`

相关文档：

- <https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/>
- <https://extensionworkshop.com/documentation/publish/source-code-submission/>
- <https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/>

## 隐私

本扩展不向扩展开发者收集、存储、出售或共享用户数据。扩展会请求 Bilibili
相关接口来获取视频信息、播放列表、弹幕和静态媒体资源。Firefox manifest 中的
数据声明为 `required: ["none"]`。更完整说明见
[`docs/PRIVACY.md`](./docs/PRIVACY.md)。

## 致谢

这个 fork 的主体代码来自
[apades/dmMiniPlayer](https://github.com/apades/dmMiniPlayer)。感谢上游作者和
原项目中引用的开源项目，尤其是弹幕解析、播放器 UI、Bilibili 数据获取和
Document Picture-in-Picture 实现相关代码。

上游项目引用过的主要开源项目包括：

- [Bilibili-Evolved](https://github.com/the1812/Bilibili-Evolved)
- [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect)
- [rc-slider](https://github.com/react-component/slider)
- [js-cookie](https://github.com/js-cookie/js-cookie)
- [tsup](https://github.com/egoist/tsup)
- [@ironkinoko/danmaku](https://github.com/IronKinoko/danmaku)

## License

Upstream license: [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)
