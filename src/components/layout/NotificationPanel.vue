<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { NIcon, NButton, NEmpty } from 'naive-ui'
import {
  AlertCircleOutline,
  WarningOutline,
  InformationCircleOutline,
  CheckmarkCircleOutline,
  CloseOutline,
} from '@vicons/ionicons5'
import { useNotificationStore, type NotificationType } from '@/stores/notifications'

const emit = defineEmits<{ close: [] }>()
const router = useRouter()
const notificationStore = useNotificationStore()

const typeIcon: Record<NotificationType, typeof AlertCircleOutline> = {
  error: AlertCircleOutline,
  warning: WarningOutline,
  info: InformationCircleOutline,
  success: CheckmarkCircleOutline,
}

const typeColor: Record<NotificationType, string> = {
  error: '#ff4757',
  warning: '#FF9F1C',
  info: '#4dabf7',
  success: '#52c41a',
}

const notifications = computed(() => notificationStore.allNotifications)

function handleAction(path: string) {
  emit('close')
  router.push(path)
}

function dismiss(id: string) {
  notificationStore.markAsRead(id)
}

function markAllRead() {
  notificationStore.markAllAsRead()
}
</script>

<template>
  <div class="notification-panel">
    <div class="panel-header">
      <h3 class="panel-title">通知中心</h3>
      <div class="panel-actions">
        <NButton v-if="notifications.length" text size="small" @click="markAllRead">
          全部已读
        </NButton>
        <button class="close-btn" @click="emit('close')">
          <NIcon :size="16"><CloseOutline /></NIcon>
        </button>
      </div>
    </div>

    <div class="panel-body">
      <NEmpty v-if="!notifications.length" description="暂无通知" size="small" />

      <div v-for="item in notifications" :key="item.id" class="notice-item">
        <div class="notice-icon" :style="{ color: typeColor[item.type] }">
          <NIcon :size="18">
            <component :is="typeIcon[item.type]" />
          </NIcon>
        </div>

        <div class="notice-content">
          <div class="notice-title">{{ item.title }}</div>
          <div class="notice-message">{{ item.message }}</div>
          <div class="notice-footer">
            <span class="notice-time">{{ item.time }}</span>
            <button v-if="item.action" class="notice-action" @click="handleAction(item.action.path)">
              {{ item.action.label }}
            </button>
          </div>
        </div>

        <button class="notice-dismiss" title="标记已读" @click="dismiss(item.id)">
          <NIcon :size="14"><CloseOutline /></NIcon>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.notification-panel {
  width: 360px;
  max-height: 480px;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.panel-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.panel-body {
  overflow-y: auto;
  padding: 8px;
  flex: 1;
}

.notice-item {
  display: flex;
  gap: 10px;
  padding: 12px;
  border-radius: 8px;
  transition: background 0.15s;
  position: relative;
}

.notice-item:hover {
  background: var(--bg-elevated);
}

.notice-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.notice-content {
  flex: 1;
  min-width: 0;
}

.notice-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.notice-message {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.notice-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  gap: 8px;
}

.notice-time {
  font-size: 11px;
  color: var(--text-muted);
}

.notice-action {
  border: none;
  background: transparent;
  color: var(--duck-yellow);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.notice-action:hover {
  text-decoration: underline;
}

.notice-dismiss {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s;
}

.notice-item:hover .notice-dismiss {
  opacity: 1;
}

.notice-dismiss:hover {
  background: var(--bg-dark);
  color: var(--text-primary);
}
</style>
