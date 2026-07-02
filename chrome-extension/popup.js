async function refresh() {
  const data = await chrome.storage.local.get([
    'bridgeStatus',
    'bridgeStatusMessage',
  ])

  const status = data.bridgeStatus || 'offline'
  const message = data.bridgeStatusMessage || '未连接'

  document.getElementById('statusText').textContent = message
  const dot = document.getElementById('statusDot')
  dot.className = `status-dot ${status}`

  const tabs = await chrome.tabs.query({ currentWindow: true })
  const list = document.getElementById('tabList')
  list.innerHTML = ''

  for (const tab of tabs) {
    if (!tab.url || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('devtools://')) {
      continue
    }
    const li = document.createElement('li')
    if (tab.active) li.classList.add('active')
    li.textContent = `${tab.title || '无标题'} — ${tab.url}`
    list.appendChild(li)
  }
}

document.getElementById('openOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage()
})

void refresh()
setInterval(refresh, 2000)
