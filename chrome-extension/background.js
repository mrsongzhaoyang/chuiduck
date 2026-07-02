const DEFAULT_PORT = 37892
const HEARTBEAT_MS = 4000
const RECONNECT_MS = 3000

/** @type {WebSocket | null} */
let socket = null
/** @type {ReturnType<typeof setTimeout> | null} */
let reconnectTimer = null
/** @type {Set<number>} */
const attachedTabs = new Set()
/** @type {Map<string, { resolve: Function, reject: Function }>} */
const pendingCdp = new Map()
/** @type {number | undefined} */
let selectedTabId = undefined
/** @type {'offline' | 'connecting' | 'online' | 'error'} */
let status = 'offline'
/** @type {string} */
let statusMessage = '未连接'

async function getConfig() {
  const data = await chrome.storage.local.get(['bridgeToken', 'bridgePort', 'clientId'])
  return {
    token: data.bridgeToken || '',
    port: Number(data.bridgePort) || DEFAULT_PORT,
    clientId: data.clientId || crypto.randomUUID(),
  }
}

async function saveClientId(clientId) {
  await chrome.storage.local.set({ clientId })
}

function setStatus(next, message) {
  status = next
  statusMessage = message
  chrome.storage.local.set({ bridgeStatus: next, bridgeStatusMessage: message })
}

function isUsableUrl(url) {
  if (!url) return false
  return url.startsWith('http://') || url.startsWith('https://')
}

async function listTabs() {
  const tabs = await chrome.tabs.query({})
  return tabs
    .filter((t) => isUsableUrl(t.url || ''))
    .map((t) => ({
      id: String(t.id),
      title: t.title || '',
      url: t.url || '',
      active: !!t.active,
    }))
}

async function resolveTabId(preferredId) {
  const tabs = await chrome.tabs.query({})
  const usable = tabs.filter((t) => isUsableUrl(t.url || ''))

  if (preferredId) {
    const matched = usable.find((t) => t.id === preferredId)
    if (matched?.id) return matched.id
  }

  const active = usable.find((t) => t.active) || usable[0]
  if (!active?.id) {
    throw new Error('没有可用的标签页，请先在 Chrome 中打开要操作的网页')
  }
  return active.id
}

async function ensureAttached(tabId) {
  if (attachedTabs.has(tabId)) return
  await chrome.debugger.attach({ tabId }, '1.3')
  attachedTabs.add(tabId)
}

async function detachTab(tabId) {
  if (!attachedTabs.has(tabId)) return
  try {
    await chrome.debugger.detach({ tabId })
  } catch {
    /* ignore */
  }
  attachedTabs.delete(tabId)
}

async function sendCdp(tabId, method, params = {}) {
  await ensureAttached(tabId)
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
      } else {
        resolve(result)
      }
    })
  })
}

async function sendHello() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  const config = await getConfig()
  const tabs = await listTabs()
  socket.send(
    JSON.stringify({
      type: 'hello',
      token: config.token,
      clientId: config.clientId,
      browserVersion: navigator.userAgent,
      profileName: 'Chrome',
      tabs,
    })
  )
}

async function sendHeartbeat() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  const tabs = await listTabs()
  socket.send(JSON.stringify({ type: 'heartbeat', tabs }))
}

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void connect()
  }, RECONNECT_MS)
}

function forceReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (socket) {
    try {
      socket.onclose = null
      socket.close()
    } catch {
      /* ignore */
    }
    socket = null
  }
  return connect()
}

async function connect() {
  const config = await getConfig()
  if (!config.token) {
    setStatus('error', '请先在插件选项中填写配对码')
    return
  }

  await saveClientId(config.clientId)

  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return
  }

  setStatus('connecting', '正在连接垂钓鸭…')

  const ws = new WebSocket(`ws://127.0.0.1:${config.port}`)
  socket = ws

  ws.onopen = () => {
    setStatus('online', '已连接垂钓鸭')
    void sendHello()
  }

  ws.onmessage = (event) => {
    let msg
    try {
      msg = JSON.parse(String(event.data))
    } catch {
      return
    }

    if (msg.type === 'error') {
      setStatus('error', msg.message || '连接失败')
      ws.close()
      return
    }

    if (msg.type === 'hello-ok') {
      if (msg.selectedTabId) selectedTabId = Number(msg.selectedTabId)
      setStatus('online', '已连接 · 就绪')
      return
    }

    if (msg.type === 'select-tab') {
      selectedTabId = Number(msg.tabId)
      if (selectedTabId) {
        chrome.tabs.update(selectedTabId, { active: true })
      }
      return
    }

    if (msg.type === 'refresh-tabs') {
      void sendHeartbeat()
      return
    }

    if (msg.type === 'open-tab') {
      void handleOpenTab(msg)
      return
    }

    if (msg.type === 'cdp') {
      void handleCdpRequest(msg)
    }
  }

  ws.onclose = () => {
    socket = null
    setStatus('offline', '连接已断开，正在重试…')
    scheduleReconnect()
  }

  ws.onerror = () => {
    setStatus('error', '无法连接桌面端，请确认垂钓鸭已启动')
    ws.close()
  }
}

async function handleOpenTab(msg) {
  const requestId = String(msg.requestId)
  try {
    const tab = await chrome.tabs.create({ url: String(msg.url || 'about:blank'), active: true })
    if (!tab.id) throw new Error('创建标签页失败')
    selectedTabId = tab.id
    socket?.send(JSON.stringify({ type: 'open-tab-result', requestId, tabId: tab.id }))
    void sendHeartbeat()
  } catch (err) {
    socket?.send(
      JSON.stringify({
        type: 'open-tab-result',
        requestId,
        error: err instanceof Error ? err.message : String(err),
      })
    )
  }
}

async function handleCdpRequest(msg) {
  const requestId = String(msg.requestId)
  try {
    const tabId = await resolveTabId(Number(msg.tabId))
    selectedTabId = tabId
    const result = await sendCdp(tabId, String(msg.method), msg.params || {})
    socket?.send(JSON.stringify({ type: 'cdp-result', requestId, result, tabId }))
  } catch (err) {
    socket?.send(
      JSON.stringify({
        type: 'cdp-result',
        requestId,
        error: err instanceof Error ? err.message : String(err),
      })
    )
  }
}

chrome.tabs.onUpdated.addListener(() => {
  void sendHeartbeat()
})

chrome.tabs.onActivated.addListener(() => {
  void sendHeartbeat()
})

chrome.tabs.onRemoved.addListener((tabId) => {
  void detachTab(tabId)
  if (selectedTabId === tabId) selectedTabId = undefined
  void sendHeartbeat()
})

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId) attachedTabs.delete(source.tabId)
})

chrome.runtime.onStartup.addListener(() => {
  void connect()
})

chrome.runtime.onInstalled.addListener(() => {
  void connect()
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.bridgeToken || changes.bridgePort)) {
    void forceReconnect()
  }
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'reconnect') {
    void forceReconnect().then(() => sendResponse({ ok: true }))
    return true
  }
  return false
})

setInterval(() => {
  if (socket?.readyState === WebSocket.OPEN) void sendHeartbeat()
  else void connect()
}, 4000)

chrome.alarms.create('reconnect', { periodInMinutes: 1 })
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'reconnect' && socket?.readyState !== WebSocket.OPEN) {
    void connect()
  }
})

void connect()
