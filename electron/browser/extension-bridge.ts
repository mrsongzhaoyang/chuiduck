import { WebSocketServer, WebSocket } from 'ws'
import { randomUUID } from 'node:crypto'
import type { BrowserStatus } from '../../shared/types.js'
import { getSetting, setSetting } from '../db/index.js'

export type ExtensionTabInfo = {
  id: string
  title: string
  url: string
  active: boolean
}

type ExtensionClient = {
  ws: WebSocket
  clientId: string
  browserVersion?: string
  profileName?: string
  tabs: ExtensionTabInfo[]
  lastSeen: number
}

type PendingCdp = {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const DEFAULT_PORT = 37892
const HEARTBEAT_TIMEOUT_MS = 15000

let wss: WebSocketServer | null = null
let activeClient: ExtensionClient | null = null
const pendingCdp = new Map<string, PendingCdp>()
let selectedTabId: string | null = null
let onStatusChange: ((status: BrowserStatus) => void) | null = null
let lastSnapshot = ''

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export function getBridgeToken() {
  let token = getSetting('bridgeToken', '')
  if (!token) {
    token = randomUUID().replace(/-/g, '').slice(0, 16)
    setSetting('bridgeToken', token)
  }
  return token
}

export function getBridgePort() {
  return Number(getSetting('bridgePort', String(DEFAULT_PORT))) || DEFAULT_PORT
}

export function setBridgePort(port: number) {
  setSetting('bridgePort', String(port))
}

function isUsablePageUrl(url: string) {
  if (!url) return false
  if (url.startsWith('devtools://')) return false
  if (url.startsWith('chrome-extension://')) return false
  if (url.includes('BackgroundServiceWorker')) return false
  return true
}

function rankTab(a: ExtensionTabInfo, b: ExtensionTabInfo) {
  const score = (t: ExtensionTabInfo) => {
    if (t.url.startsWith('http')) return 4
    if (t.url !== 'about:blank' && t.url !== 'chrome://newtab/') return 3
    if (t.url === 'chrome://newtab/') return 2
    if (t.url !== 'about:blank') return 1
    return 0
  }
  return score(b) - score(a)
}

function pickBestTabId(tabs: ExtensionTabInfo[], preferredId?: string | null) {
  const usable = tabs.filter((t) => isUsablePageUrl(t.url)).sort(rankTab)
  if (preferredId) {
    const matched = usable.find((t) => t.id === preferredId)
    if (matched) return matched.id
  }
  return usable[0]?.id || null
}

function statusSnapshot(status: BrowserStatus) {
  return [
    status.connected,
    status.extensionOnline,
    status.tabs,
    status.windowsList.map((w) => `${w.id}:${w.url}`).join('|'),
  ].join(';')
}

export function buildBrowserStatus(extensionPath = ''): BrowserStatus {
  const port = getBridgePort()
  const token = getBridgeToken()

  if (!activeClient || activeClient.ws.readyState !== WebSocket.OPEN) {
  return {
    connected: false,
    extensionOnline: false,
    bridgePort: port,
    bridgeToken: token,
    extensionPath,
    cdpDetected: false,
    cdpPort: port,
    chromePath: '',
    account: getSetting('browserAccount', ''),
      windows: 0,
      tabs: 0,
      windowsList: [],
      error: 'Chrome 插件未连接。请安装插件并打开 Chrome，在插件中填入配对码。',
    }
  }

  const stale = Date.now() - activeClient.lastSeen > HEARTBEAT_TIMEOUT_MS
  if (stale) {
    return {
      connected: false,
      extensionOnline: false,
      bridgePort: port,
      bridgeToken: token,
      extensionPath,
      browserVersion: activeClient.browserVersion,
      cdpDetected: false,
      cdpPort: port,
      chromePath: '',
      account: activeClient.profileName || getSetting('browserAccount', '本机 Chrome'),
      windows: 0,
      tabs: 0,
      windowsList: [],
      error: '插件心跳超时，请刷新 Chrome 或重新打开插件。',
    }
  }

  const tabs = activeClient.tabs.filter((t) => isUsablePageUrl(t.url)).sort(rankTab)
  const savedId = getSetting('selectedWindowId', selectedTabId || '')
  const savedValid = savedId && tabs.some((t) => t.id === savedId) ? savedId : null
  const bestId = pickBestTabId(tabs, savedValid || selectedTabId)
  if (bestId && bestId !== savedId) {
    selectedTabId = bestId
    setSetting('selectedWindowId', bestId)
  } else if (bestId) {
    selectedTabId = bestId
  }

  const windowsList = tabs.map((t, index) => ({
    id: t.id,
    name: t.title || `标签页 ${index + 1}`,
    url: t.url,
    selected: bestId ? t.id === bestId : index === 0,
  }))

  return {
    connected: true,
    extensionOnline: true,
    bridgePort: port,
    bridgeToken: token,
    extensionPath,
    browserVersion: activeClient.browserVersion,
    clientId: activeClient.clientId,
    cdpDetected: true,
    cdpPort: port,
    chromePath: '',
    account: activeClient.profileName || getSetting('browserAccount', '本机 Chrome'),
    windows: tabs.length,
    tabs: tabs.length,
    windowsList,
  }
}

function emitStatus(extensionPath = '') {
  const status = buildBrowserStatus(extensionPath)
  const snapshot = statusSnapshot(status)
  if (snapshot !== lastSnapshot) {
    lastSnapshot = snapshot
    onStatusChange?.(status)
  }
  return status
}

function rejectClient(reason: string) {
  activeClient = null
  for (const pending of pendingCdp.values()) {
    clearTimeout(pending.timer)
    pending.reject(new Error(reason))
  }
  pendingCdp.clear()
}

function handleExtensionMessage(raw: string, extensionPath: string) {
  let msg: Record<string, unknown>
  try {
    msg = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return
  }

  const type = msg.type as string

  if (type === 'hello' || type === 'heartbeat') {
    if (!activeClient) return
    activeClient.lastSeen = Date.now()
    if (msg.browserVersion) activeClient.browserVersion = String(msg.browserVersion)
    if (msg.profileName) activeClient.profileName = String(msg.profileName)
    if (Array.isArray(msg.tabs)) {
      activeClient.tabs = (msg.tabs as ExtensionTabInfo[]).map((t) => ({
        id: String(t.id),
        title: String(t.title || ''),
        url: String(t.url || ''),
        active: !!t.active,
      }))
    }
    if (type === 'hello') {
      activeClient.ws.send(
        JSON.stringify({
          type: 'hello-ok',
          selectedTabId: Number(getSetting('selectedWindowId', selectedTabId || '') || 0) || undefined,
        })
      )
    }
    emitStatus(extensionPath)
    return
  }

  if (type === 'cdp-result') {
    const requestId = String(msg.requestId || '')
    const pending = pendingCdp.get(requestId)
    if (!pending) return
    clearTimeout(pending.timer)
    pendingCdp.delete(requestId)
    if (msg.error) pending.reject(new Error(String(msg.error)))
    else pending.resolve(msg.result)
    return
  }

  if (type === 'console') {
    // reserved for future console forwarding
  }
}

function handleConnection(ws: WebSocket, extensionPath: string) {
  ws.on('message', (data) => {
    const text = typeof data === 'string' ? data : data.toString()

    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(text) as Record<string, unknown>
    } catch {
      ws.close()
      return
    }

    const type = msg.type as string

    if (type === 'hello') {
      const token = String(msg.token || '')
      if (token !== getBridgeToken()) {
        ws.send(JSON.stringify({ type: 'error', message: '配对码错误，请从垂钓鸭「浏览器管理」重新复制' }))
        ws.close()
        return
      }

      if (activeClient && activeClient.ws !== ws) {
        try {
          activeClient.ws.close()
        } catch {
          /* ignore */
        }
      }

      activeClient = {
        ws,
        clientId: String(msg.clientId || randomUUID()),
        browserVersion: msg.browserVersion ? String(msg.browserVersion) : undefined,
        profileName: msg.profileName ? String(msg.profileName) : undefined,
        tabs: Array.isArray(msg.tabs) ? (msg.tabs as ExtensionTabInfo[]) : [],
        lastSeen: Date.now(),
      }

      ws.send(
        JSON.stringify({
          type: 'hello-ok',
          selectedTabId: Number(getSetting('selectedWindowId', selectedTabId || '') || 0) || undefined,
        })
      )
      emitStatus(extensionPath)
      return
    }

    if (!activeClient || ws !== activeClient.ws) {
      ws.close()
      return
    }

    handleExtensionMessage(text, extensionPath)
  })

  ws.on('close', () => {
    if (activeClient?.ws === ws) {
      rejectClient('Chrome 插件已断开')
      emitStatus(extensionPath)
    }
  })

  ws.on('error', () => {
    if (activeClient?.ws === ws) {
      rejectClient('Chrome 插件连接异常')
      emitStatus(extensionPath)
    }
  })
}

