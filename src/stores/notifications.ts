import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'

export type NotificationType = 'error' | 'warning' | 'info' | 'success'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  message: string
  time: string
  action?: { label: string; path: string }
  createdAt: number
}

const STORAGE_KEY = 'chuiduck-read-notifications'

function loadReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function saveReadIds(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
}

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

export const useNotificationStore = defineStore('notifications', () => {
  const readIds = ref<Set<string>>(loadReadIds())
  const panelOpen = ref(false)

  const allNotifications = computed((): AppNotification[] => {
    const appStore = useAppStore()
    const items: AppNotification[] = []

    for (const task of appStore.recentTasks) {
      if (task.status === 'error') {
        items.push({
          id: `task-error-${task.runId || task.id}-${task.raw.updatedAt}`,
          type: 'error',
          title: `任务失败：${task.name}`,
          message: task.result || task.progressText || '执行过程中出现错误',
          time: task.lastActive,
          action: { label: '前往调度中心', path: '/dispatch' },
          createdAt: new Date(task.raw.updatedAt).getTime(),
        })
      } else if (task.status === 'queued') {
        items.push({
          id: `task-queued-${task.runId || task.id}-${task.raw.updatedAt}`,
          type: 'warning',
          title: `任务排队中：${task.name}`,
          message: task.progressText || '等待浏览器就绪或前序任务完成',
          time: task.lastActive,
          action: { label: '前往调度中心', path: '/dispatch' },
          createdAt: new Date(task.raw.updatedAt).getTime(),
        })
      } else if (task.status === 'paused') {
        items.push({
          id: `task-paused-${task.runId || task.id}-${task.raw.updatedAt}`,
          type: 'info',
          title: `任务已暂停：${task.name}`,
          message: '可在调度中心继续执行',
          time: task.lastActive,
          action: { label: '前往调度中心', path: '/dispatch' },
          createdAt: new Date(task.raw.updatedAt).getTime(),
        })
      }
    }

    const browser = appStore.browserInfo
    if (!browser.connected) {
      const msg = browser.extensionOnline
        ? '插件已在线，请在浏览器管理中选择一个 Tab 作为操作目标'
        : '请先安装 Chrome 插件并完成配对，才能运行自动化任务'
      items.push({
        id: `browser-${browser.extensionOnline ? 'no-tab' : 'offline'}-${browser.clientId || 'default'}`,
        type: 'warning',
        title: browser.extensionOnline ? '尚未选择操作 Tab' : '浏览器未连接',
        message: msg,
        time: '持续提醒',
        action: { label: '前往浏览器管理', path: '/browser' },
        createdAt: Date.now(),
      })
    }

    if (appStore.systemStatus === 'error') {
      items.push({
        id: 'system-error',
        type: 'error',
        title: '系统异常',
        message: '部分服务不可用，请检查浏览器连接与任务日志',
        time: formatRelativeTime(new Date().toISOString()),
        action: { label: '查看日志', path: '/logs' },
        createdAt: Date.now(),
      })
    }

    return items.sort((a, b) => b.createdAt - a.createdAt)
  })

  const unreadNotifications = computed(() =>
    allNotifications.value.filter((n) => !readIds.value.has(n.id))
  )

  const unreadCount = computed(() => unreadNotifications.value.length)

  function markAsRead(id: string) {
    if (readIds.value.has(id)) return
    const next = new Set(readIds.value)
    next.add(id)
    readIds.value = next
    saveReadIds(next)
  }

  function markAllAsRead() {
    const next = new Set(readIds.value)
    for (const n of allNotifications.value) next.add(n.id)
    readIds.value = next
    saveReadIds(next)
  }

  function openPanel() {
    panelOpen.value = true
  }

  function closePanel() {
    panelOpen.value = false
  }

  function togglePanel() {
    panelOpen.value = !panelOpen.value
    if (panelOpen.value) markAllAsRead()
  }

  return {
    panelOpen,
    allNotifications,
    unreadNotifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    openPanel,
    closePanel,
    togglePanel,
  }
})
