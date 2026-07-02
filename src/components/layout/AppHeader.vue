<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useNotificationStore } from '@/stores/notifications'
import {
  SearchOutline,
  NotificationsOutline,
  HelpCircleOutline,
  RemoveOutline,
  SquareOutline,
  CloseOutline,
} from '@vicons/ionicons5'
import { NInput, NIcon, NBadge } from 'naive-ui'
import NotificationPanel from '@/components/layout/NotificationPanel.vue'
import HelpGuideDrawer from '@/components/layout/HelpGuideDrawer.vue'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const notificationStore = useNotificationStore()

const searchFocused = ref(false)
const notificationOpen = ref(false)
const helpOpen = ref(false)
const notificationWrapRef = ref<HTMLElement | null>(null)

const breadcrumb = computed(() => {
  return (route.meta.breadcrumb as string[]) || [route.meta.title as string]
})

const statusText = computed(() => {
  const map = { optimal: '运行正常', warning: '部分异常', error: '系统异常' }
  return map[appStore.systemStatus]
})

const statusColor = computed(() => {
  const map = { optimal: '#52c41a', warning: '#FF9F1C', error: '#ff4757' }
  return map[appStore.systemStatus]
})

const showSearchDropdown = computed(
  () => searchFocused.value && appStore.searchQuery.trim().length > 0
)

const typeLabels = { skill: '技能包', task: '任务', export: '导出' } as const

function navigateSearch(path: string) {
  appStore.searchQuery = ''
  searchFocused.value = false
  router.push(path)
}

function windowControl(action: 'minimize' | 'maximize' | 'close') {
  window.electronAPI?.[action]?.()
}

function toggleNotifications() {
  notificationOpen.value = !notificationOpen.value
  if (notificationOpen.value) {
    notificationStore.markAllAsRead()
  }
}

function closeNotifications() {
  notificationOpen.value = false
}

function onDocumentClick(e: MouseEvent) {
  if (!notificationOpen.value) return
  const el = notificationWrapRef.value
  if (el && !el.contains(e.target as Node)) {
    notificationOpen.value = false
  }
}

onMounted(() => document.addEventListener('mousedown', onDocumentClick))
onUnmounted(() => document.removeEventListener('mousedown', onDocumentClick))
</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <nav class="breadcrumb">
        <template v-for="(item, index) in breadcrumb" :key="index">
          <span v-if="index > 0" class="breadcrumb-sep">/</span>
          <span
            class="breadcrumb-item"
            :class="{ current: index === breadcrumb.length - 1 }"
          >
            {{ item }}
          </span>
        </template>
      </nav>
    </div>

    <div class="header-center">
      <div class="search-wrap">
        <NInput
          v-model:value="appStore.searchQuery"
          placeholder="搜索任务、技能或导出文件..."
          round
          clearable
          class="search-input"
          @focus="searchFocused = true"
          @blur="searchFocused = false"
        >
          <template #prefix>
            <NIcon :size="16" color="#5c6578">
              <SearchOutline />
            </NIcon>
          </template>
        </NInput>

        <div v-if="showSearchDropdown" class="search-dropdown">
          <template v-if="appStore.globalSearchResults.length">
            <button
              v-for="item in appStore.globalSearchResults"
              :key="`${item.type}-${item.id}`"
              class="search-result"
              @mousedown.prevent="navigateSearch(item.path)"
            >
              <span class="result-type">{{ typeLabels[item.type] }}</span>
              <span class="result-title">{{ item.title }}</span>
              <span class="result-sub">{{ item.subtitle }}</span>
            </button>
          </template>
          <div v-else class="search-empty">无匹配结果</div>
        </div>
      </div>
    </div>

    <div class="header-right">
      <div class="status-badge">
        <span class="status-dot" :style="{ background: statusColor }" />
        <span class="status-text">{{ statusText }}</span>
      </div>

      <div ref="notificationWrapRef" class="notification-wrap">
        <NBadge
          :value="notificationStore.unreadCount || undefined"
          :max="99"
          class="header-icon-btn"
        >
          <button
            class="icon-btn"
            :class="{ active: notificationOpen }"
            title="通知中心"
            @click="toggleNotifications"
          >
            <NIcon :size="18">
              <NotificationsOutline />
            </NIcon>
          </button>
        </NBadge>

        <div v-if="notificationOpen" class="notification-dropdown">
          <NotificationPanel @close="closeNotifications" />
        </div>
      </div>

      <button class="icon-btn" title="使用引导" @click="helpOpen = true">
        <NIcon :size="18">
          <HelpCircleOutline />
        </NIcon>
      </button>

      <HelpGuideDrawer v-model:show="helpOpen" />

      <div class="window-controls">
        <button class="win-btn" @click="windowControl('minimize')">
          <NIcon :size="14"><RemoveOutline /></NIcon>
        </button>
        <button class="win-btn" @click="windowControl('maximize')">
          <NIcon :size="14"><SquareOutline /></NIcon>
        </button>
        <button class="win-btn win-btn-close" @click="windowControl('close')">
          <NIcon :size="14"><CloseOutline /></NIcon>
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  height: var(--header-height);
  display: flex;
  align-items: center;
  padding: 0 16px 0 20px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-color);
  -webkit-app-region: drag;
  flex-shrink: 0;
  gap: 16px;
}

.header-left {
  flex-shrink: 0;
  min-width: 160px;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.breadcrumb-sep {
  color: var(--text-muted);
}

.breadcrumb-item {
  color: var(--text-secondary);
}

.breadcrumb-item.current {
  color: var(--text-primary);
  font-weight: 500;
}

.header-center {
  flex: 1;
  max-width: 420px;
  margin: 0 auto;
  -webkit-app-region: no-drag;
}

.search-wrap {
  position: relative;
  width: 100%;
}

.search-input {
  width: 100%;
}

.search-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  max-height: 320px;
  overflow-y: auto;
  z-index: 100;
  padding: 6px;
}

.search-result {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  gap: 2px 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.search-result:hover {
  background: var(--bg-elevated);
}

.result-type {
  grid-row: span 2;
  align-self: center;
  font-size: 10px;
  font-weight: 600;
  color: var(--duck-yellow);
  background: rgba(255, 217, 61, 0.12);
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

.result-title {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-sub {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-empty {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  background: var(--bg-elevated);
  font-size: 12px;
  color: var(--text-secondary);
  margin-right: 4px;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.notification-wrap {
  position: relative;
}

.notification-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 200;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.icon-btn:hover,
.icon-btn.active {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.window-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 8px;
}

.win-btn {
  width: 36px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  border-radius: 4px;
}

.win-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.win-btn-close:hover {
  background: #ff4757;
  color: #fff;
}
</style>