export function startExtensionBridge(
  listener: (status: BrowserStatus) => void,
  extensionPath = ''
) {
  onStatusChange = listener
  if (wss) return wss

  const port = getBridgePort()
  wss = new WebSocketServer({ host: '127.0.0.1', port })

  wss.on('connection', (ws) => handleConnection(ws, extensionPath))
  wss.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[bridge] 端口 ${port} 被占用，尝试使用现有服务`)
    } else {
      console.error('[bridge]', err)
    }
  })

  return wss
}

export function stopExtensionBridge() {
  if (wss) {
    wss.close()
    wss = null
  }
  rejectClient('桥接服务已停止')
  onStatusChange = null
  lastSnapshot = ''
}

export function isExtensionConnected() {
  if (!activeClient || activeClient.ws.readyState !== WebSocket.OPEN) return false
  return Date.now() - activeClient.lastSeen <= HEARTBEAT_TIMEOUT_MS
}

export async function waitForExtension(timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (isExtensionConnected()) return true
    await sleep(500)
  }
  return false
}

export function selectExtensionTab(targetId: string) {
  selectedTabId = targetId
  setSetting('selectedWindowId', targetId)
  if (activeClient?.ws.readyState === WebSocket.OPEN) {
    activeClient.ws.send(JSON.stringify({ type: 'select-tab', tabId: Number(targetId) }))
  }
}

export function getSelectedTabId() {
  if (!activeClient) {
    const saved = getSetting('selectedWindowId', selectedTabId || '')
    return saved || null
  }

  const tabs = activeClient.tabs.filter((t) => isUsablePageUrl(t.url)).sort(rankTab)
  const saved = getSetting('selectedWindowId', selectedTabId || '')
  const savedValid = saved && tabs.some((t) => t.id === saved) ? saved : null
  const id = pickBestTabId(tabs, savedValid || selectedTabId)

  if (id && id !== saved) {
    selectedTabId = id
    setSetting('selectedWindowId', id)
  } else if (id) {
    selectedTabId = id
  }

  return id
}

export async function sendCdpCommand(
  tabId: number | string,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 60000
) {
  if (!activeClient || activeClient.ws.readyState !== WebSocket.OPEN) {
    throw new Error('Chrome 插件未连接，请先安装插件并打开 Chrome')
  }

  const requestId = randomUUID()
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCdp.delete(requestId)
      reject(new Error(`${method} 执行超时`))
    }, timeoutMs)

    pendingCdp.set(requestId, { resolve, reject, timer })

    activeClient!.ws.send(
      JSON.stringify({
        type: 'cdp',
        requestId,
        tabId: Number(tabId),
        method,
        params,
      })
    )
  })
}

export function requestExtensionRefresh() {
  if (activeClient?.ws.readyState === WebSocket.OPEN) {
    activeClient.ws.send(JSON.stringify({ type: 'refresh-tabs' }))
  }
}

let watcherTimer: ReturnType<typeof setInterval> | null = null

export function startExtensionWatcher(extensionPath: string) {
  stopExtensionWatcher()
  watcherTimer = setInterval(() => {
    emitStatus(extensionPath)
  }, 2500)
  emitStatus(extensionPath)
}

export function stopExtensionWatcher() {
  if (watcherTimer) {
    clearInterval(watcherTimer)
    watcherTimer = null
  }
}

export function disconnectExtensionClient() {
  if (activeClient?.ws.readyState === WebSocket.OPEN) {
    activeClient.ws.close()
  }
  activeClient = null
  emitStatus()
}
