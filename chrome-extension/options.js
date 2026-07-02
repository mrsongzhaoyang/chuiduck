async function load() {
  const data = await chrome.storage.local.get(['bridgeToken', 'bridgePort'])
  if (data.bridgeToken) document.getElementById('token').value = data.bridgeToken
  if (data.bridgePort) document.getElementById('port').value = String(data.bridgePort)
  updateStatusUI(data)
}

function updateStatusUI(data) {
  const status = data.bridgeStatus || 'offline'
  const message = data.bridgeStatusMessage || '未连接'
  const el = document.getElementById('msg')

  if (status === 'online') {
    el.textContent = `✓ ${message}`
    el.style.color = '#34a853'
  } else if (status === 'error') {
    el.textContent = message
    el.style.color = '#ea4335'
  } else if (status === 'connecting') {
    el.textContent = message || '正在连接…'
    el.style.color = '#fbbc04'
  } else {
    el.textContent = message
    el.style.color = '#9aa0a6'
  }
}

async function refreshStatus() {
  const data = await chrome.storage.local.get(['bridgeStatus', 'bridgeStatusMessage'])
  updateStatusUI(data)
}

document.getElementById('save').addEventListener('click', async () => {
  const token = document.getElementById('token').value.trim()
  const port = Number(document.getElementById('port').value) || 37892
  if (!token) {
    document.getElementById('msg').textContent = '请填写配对码'
    document.getElementById('msg').style.color = '#ea4335'
    return
  }

  await chrome.storage.local.set({ bridgeToken: token, bridgePort: port })

  try {
    await chrome.runtime.sendMessage({ type: 'reconnect' })
  } catch {
    /* service worker 可能尚未就绪，storage 变更会触发重连 */
  }

  document.getElementById('msg').textContent = '已保存，正在连接…'
  document.getElementById('msg').style.color = '#fbbc04'
  setTimeout(refreshStatus, 500)
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.bridgeStatus || changes.bridgeStatusMessage)) {
    refreshStatus()
  }
})

setInterval(refreshStatus, 1000)
void load()
