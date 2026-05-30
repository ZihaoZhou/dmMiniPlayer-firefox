const cp = require('child_process')
const fs = require('fs')
const http = require('http')
const os = require('os')
const path = require('path')
const { Builder, By, until } = require('selenium-webdriver')
const firefox = require('selenium-webdriver/firefox')

const ADDON_ID = 'dmminiplayer-firefox@local'
const ROOT_DIR = path.resolve(__dirname, '..')
const DIST_DIR = path.join(ROOT_DIR, 'dist')
const GECKODRIVER_BIN =
  process.env.GECKODRIVER_BIN ||
  path.join(ROOT_DIR, 'node_modules/.bin/geckodriver')
const FIREFOX_BIN =
  process.env.FIREFOX_BIN || '/Applications/Firefox.app/Contents/MacOS/firefox'

function assertFile(file, label) {
  if (!fs.existsSync(file)) {
    throw new Error(`${label} not found: ${file}`)
  }
}

function createXpi() {
  assertFile(path.join(DIST_DIR, 'manifest.json'), 'Firefox build output')
  const xpi = path.join(os.tmpdir(), `dmminiplayer-firefox-${Date.now()}.xpi`)
  cp.execFileSync('/usr/bin/zip', ['-qr', xpi, '.'], { cwd: DIST_DIR })
  return xpi
}

function createFixtureServer() {
  const server = http.createServer((req, res) => {
    const largeDom = process.env.FIREFOX_SMOKE_LARGE_DOM
      ? Array.from(
          { length: 5000 },
          (_, index) =>
            `<div class="fixture-node"><span>fixture node ${index}</span><button>noop</button></div>`,
        ).join('')
      : ''
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<!doctype html>
<html>
  <head><title>dmMiniPlayer Firefox fixture</title></head>
  <body>
    <video controls width="320" height="180"></video>
    <main>${largeDom}</main>
  </body>
</html>`)
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        url: `http://127.0.0.1:${server.address().port}/`,
      })
    })
  })
}

function parseExtensionUuid(profileDir) {
  const prefsPath = path.join(profileDir, 'prefs.js')
  if (!fs.existsSync(prefsPath)) return null
  const prefs = fs.readFileSync(prefsPath, 'utf8')
  const match = prefs.match(
    /user_pref\("extensions\.webextensions\.uuids",\s*"((?:\\.|[^"])*)"\);/,
  )
  if (!match) return null

  const jsonText = JSON.parse(`"${match[1]}"`)
  return JSON.parse(jsonText)[ADDON_ID] || null
}

