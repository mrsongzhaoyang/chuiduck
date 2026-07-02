<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { NButton, NTag } from 'naive-ui'

const appStore = useAppStore()
</script>

<template>
  <div class="browser-widget card compact">
    <div class="widget-header">
      <h3 class="section-title">浏览器连接状态</h3>
      <NTag :type="appStore.browserInfo.connected ? 'success' : 'error'" size="small" round>
        Chrome {{ appStore.browserInfo.connected ? '● 已连接' : '● 未连接' }}
      </NTag>
    </div>

    <div class="browser-info">
      <div class="info-row">
        <span class="info-label">账号</span>
        <span class="info-value">{{ appStore.browserInfo.account }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">窗口</span>
        <span class="info-value">{{ appStore.browserInfo.windows }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Tab</span>
        <span class="info-value">{{ appStore.browserInfo.tabs }}</span>
      </div>
    </div>

    <NButton block secondary size="small" style="margin-top: 8px" @click="appStore.restartBrowser()">
      🔄 刷新插件连接
    </NButton>
  </div>
</template>

<style scoped>
.widget-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.section-title {
  margin-bottom: 0;
  font-size: 13px;
}

.browser-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.info-label {
  color: var(--text-secondary);
}

.info-value {
  color: var(--text-primary);
  font-weight: 500;
}
</style>
