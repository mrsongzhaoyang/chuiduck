import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'url'
import fs from 'fs-extra'
import { app } from 'electron'
import type { BrowserStatus } from '../../shared/types.js'
import { getPaths } from '../paths.js'
import { getSetting, setSetting } from '../db/index.js'
import {
  buildBrowserStatus,
  disconnectExtensionClient,
  getBridgePort,
  getBridgeToken,
  getSelectedTabId,
  isExtensionConnected,
  requestExtensionRefresh,
  selectExtensionTab,
  setBridgePort,
  startExtensionBridge,
  startExtensionWatcher,
  stopExtensionBridge,
  stopExtensionWatcher,
  waitForExtension,
} from './extension-bridge.js'
import { ExtensionPage } from './extension-page.js'
import type { BrowserPage } from './browser-page.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DEFAULT_CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : '',
].filter(Boolean)

let extensionInstallPath = ''

function getBundledExtensionDir() {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'chrome-extension')
  }
  return join(__dirname, '../../chrome-extension')
}

/** 将插件复制到用户目录，供「加载已解压的扩展程序」使用 */
export async function ensureExtensionBundle() {
  const src = getBundledExtensionDir()
  const dest = join(getPaths().root, 'chrome-extension')
  if (await fs.pathExists(src)) {
    await fs.copy(src, dest, { overwrite: true })
  }
  extensionInstallPath = dest
  return dest
}

export function getExtensionInstallPath() {
  return extensionInstallPath
}

export function getBridgeInfo() {
  return {
    port: getBridgePort(),
    token: getBridgeToken(),
    extensionPath: extensionInstallPath,
  }
}

export function getConfiguredChromePath() {
  return getSetting('chromePath', '').trim()
}

export function getConfiguredChromeUserDataDir() {
  return getSetting('chromeUserDataDir', '').trim()
}

export function getDefaultChromeUserDataDir() {
  const dir = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data')
    : ''
  return dir && fs.existsSync(dir) ? dir : ''
}

export function getChromePath() {
  const configured = getConfiguredChromePath()
  if (configured && fs.existsSync(configured)) return configured
  for (const p of DEFAULT_CHROME_PATHS) {
    if (fs.existsSync(p)) return p
  }
  return configured || DEFAULT_CHROME_PATHS[0] || ''
}

export async function connectBrowser() {
  const ready = await waitForExtension(5000)
  if (!ready) {
    throw new Error(
      'Chrome 插件未连接。请先安装垂钓鸭插件，打开 Chrome，并在插件选项中填入配对码。'
    )
  }
  requestExtensionRefresh()
  return buildBrowserStatus(extensionInstallPath)
}

export async function disconnectBrowser() {
  disconnectExtensionClient()
  return buildBrowserStatus(extensionInstallPath)
}

export async function getTaskPage(): Promise<BrowserPage> {
  if (!isExtensionConnected()) {
    await connectBrowser()
  }

  requestExtensionRefresh()
  await new Promise((r) => setTimeout(r, 300))

  const tabId = getSelectedTabId()
  if (!tabId) {
    throw new Error('未找到可用标签页。请先在 Chrome 中打开要操作的页面，或在浏览器管理中选择 Tab。')
  }

  return new ExtensionPage(tabId)
}

export async function getActivePage(): Promise<BrowserPage> {
  return getTaskPage()
}

export function selectWindow(targetId: string) {
  selectExtensionTab(targetId)
}

export async function getBrowserStatus(): Promise<BrowserStatus> {
  return buildBrowserStatus(extensionInstallPath)
}

export async function restartChromeDriver() {
  requestExtensionRefresh()
  disconnectExtensionClient()
  await waitForExtension(10000)
  return getBrowserStatus()
}

export function setChromePath(path: string) {
  setSetting('chromePath', path.trim())
}

export function setChromeUserDataDir(path: string) {
  setSetting('chromeUserDataDir', path.trim())
}

export function setCdpPort(port: number) {
  setBridgePort(port)
}

export function setBrowserAccount(account: string) {
  setSetting('browserAccount', account)
}

/** 普通方式打开 Chrome（无需调试参数） */
export async function launchSystemChrome() {
  const chromePath = getChromePath()
  if (!chromePath || !fs.existsSync(chromePath)) {
    throw new Error('未找到 Chrome，可在设置中配置路径')
  }

  spawn(chromePath, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref()
  await waitForExtension(30000)
  return getBrowserStatus()
}

/** @deprecated 保留 IPC 兼容，改为打开插件目录 */
export async function createChromeDebugShortcut() {
  return ensureExtensionBundle()
}

export function getDebugLaunchCommand() {
  return `插件目录: ${extensionInstallPath}`
}

export function startCdpWatcher(onStatusChange: (status: BrowserStatus) => void) {
  startExtensionBridge(onStatusChange, extensionInstallPath)
  startExtensionWatcher(extensionInstallPath)
}

export function stopCdpWatcher() {
  stopExtensionWatcher()
  stopExtensionBridge()
}

// 兼容旧命名
export const startExtensionStatusWatcher = startCdpWatcher
export const stopExtensionStatusWatcher = stopCdpWatcher
