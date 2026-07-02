<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { getElectronAPI } from '@/api/electron'
import { NTag, NButton, NRadioGroup, NRadio, NInput, useMessage } from 'naive-ui'

const appStore = useAppStore()
const message = useMessage()
const selectedWindow = ref('')
const connecting = ref(false)
const openingDir = ref(false)
const bridgeToken = ref('')
const extensionPath = ref('')

const statusLabel = computed(() => {
  if (appStore.browserInfo.connected) return { type: 'success' as const, text: '● 插件已连接' }
  if (appStore.browserInfo.extensionOnline) return { type: 'warning' as const, text: '● 插件在线' }
  return { type: 'default' as const, text: '● 等待插件连接' }
})

onMounted(async () => {
  syncSelectedWindow()
  await loadBridgeInfo()
})

watch(() => appStore.browserInfo.windowsList, syncSelectedWindow, { deep: true })

function syncSelectedWindow() {
  const selected = appStore.browserInfo.windowsList.find((w) => w.selected)
  selectedWindow.value = selected?.id || appStore.browserInfo.windowsList[0]?.id || ''
}

async function loadBridgeInfo() {
  const api = getElectronAPI()
  if (!api) return
  const info = await api.browserBridgeInfo()
  bridgeToken.value = info.token
  extensionPath.value = info.extensionPath
}

async function copyToken() {
  const token = bridgeToken.value || appStore.browserInfo.bridgeToken || ''
  if (!token) return
  await navigator.clipboard.writeText(token)
  message.success('配对码已复制')
}

async function openExtensionDir() {
  openingDir.value = true
  try {
    const api = getElectronAPI()
    if (!api) throw new Error('请在 Electron 桌面版中操作')
    const result = await api.browserOpenExtensionDir()
    message.success('已打开插件目录')
    extensionPath.value = result.path
  } catch (err) {
    message.error(err instanceof Error ? err.message : '打开失败')
  } finally {
    openingDir.value = false
  }
}

async function handleConnect() {
  connecting.value = true
  try {
    await appStore.connectBrowser()
    syncSelectedWindow()
    message.success('已连接 Chrome 插件')
  } catch (err) {
    message.error(err instanceof Error ? err.message : '连接失败')
  } finally {
    connecting.value = false
  }
}

async function handleLaunchChrome() {
  connecting.value = true
  try {
    await appStore.launchSystemBrowser()
    syncSelectedWindow()
    message.success('已尝试打开 Chrome，等待插件连接…')
  } catch (err) {
    message.error(err instanceof Error ? err.message : '启动失败')
  } finally {
    connecting.value = false
  }
}

async function handleSelectWindow(id: string) {
  selectedWindow.value = id
  await appStore.selectBrowserWindow(id)
}
</script>

<template>
  <div class="browser-manage">
    <h2 class="page-title">浏览器管理</h2>
    <p class="page-desc">
      安装垂钓鸭 Chrome 插件后，用<strong>正常方式</strong>打开 Chrome 即可，无需调试模式，登录态完整保留。
    </p>

    <div class="guide-card card">
      <h3 class="section-title">一次性配置（约 2 分钟）</h3>
      <ol class="guide-steps">
        <li>点击下方「打开插件目录」</li>
        <li>Chrome 地址栏输入 <code>chrome://extensions</code> → 开启「开发者模式」</li>
        <li>点击「加载已解压的扩展程序」→ 选择刚打开的插件文件夹</li>
        <li>复制下方<strong>配对码</strong> → 粘贴到插件「选项/配对设置」中保存</li>
        <li>正常打开 Chrome，插件显示在线即完成</li>
      </ol>
    </div>

    <div class="browser-grid">
      <div class="connection-card card">
        <div class="connection-status">
          <div class="chrome-icon">🧩</div>
          <div>
            <h3>Chrome 插件</h3>
            <NTag :type="statusLabel.type" round>{{ statusLabel.text }}</NTag>
          </div>
        </div>

        <div v-if="appStore.browserInfo.browserVersion" class="version-tip">
          {{ appStore.browserInfo.browserVersion }}
        </div>
        <div v-if="appStore.browserInfo.error && !appStore.browserInfo.connected" class="error-tip">
          {{ appStore.browserInfo.error }}
        </div>

        <div class="pair-block">
          <span class="label">配对码</span>
          <div class="pair-row">
            <NInput :value="bridgeToken || appStore.browserInfo.bridgeToken || ''" readonly />
            <NButton secondary @click="copyToken">复制</NButton>
          </div>
        </div>

        <div class="connection-details">
          <div class="detail-row">
            <span class="label">桥接端口</span>
            <span class="value">{{ appStore.browserInfo.bridgePort || 37892 }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Tab 数</span>
            <span class="value">{{ appStore.browserInfo.tabs }}</span>
          </div>
          <div v-if="extensionPath" class="detail-row">
            <span class="label">插件目录</span>
            <span class="value path">{{ extensionPath }}</span>
          </div>
        </div>

        <div class="connection-actions">
          <NButton type="primary" block :loading="openingDir" @click="openExtensionDir">
            打开插件目录
          </NButton>
          <NButton block :loading="connecting" @click="handleConnect">刷新连接状态</NButton>
          <NButton block :loading="connecting" @click="handleLaunchChrome">打开 Chrome</NButton>
        </div>
      </div>

      <div class="window-select card">
        <h3 class="section-title">选择操作 Tab</h3>
        <p class="section-desc">插件连接成功后自动同步标签页，任务在你选中的 Tab 上执行</p>

        <div v-if="appStore.browserInfo.windowsList.length === 0" class="empty">
          {{ appStore.browserInfo.connected ? '暂无可用标签页' : '安装插件并配对后自动显示' }}
        </div>

        <NRadioGroup
          v-else
          :value="selectedWindow"
          class="window-list"
          @update:value="handleSelectWindow"
        >
          <div
            v-for="win in appStore.browserInfo.windowsList"
            :key="win.id"
            class="window-option"
          >
            <NRadio :value="win.id">
              <span class="window-name">🪟 {{ win.name }}</span>
              <span class="window-url">{{ win.url }}</span>
            </NRadio>
          </div>
        </NRadioGroup>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: -12px;
  margin-bottom: 16px;
  max-width: 960px;
  line-height: 1.6;
}

.guide-card {
  max-width: 960px;
  margin-bottom: 16px;
  padding: 16px 20px;
}

.guide-steps {
  margin: 0 0 0 18px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.9;
}

.guide-steps code {
  background: var(--bg-elevated);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
}

.browser-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  max-width: 960px;
}

@media (max-width: 1100px) {
  .browser-grid {
    grid-template-columns: 1fr;
  }
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}

.chrome-icon {
  font-size: 36px;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-elevated);
  border-radius: 12px;
}

.connection-status h3 {
  font-size: 16px;
  margin-bottom: 4px;
}

.pair-block {
  margin-bottom: 16px;
}

.pair-block .label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.pair-row {
  display: flex;
  gap: 8px;
}

.version-tip {
  font-size: 12px;
  color: var(--success);
  margin-bottom: 8px;
}

.error-tip {
  color: var(--text-secondary);
  font-size: 12px;
  margin-bottom: 12px;
}

.connection-details {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  gap: 12px;
}

.detail-row .label {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.detail-row .value {
  font-weight: 500;
  text-align: right;
  word-break: break-all;
}

.connection-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.empty {
  color: var(--text-muted);
  font-size: 13px;
}

.window-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.window-option {
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--bg-elevated);
}

.window-name {
  display: block;
  font-size: 14px;
}

.window-url {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
  word-break: break-all;
}
</style>