async function waitForExtensionUuid(profileDir, timeoutMs = 8000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const uuid = parseExtensionUuid(profileDir)
    if (uuid) return uuid
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for ${ADDON_ID} moz-extension UUID`)
}

async function readHtmlAttrs(driver) {
  return driver.executeScript(`
    const attrs = {}
    for (const attr of document.documentElement.attributes) {
      attrs[attr.name] = attr.value
    }
    return attrs
  `)
}

async function waitForContentListener(driver, fixtureHandle) {
  await driver.switchTo().window(fixtureHandle)
  await driver.wait(
    until.elementLocated(By.css('html[dm-popup-listener="true"]')),
    10000,
  )
}

async function waitForPopupDone(driver) {
  await driver.wait(async () => {
    const loading = await driver
      .findElement(By.css('html'))
      .then((el) => el.getAttribute('data-dm-popup-loading'))
      .catch(() => null)
    return loading === 'false'
  }, 10000)
}

async function assertFloatButtonVisible(driver, fixtureHandle) {
  await driver.switchTo().window(fixtureHandle)
  const body = await driver.findElement(By.css('body')).catch(() => null)
  if (body) {
    await driver
      .actions({ async: true })
      .move({ origin: body, x: 20, y: 20 })
      .perform()
      .catch(() => {})
  }
  await driver
    .executeScript(`
      const video = document.querySelector('video')
      video?.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          clientX: 20,
          clientY: 20,
        }),
      )
    `)
    .catch(() => {})

  try {
    const snapshot = await driver.wait(async () => {
      await driver
        .executeScript(`
          const video = document.querySelector('video')
          video?.dispatchEvent(
            new MouseEvent('mousemove', {
              bubbles: true,
              clientX: 20,
              clientY: 20,
            }),
          )
        `)
        .catch(() => {})
      const result = await getFloatButtonSnapshot(driver)
      return result.visible &&
        !/DM PiP/.test(result.text) &&
        /弹幕|danmaku/i.test(`${result.title} ${result.ariaLabel}`) &&
        result.backgroundColor !== 'rgb(38, 38, 38)' &&
        result.backgroundAlpha > 0.2 &&
        result.backgroundAlpha < 0.8 &&
        result.settingButtonCount === 0 &&
        !result.hasUpgradeText
        ? result
        : null
    }, Number(process.env.FIREFOX_SMOKE_FLOAT_BUTTON_TIMEOUT_MS || 5000))

    return { floatButtonSnapshot: snapshot }
  } catch (error) {
    const floatButtonSnapshotOnFailure = await getFloatButtonSnapshot(driver).catch(
      (snapshotError) => ({ error: String(snapshotError) }),
    )
    throw new Error(
      `Float button was not visibly distinguishable from native PiP: ${JSON.stringify({
        floatButtonSnapshotOnFailure,
        waitError: String(error),
      })}`,
    )
  }
}

async function getFloatButtonSnapshot(driver) {
  return driver.executeScript(`
    const collect = (root, result = []) => {
      if (!root?.querySelectorAll) return result
      for (const el of root.querySelectorAll('*')) {
        result.push(el)
        if (el.shadowRoot) collect(el.shadowRoot, result)
      }
      return result
    }

    const button = collect(document).find((el) =>
      el.classList?.contains('start-pip-btn')
    )
    if (!button) return { exists: false, visible: false }
    const allElements = collect(document)

    const rect = button.getBoundingClientRect()
    const style = getComputedStyle(button)
    let inheritedOpacity = 1
    for (
      let node = button;
      node && node.nodeType === Node.ELEMENT_NODE;
      node = node.parentElement || node.getRootNode()?.host
    ) {
      const opacity = Number(getComputedStyle(node).opacity)
      if (Number.isFinite(opacity)) inheritedOpacity *= opacity
    }

    return {
      exists: true,
      visible:
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < innerWidth &&
        rect.top < innerHeight &&
        inheritedOpacity > 0.05 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden',
      text: button.innerText,
      title: button.getAttribute('title') || '',
      ariaLabel: button.getAttribute('aria-label') || '',
      backgroundAlpha: Number(
        style.backgroundColor.match(/rgba?\\([^,]+,[^,]+,[^,]+,\\s*([^)]+)\\)/)?.[1] ??
          (style.backgroundColor.startsWith('rgb(') ? 1 : 0)
      ),
      settingButtonCount: allElements.filter((el) =>
        el.classList?.contains('setting-btn')
      ).length,
      hasUpgradeText: allElements.some((el) =>
        /^NEW:/.test(String(el.textContent || '').trim())
      ),
      className: String(button.className || ''),
      backgroundColor: style.backgroundColor,
      color: style.color,
      inheritedOpacity,
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      },
      viewport: { width: innerWidth, height: innerHeight },
    }
  `)
}

async function assertPopupMenu(driver, extensionUuid, targetUrl, fixtureHandle) {
  await driver.switchTo().newWindow('tab')
  const popupHandle = await driver.getWindowHandle()
  await driver.get(
    `moz-extension://${extensionUuid}/popup.html?targetUrl=${encodeURIComponent(
      targetUrl,
    )}`,
  )
  await waitForPopupDone(driver)

  const snapshot = await driver.executeScript(`
    const style = getComputedStyle(document.body)
    return {
      status: document.documentElement.getAttribute('data-dm-popup-status'),
      loading: document.documentElement.getAttribute('data-dm-popup-loading'),
      error: document.documentElement.getAttribute('data-dm-popup-error'),
      bodyText: document.body?.innerText ?? '',
      fontFamily: style.fontFamily,
      menuItemCount: document.querySelectorAll('.menu-item').length,
      checkboxCount: document.querySelectorAll('input[type="checkbox"]').length,
      hasUglyActivationText: /Click on the web page to trigger picture-in-picture/.test(
        document.body?.innerText ?? '',
      ),
      rect: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
    }
  `)

  await driver.close().catch(() => {})
  await driver.switchTo().window(fixtureHandle)

  if (
    snapshot.status !== 'menu' ||
    snapshot.loading !== 'false' ||
    snapshot.menuItemCount < 2 ||
    snapshot.checkboxCount < 1 ||
    snapshot.hasUglyActivationText ||
    !snapshot.fontFamily.includes('system-ui')
  ) {
    throw new Error(
      `Popup menu was not usable: ${JSON.stringify({
        popupHandle,
        snapshot,
      })}`,
    )
  }

  return { popupHandle, snapshot }
}

async function assertPopupOpenSetting(
  driver,
  extensionUuid,
  targetUrl,
  fixtureHandle,
) {
  await waitForContentListener(driver, fixtureHandle)
  await driver.switchTo().newWindow('tab')
  const popupHandle = await driver.getWindowHandle()
  await driver.get(
    `moz-extension://${extensionUuid}/popup.html?targetUrl=${encodeURIComponent(
      targetUrl,
    )}`,
  )
  await waitForPopupDone(driver)

  const openedAt = Date.now()
  const clickResult = await driver.executeScript(`
    const button = [...document.querySelectorAll('button.menu-item')].find((el) =>
      /Open setting|打开设置/.test(el.textContent || '')
    )
    button?.click()
    return {
      clicked: !!button,
      bodyText: document.body?.innerText ?? '',
    }
  `)
  if (!clickResult.clicked) {
    throw new Error(
      `Popup Open setting item was not clickable: ${JSON.stringify({
        popupHandle,
        clickResult,
      })}`,
    )
  }

  await driver.switchTo().window(fixtureHandle)
  const openElapsedMs = Date.now() - openedAt
  let panelSnapshot
  try {
    panelSnapshot = await driver.wait(async () => {
      const snapshot = await getSettingPanelSnapshot(driver)
      return snapshot.visiblePanelCount > 0 &&
        snapshot.closeButtonVisible &&
        snapshot.settingPanelFontLoaded
        ? snapshot
        : null
    }, Number(process.env.FIREFOX_SMOKE_POPUP_SETTING_TIMEOUT_MS || 5000))
  } catch (error) {
    const pageAttrsOnFailure = await readHtmlAttrs(driver).catch((readError) => ({
      error: String(readError),
    }))
    const panelSnapshotOnFailure = await getSettingPanelSnapshot(driver).catch(
      (snapshotError) => ({ error: String(snapshotError) }),
    )
    throw new Error(
      `Popup did not open closable setting panel: ${JSON.stringify({
        clickResult,
        pageAttrsOnFailure,
        panelSnapshotOnFailure,
        waitError: String(error),
      })}`,
    )
  }

  const responsiveProbe = await assertPageResponsive(driver)
  if (
    process.env.FIREFOX_SMOKE_ASSERT_POPUP_RESPONSIVE &&
    (responsiveProbe.timedOut || responsiveProbe.elapsed > 1500)
  ) {
    throw new Error(
      `Page was not responsive after popup Open setting: ${JSON.stringify({
        openElapsedMs,
        responsiveProbe,
      })}`,
    )
  }

  const closeProbe = await closeSettingPanelWithButton(driver)
  const pageAttrs = await readHtmlAttrs(driver)
  if (
    process.env.FIREFOX_SMOKE_ASSERT_POPUP_RESPONSIVE &&
    (pageAttrs['dm-entry-all-frames-duplicate'] ||
      pageAttrs['dm-main-wrapper-duplicate'] ||
      pageAttrs['dm-clog-inject-duplicate'])
  ) {
    throw new Error(
      `Popup Open setting reinjected content scripts: ${JSON.stringify({
        pageAttrs,
      })}`,
    )
  }

  return {
    popupHandle,
    clickResult,
    openElapsedMs,
    panelSnapshot,
    responsiveProbe,
    closeProbe,
    pageAttrs,
  }
}

async function assertPageResponsive(driver) {
  return driver.executeAsyncScript(`
    const done = arguments[arguments.length - 1]
    const started = performance.now()
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      done({
        ...result,
        elapsed: performance.now() - started,
        bodyChildCount: document.body?.children?.length ?? 0,
      })
    }
    setTimeout(() => finish({ timedOut: true }), 1200)
    requestAnimationFrame(() => finish({ timedOut: false }))
  `)
}

async function getWindowSnapshot(driver, handle) {
  await driver.switchTo().window(handle)
  const url = await driver.getCurrentUrl().catch((error) => String(error))
  const title = await driver.getTitle().catch((error) => String(error))
  const rect = await driver.manage().window().getRect().catch(() => null)
  const dom = await driver
    .executeScript(`
      return {
        readyState: document.readyState,
        bodyText: document.body?.innerText?.slice(0, 1000) ?? null,
        bodyChildren: document.body?.children?.length ?? null,
        bodyHtml: document.body?.innerHTML?.slice(0, 1000) ?? null,
        bodyBg: document.body ? getComputedStyle(document.body).backgroundColor : null,
        danmakuContainerCount: document.querySelectorAll('.danmaku-container').length,
        danmakuItemCount: document.querySelectorAll('.danmaku-item, .danmaku').length,
        canvasCount: document.querySelectorAll('canvas').length,
        htmlAttrs: Object.fromEntries([...document.documentElement.attributes].map((attr) => [attr.name, attr.value])),
      }
    `)
    .catch((error) => ({ error: String(error) }))
  return { handle, url, title, rect, dom }
}

async function maybeTriggerPip(driver, fixtureHandle) {
  if (!process.env.FIREFOX_SMOKE_TRIGGER_PIP) return null

  const beforeHandles = await driver.getAllWindowHandles()
  await driver.switchTo().window(fixtureHandle)
  await driver.actions({ async: true }).move({ x: 20, y: 20 }).click().perform()

  const handles =
    (await driver
      .wait(async () => {
        const currentHandles = await driver.getAllWindowHandles()
        return currentHandles.length > beforeHandles.length
          ? currentHandles
          : null
      }, Number(process.env.FIREFOX_SMOKE_TRIGGER_TIMEOUT_MS || 10000))
      .catch(() => null)) || (await driver.getAllWindowHandles())

  await driver.switchTo().window(fixtureHandle)
  await driver
    .wait(async () => {
      const attrs = await readHtmlAttrs(driver)
      return attrs['dm-docpip-stage'] === 'player-appended'
    }, Number(process.env.FIREFOX_SMOKE_APPEND_TIMEOUT_MS || 5000))
    .catch(() => {})

  const snapshots = []
  for (const handle of handles) {
    snapshots.push(await getWindowSnapshot(driver, handle))
  }
  await driver.switchTo().window(fixtureHandle)
  const pageAttrsAfterTrigger = await readHtmlAttrs(driver)
  const newWindowSnapshots = snapshots.filter(
    (snapshot) => !beforeHandles.includes(snapshot.handle),
  )
  const pipSnapshot = newWindowSnapshots.find(
    (snapshot) => snapshot.url === 'about:blank',
  )

  if (
    pageAttrsAfterTrigger['dm-docpip-stage'] !== 'player-appended' &&
    (!pipSnapshot || !pipSnapshot.dom || pipSnapshot.dom.bodyChildren < 1)
  ) {
    throw new Error(
      `DocPiP player was not appended: ${JSON.stringify({
        pageAttrsAfterTrigger,
        newWindowSnapshots,
      })}`,
    )
  }
  if (!pipSnapshot || !pipSnapshot.dom || pipSnapshot.dom.bodyChildren < 1) {
    throw new Error(
      `DocPiP window is empty: ${JSON.stringify({
        pageAttrsAfterTrigger,
        newWindowSnapshots,
      })}`,
    )
  }

  const controlsProbe = process.env.FIREFOX_SMOKE_ASSERT_CONTROLS
    ? await assertControlsVisible(driver, pipSnapshot.handle)
    : null
  const danmakuDataProbe = process.env.FIREFOX_SMOKE_ASSERT_BILIBILI_DANMAKU_DATA
    ? await assertBilibiliDanmakuDataLoaded(
        driver,
        fixtureHandle,
        pipSnapshot.handle,
      )
    : null
  const danmakuProbe = process.env.FIREFOX_SMOKE_ASSERT_DANMAKU
    ? await assertDanmakuRendered(driver, fixtureHandle, pipSnapshot.handle)
    : null
  const settingProbe = process.env.FIREFOX_SMOKE_ASSERT_SETTING_PANEL
    ? await assertSettingPanel(driver, fixtureHandle, pipSnapshot.handle)
    : null

  return {
    beforeHandles,
    handles,
    pageAttrsAfterTrigger,
    snapshots,
    controlsProbe,
    danmakuDataProbe,
    danmakuProbe,
    settingProbe,
  }
}

async function assertControlsVisible(driver, pipHandle) {
  await driver.switchTo().window(pipHandle)
  await ensurePipViewport(driver)
  await revealControls(driver)

  let controlsSnapshot
  try {
    controlsSnapshot = await driver.wait(async () => {
      await revealControls(driver)
      const snapshot = await getControlsSnapshot(driver)
      return snapshot.player.visible &&
        snapshot.video.visible &&
        snapshot.actions.visible &&
        snapshot.settingIcon.visible &&
        snapshot.visibleActionButtonCount >= 3 &&
        snapshot.actionFontFamily.includes('system-ui')
        ? snapshot
        : null
    }, Number(process.env.FIREFOX_SMOKE_CONTROLS_TIMEOUT_MS || 5000))
  } catch (error) {
    const controlsSnapshotOnFailure = await getControlsSnapshot(driver).catch(
      (snapshotError) => ({ error: String(snapshotError) }),
    )
    throw new Error(
      `PiP controls were not visibly usable: ${JSON.stringify({
        controlsSnapshotOnFailure,
        waitError: String(error),
      })}`,
    )
  }

  return { controlsSnapshot }
}

async function ensurePipViewport(driver) {
  const width = Number(process.env.FIREFOX_SMOKE_PIP_WIDTH || 900)
  const height = Number(process.env.FIREFOX_SMOKE_PIP_HEIGHT || 560)

  await driver
    .manage()
    .window()
    .setRect({ width, height })
    .catch(async () => {
      await driver
        .executeScript(`window.resizeTo(${width}, ${height})`)
        .catch(() => {})
    })

  await driver
    .wait(async () => {
      const viewport = await driver.executeScript(`
        return { width: innerWidth, height: innerHeight }
      `)
      return viewport.width >= 769 && viewport.height >= 300
    }, 3000)
    .catch(() => {})
}

async function revealControls(driver) {
  const body = await driver.findElement(By.css('body')).catch(() => null)
  if (body) {
    await driver
      .actions({ async: true })
      .move({ origin: body, x: 100, y: 100 })
      .perform()
      .catch(() => {})
  }

  await driver.executeScript(`
    document.querySelector('.video-player-v2')?.classList.add('active')
    const target =
      document.querySelector('.video-container') ||
      document.querySelector('.video-player-v2')
    target?.dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        clientX: Math.max(1, innerWidth / 2),
        clientY: Math.max(1, innerHeight / 2),
      }),
    )
  `)
}

async function getControlsSnapshot(driver) {
  return driver.executeScript(`
    const rectSnapshot = (el) => {
      if (!el) {
        return { exists: false, visible: false }
      }

      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      let inheritedOpacity = 1
      for (let node = el; node && node.nodeType === Node.ELEMENT_NODE; node = node.parentElement) {
        const opacity = Number(getComputedStyle(node).opacity)
        if (Number.isFinite(opacity)) inheritedOpacity *= opacity
      }
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < innerWidth &&
        rect.top < innerHeight &&
        inheritedOpacity > 0.05 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      return {
        exists: true,
        visible,
        className: String(el.className || ''),
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        inheritedOpacity,
        position: style.position,
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        },
      }
    }

    const actionButtons = [
      ...document.querySelectorAll('.actions [class*="cursor-pointer"], .actions button'),
    ].map(rectSnapshot)
    const actions = document.querySelector('.actions')
    return {
      viewport: { width: innerWidth, height: innerHeight },
      player: rectSnapshot(document.querySelector('.video-player-v2')),
      video: rectSnapshot(document.querySelector('video')),
      danmakuContainer: rectSnapshot(document.querySelector('.danmaku-container')),
      actionArea: rectSnapshot(document.querySelector('.video-action-area')),
      actions: rectSnapshot(actions),
      settingIcon: rectSnapshot(document.querySelector('.anticon-setting')),
      actionButtonCount: actionButtons.length,
      visibleActionButtonCount: actionButtons.filter((item) => item.visible).length,
      actionButtons,
      bodyText: document.body?.innerText?.slice(0, 500) ?? '',
      actionFontFamily: getComputedStyle(actions || document.body).fontFamily,
      playerFontFamily: getComputedStyle(
        document.querySelector('.video-player-v2') || document.body,
      ).fontFamily,
    }
  `)
}

async function assertBilibiliDanmakuDataLoaded(
  driver,
  fixtureHandle,
  pipHandle,
) {
  await driver.switchTo().window(fixtureHandle)
  try {
    await driver.wait(async () => {
      const attrs = await readHtmlAttrs(driver)
      const count = Number(attrs['dm-bili-danmaku-count'] || 0)
      return attrs['dm-bili-danmaku-state'] === 'loaded' && count > 0
        ? attrs
        : null
    }, Number(process.env.FIREFOX_SMOKE_DANMAKU_LOAD_TIMEOUT_MS || 20000))
  } catch (error) {
    const pageAttrsOnFailure = await readHtmlAttrs(driver).catch((readError) => ({
      error: String(readError),
    }))
    const pipSnapshotOnFailure = await getWindowSnapshot(driver, pipHandle).catch(
      (snapshotError) => ({
        error: String(snapshotError),
      }),
    )
    throw new Error(
      `Bilibili danmaku data did not load: ${JSON.stringify({
        pageAttrsOnFailure,
        pipSnapshotOnFailure,
        waitError: String(error),
      })}`,
    )
  }

  const pageAttrsAfterDanmakuLoad = await readHtmlAttrs(driver)
  return { pageAttrsAfterDanmakuLoad }
}

async function getDanmakuSnapshot(driver) {
  return driver.executeScript(`
    const items = [...document.querySelectorAll('.danmaku-item, .danmaku')]
    const canvasList = [...document.querySelectorAll('canvas')]
    return {
      itemCount: items.length,
      itemTexts: items.slice(0, 5).map((el) => el.textContent?.trim()).filter(Boolean),
      containerCount: document.querySelectorAll('.danmaku-container').length,
      canvasCount: canvasList.length,
      nonEmptyCanvasCount: canvasList.filter((canvas) => {
        try {
          const ctx = canvas.getContext('2d')
          if (!ctx || !canvas.width || !canvas.height) return false
          const data = ctx.getImageData(0, 0, Math.min(canvas.width, 64), Math.min(canvas.height, 64)).data
          return data.some((value) => value !== 0)
        } catch (error) {
          return false
        }
      }).length,
      video: (() => {
        const video = document.querySelector('video')
        if (!video) return null
        return {
          currentTime: video.currentTime,
          duration: video.duration,
          paused: video.paused,
          readyState: video.readyState,
        }
      })(),
    }
  `)
}

async function assertDanmakuRendered(driver, fixtureHandle, pipHandle) {
  await driver.switchTo().window(fixtureHandle)
  try {
    await driver.wait(async () => {
      const attrs = await readHtmlAttrs(driver)
      const count = Number(attrs['dm-bili-danmaku-count'] || 0)
      return attrs['dm-bili-danmaku-state'] === 'loaded' && count > 0
    }, Number(process.env.FIREFOX_SMOKE_DANMAKU_LOAD_TIMEOUT_MS || 20000))
  } catch (error) {
    const pageAttrsOnFailure = await readHtmlAttrs(driver).catch((readError) => ({
      error: String(readError),
    }))
    const pipSnapshotOnFailure = await getWindowSnapshot(driver, pipHandle).catch(
      (snapshotError) => ({
        error: String(snapshotError),
      }),
    )
    throw new Error(
      `Danmaku data did not load: ${JSON.stringify({
        pageAttrsOnFailure,
        pipSnapshotOnFailure,
        waitError: String(error),
      })}`,
    )
  }
  const pageAttrsAfterDanmakuLoad = await readHtmlAttrs(driver)

  await driver.switchTo().window(pipHandle)
  const seekTime = Number(process.env.FIREFOX_SMOKE_DANMAKU_TIME || 30)
  let danmakuSnapshot
  try {
    danmakuSnapshot = await driver.wait(async () => {
      await driver.executeScript(`
        const video = document.querySelector('video')
        if (video) {
          try {
            if (Number.isFinite(video.duration) && video.duration > 0) {
              video.currentTime = Math.min(${seekTime}, Math.max(0, video.duration - 1))
            } else {
              video.currentTime = ${seekTime}
            }
          } catch (error) {}
          video.dispatchEvent(new Event('seeking'))
          video.dispatchEvent(new Event('timeupdate'))
          video.dispatchEvent(new Event('play'))
        }
      `)
      const snapshot = await getDanmakuSnapshot(driver)
      return snapshot.itemCount > 0 || snapshot.nonEmptyCanvasCount > 0
        ? snapshot
        : null
    }, Number(process.env.FIREFOX_SMOKE_DANMAKU_RENDER_TIMEOUT_MS || 10000))
  } catch (error) {
    const renderSnapshotOnFailure = await getDanmakuSnapshot(driver).catch(
      (snapshotError) => ({ error: String(snapshotError) }),
    )
    await driver.switchTo().window(fixtureHandle)
    const pageAttrsOnFailure = await readHtmlAttrs(driver).catch((readError) => ({
      error: String(readError),
    }))
    await driver.switchTo().window(pipHandle)
    throw new Error(
      `Danmaku did not render: ${JSON.stringify({
        pageAttrsAfterDanmakuLoad,
        pageAttrsOnFailure,
        renderSnapshotOnFailure,
        waitError: String(error),
      })}`,
    )
  }

  if (
    !danmakuSnapshot ||
    (danmakuSnapshot.itemCount < 1 && danmakuSnapshot.nonEmptyCanvasCount < 1)
  ) {
    throw new Error(
      `Danmaku did not render: ${JSON.stringify({
        pageAttrsAfterDanmakuLoad,
        danmakuSnapshot,
      })}`,
    )
  }

  await driver.switchTo().window(fixtureHandle)
  return { pageAttrsAfterDanmakuLoad, danmakuSnapshot }
}

async function assertSettingPanel(driver, fixtureHandle, pipHandle) {
  await driver.switchTo().window(pipHandle)
  await ensurePipViewport(driver)
  await revealControls(driver)
  const clickResult = await driver.executeScript(`
    const settingIcon = document.querySelector('.anticon-setting')
    const button = settingIcon?.closest('[class*="cursor-pointer"], button, div')
    const rect = button?.getBoundingClientRect()
    const style = button ? getComputedStyle(button) : null
    const buttonVisible = !!button &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < innerWidth &&
      rect.top < innerHeight &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    button?.click()
    return {
      hasSettingIcon: !!settingIcon,
      clicked: !!button,
      buttonVisible,
      bodyText: document.body?.innerText?.slice(0, 500) ?? '',
      actionFontFamily: getComputedStyle(document.querySelector('.actions') || document.body).fontFamily,
      buttonOuterHTML: button?.outerHTML?.slice(0, 500) ?? null,
    }
  `)
  if (
    !clickResult.hasSettingIcon ||
    !clickResult.clicked ||
    !clickResult.buttonVisible
  ) {
    throw new Error(`Setting button was not clickable: ${JSON.stringify(clickResult)}`)
  }

  let panelSnapshot
  try {
    panelSnapshot = await driver.wait(async () => {
      const snapshot = await getSettingPanelSnapshot(driver)
      return snapshot.visiblePanelCount > 0 &&
        snapshot.settingPanelCssLoaded &&
        snapshot.settingPanelFontLoaded &&
        snapshot.closeButtonVisible
        ? snapshot
        : null
    }, Number(process.env.FIREFOX_SMOKE_SETTING_TIMEOUT_MS || 5000))
  } catch (error) {
    const pipSnapshotOnFailure = await getSettingPanelSnapshot(driver).catch(
      (snapshotError) => ({ error: String(snapshotError) }),
    )
    await driver.switchTo().window(fixtureHandle)
    const pageSnapshotOnFailure = await getSettingPanelSnapshot(driver).catch(
      (snapshotError) => ({ error: String(snapshotError) }),
    )
    const pageAttrsOnFailure = await readHtmlAttrs(driver).catch((readError) => ({
      error: String(readError),
    }))
    throw new Error(
      `Setting panel did not open in PiP: ${JSON.stringify({
        clickResult,
        pipSnapshotOnFailure,
        pageSnapshotOnFailure,
        pageAttrsOnFailure,
        waitError: String(error),
      })}`,
    )
  }

  const closeResult = await driver.executeScript(`
    const deepQueryAll = (selector, root = document) => {
      const result = [...root.querySelectorAll(selector)]
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) result.push(...deepQueryAll(selector, el.shadowRoot))
      }
      return result
    }
    const closeButton = deepQueryAll('.dm-setting-panel-close')[0]
    const rect = closeButton?.getBoundingClientRect()
    const style = closeButton ? getComputedStyle(closeButton) : null
    const visible = !!closeButton &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < innerWidth &&
      rect.top < innerHeight &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    closeButton?.click()
    return {
      exists: !!closeButton,
      visible,
      ariaLabel: closeButton?.getAttribute('aria-label') ?? null,
      text: closeButton?.textContent ?? null,
    }
  `)
  if (!closeResult.exists || !closeResult.visible) {
    throw new Error(
      `Setting panel close button was not usable: ${JSON.stringify({
        closeResult,
        panelSnapshot,
      })}`,
    )
  }

  let closedSnapshot
  try {
    closedSnapshot = await driver.wait(async () => {
      const snapshot = await getSettingPanelSnapshot(driver)
      return snapshot.visiblePanelCount === 0 ? snapshot : null
    }, Number(process.env.FIREFOX_SMOKE_SETTING_CLOSE_TIMEOUT_MS || 3000))
  } catch (error) {
    const closeSnapshotOnFailure = await getSettingPanelSnapshot(driver).catch(
      (snapshotError) => ({ error: String(snapshotError) }),
    )
    throw new Error(
      `Setting panel did not close: ${JSON.stringify({
        closeResult,
        closeSnapshotOnFailure,
        waitError: String(error),
      })}`,
    )
  }

  await driver.switchTo().window(fixtureHandle)
  return { clickResult, panelSnapshot, closeResult, closedSnapshot }
}

async function closeSettingPanelWithButton(driver) {
  const closeResult = await driver.executeScript(`
    const deepQueryAll = (selector, root = document) => {
      const result = [...root.querySelectorAll(selector)]
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) result.push(...deepQueryAll(selector, el.shadowRoot))
      }
      return result
    }
    const closeButton = deepQueryAll('.dm-setting-panel-close')[0]
    const rect = closeButton?.getBoundingClientRect()
    const style = closeButton ? getComputedStyle(closeButton) : null
    const visible = !!closeButton &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < innerWidth &&
      rect.top < innerHeight &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    closeButton?.click()
    return {
      exists: !!closeButton,
      visible,
      ariaLabel: closeButton?.getAttribute('aria-label') ?? null,
      text: closeButton?.textContent ?? null,
    }
  `)
  if (!closeResult.exists || !closeResult.visible) {
    throw new Error(
      `Setting panel close button was not usable: ${JSON.stringify({
        closeResult,
      })}`,
    )
  }

  let closedSnapshot
  try {
    closedSnapshot = await driver.wait(async () => {
      const snapshot = await getSettingPanelSnapshot(driver)
      return snapshot.visiblePanelCount === 0 ? snapshot : null
    }, Number(process.env.FIREFOX_SMOKE_SETTING_CLOSE_TIMEOUT_MS || 3000))
  } catch (error) {
    const closeSnapshotOnFailure = await getSettingPanelSnapshot(driver).catch(
      (snapshotError) => ({ error: String(snapshotError) }),
    )
    throw new Error(
      `Setting panel did not close: ${JSON.stringify({
        closeResult,
        closeSnapshotOnFailure,
        waitError: String(error),
      })}`,
    )
  }

  return { closeResult, closedSnapshot }
}

async function getSettingPanelSnapshot(driver) {
  return driver.executeScript(`
    const deepQueryAll = (selector, root = document) => {
      const result = [...root.querySelectorAll(selector)]
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) result.push(...deepQueryAll(selector, el.shadowRoot))
      }
      return result
    }
    const deepText = (root = document) => {
      const parts = [document.body?.innerText ?? '']
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) parts.push(el.shadowRoot.textContent ?? '')
      }
      return parts.join('\\n').slice(0, 500)
    }
    const panel = document.querySelector('.setting-panel')
    const deepPanels = deepQueryAll('.setting-panel')
    const deepRenderRoots = deepQueryAll('.render-root')
    const closeButtons = deepQueryAll('.dm-setting-panel-close')
    const rectSnapshot = (el) => {
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < innerWidth &&
        rect.top < innerHeight &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0'
      return {
        className: String(el.className || ''),
        visible,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        position: style.position,
        zIndex: style.zIndex,
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        },
      }
    }
    const panelRects = deepPanels.map(rectSnapshot)
    const closeButtonRects = closeButtons.map(rectSnapshot)
    const player = document.querySelector('.video-player-v2')
    const settingIcon = document.querySelector('.anticon-setting')
    const settingPanelFontFamily = deepPanels[0]
      ? getComputedStyle(deepPanels[0]).fontFamily
      : null
    return {
      panelCount: document.querySelectorAll('.setting-panel').length,
      deepPanelCount: deepPanels.length,
      visiblePanelCount: panelRects.filter((item) => item.visible).length,
      settingPanelCssLoaded: panelRects.some(
        (item) => item.position === 'fixed' && item.zIndex === '9999999',
      ),
      settingPanelFontLoaded: !!settingPanelFontFamily?.includes('system-ui'),
      settingPanelFontFamily,
      panelRects,
      closeButtonCount: closeButtons.length,
      closeButtonVisible: closeButtonRects.some((item) => item.visible),
      closeButtonRects,
      viewport: { width: innerWidth, height: innerHeight },
      renderRootCount: document.querySelectorAll('.render-root').length,
      deepRenderRootCount: deepRenderRoots.length,
      hasSettingIcon: !!settingIcon,
      bodyText: document.body?.innerText?.slice(0, 500) ?? '',
      deepText: deepText(),
      bodyHtml: document.body?.innerHTML?.slice(0, 1000) ?? '',
      panelText: (panel || deepPanels[0])?.textContent?.slice(0, 500) ?? '',
      actionFontFamily: getComputedStyle(document.querySelector('.actions') || document.body).fontFamily,
      playerFontFamily: player ? getComputedStyle(player).fontFamily : null,
    }
  `)
}

async function main() {
  assertFile(GECKODRIVER_BIN, 'geckodriver')
  assertFile(FIREFOX_BIN, 'Firefox binary')

  const xpi = createXpi()
  const profileDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'dmmp-firefox-smoke-'),
  )
  const fixture = process.env.FIREFOX_SMOKE_URL
    ? { server: null, url: process.env.FIREFOX_SMOKE_URL }
    : await createFixtureServer()
  const { server, url } = fixture
  const options = new firefox.Options()
    .setBinary(FIREFOX_BIN)
    .addArguments('-headless', '-no-remote', '-profile', profileDir)
    .setPreference('xpinstall.signatures.required', false)
    .setPreference('extensions.webextensions.restrictedDomains', '')
    .setPreference('extensions.quarantinedDomains.enabled', false)
    .setPreference('devtools.console.stdout.content', true)

  const service = new firefox.ServiceBuilder(GECKODRIVER_BIN)
  let driver

  try {
    driver = await new Builder()
      .forBrowser('firefox')
      .setFirefoxOptions(options)
      .setFirefoxService(service)
      .build()

    const addonId = await driver.installAddon(xpi, true)
    if (addonId !== ADDON_ID) {
      throw new Error(`Unexpected add-on id: ${addonId}`)
    }

    await driver.get(url)
    const fixtureHandle = await driver.getWindowHandle()
    await driver.wait(
      until.elementLocated(By.css('html[dm-loaded="true"]')),
      10000,
    )
    const targetUrl = await driver.getCurrentUrl()

    const extensionUuid = await waitForExtensionUuid(profileDir)
    const popupMenuProbe = process.env.FIREFOX_SMOKE_ASSERT_POPUP_MENU
      ? await assertPopupMenu(driver, extensionUuid, targetUrl, fixtureHandle)
      : null
    const popupOpenSettingProbe = process.env
      .FIREFOX_SMOKE_ASSERT_POPUP_OPEN_SETTING
      ? await assertPopupOpenSetting(
          driver,
          extensionUuid,
          targetUrl,
          fixtureHandle,
        )
      : null
    await driver.switchTo().newWindow('tab')
    await driver.get(
      `moz-extension://${extensionUuid}/popup.html?targetUrl=${encodeURIComponent(
        targetUrl,
      )}&autostart=1`,
    )
    await waitForPopupDone(driver)
    const popupAttrs = await readHtmlAttrs(driver)

    await driver.switchTo().window(fixtureHandle)
    if (popupAttrs['data-dm-popup-error'] === 'helloFailed') {
      const pageAttrs = await readHtmlAttrs(driver)
      throw new Error(
        `Popup failed to communicate with page: ${JSON.stringify({
          popupAttrs,
          pageAttrs,
        })}`,
      )
    }

    await driver.wait(
      until.elementLocated(By.css('html[dm-popup-hello="true"]')),
      10000,
    )
    const pageAttrs = await readHtmlAttrs(driver)
    const floatButtonProbe = process.env.FIREFOX_SMOKE_ASSERT_FLOAT_BUTTON
      ? await assertFloatButtonVisible(driver, fixtureHandle)
      : null
    const pipProbe = await maybeTriggerPip(driver, fixtureHandle)

    if (popupAttrs['data-dm-popup-status'] !== 'request-pip') {
      throw new Error(
        `Popup did not reach request-pip: ${JSON.stringify({
          popupAttrs,
          pageAttrs,
        })}`,
      )
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          addonId,
          extensionUuid,
          targetUrl,
          popupStatus: popupAttrs['data-dm-popup-status'],
          popupError: popupAttrs['data-dm-popup-error'] || null,
          pageAttrs,
          popupMenuProbe,
          popupOpenSettingProbe,
          floatButtonProbe,
          pipProbe,
        },
        null,
        2,
      ),
    )
  } finally {
    await driver?.quit().catch(() => {})
    server?.close()
    fs.rmSync(xpi, { force: true })
    if (!process.env.KEEP_FIREFOX_SMOKE_PROFILE) {
      fs.rmSync(profileDir, { force: true, recursive: true })
    } else {
      console.error(`Kept Firefox smoke profile: ${profileDir}`)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
