<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useMessage } from 'naive-ui'
import type { TaskStatus } from '../../../shared/types'
import { NProgress, NTag, NButton, NIcon, NTabs, NTabPane, NPagination, NCheckbox, useDialog } from 'naive-ui'
import { getElectronAPI } from '@/api/electron'
import {
  PauseOutline,
  PlayOutline,
  FolderOpenOutline,
  RefreshOutline,
  TrashOutline,
} from '@vicons/ionicons5'

type TaskTab = 'all' | 'running' | 'completed' | 'failed'

type TaskUi = {
  id: string
  planId: string
  runId: string
  runNumber: number
  runCount: number
  name: string
  skillPack: string
  action: string
  status: TaskStatus
  progress: number
  progressText: string
  result: string
  lastActive: string
}

const router = useRouter()
const appStore = useAppStore()
const message = useMessage()
const dialog = useDialog()

const activeTab = ref<TaskTab>('all')
const page = ref(1)
const pageSize = 6
const total = ref(0)
const loading = ref(false)
const tasks = ref<TaskUi[]>([])
const counts = ref({ all: 0, running: 0, completed: 0, failed: 0 })
const selectMode = ref(false)
const selectedIds = ref<string[]>([])

let unsubProgress: (() => void) | undefined

const statusMap: Record<TaskStatus, { label: string; type: 'info' | 'success' | 'error' | 'warning' | 'default' }> = {
  running: { label: '运行中...', type: 'info' },
  completed: { label: '已完成', type: 'success' },
  error: { label: '异常终止', type: 'error' },
  queued: { label: '队列中', type: 'warning' },
  paused: { label: '已暂停', type: 'default' },
  cancelled: { label: '已取消', type: 'default' },
}

const tabLabels = computed(() => ({
  all: `全部 (${counts.value.all})`,
  running: `进行中 (${counts.value.running})`,
  completed: `已完成 (${counts.value.completed})`,
  failed: `失败 (${counts.value.failed})`,
}))

const selectedCount = computed(() => selectedIds.value.length)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

const allSelected = computed(
  () => tasks.value.length > 0 && tasks.value.every((task) => selectedIds.value.includes(task.id))
)

const indeterminate = computed(
  () => selectedCount.value > 0 && !allSelected.value
)

function exitSelectMode() {
  selectMode.value = false
  selectedIds.value = []
}

function enterSelectMode() {
  if (total.value === 0) {
    message.warning('当前没有可删除的任务')
    return
  }
  selectMode.value = true
  selectedIds.value = []
}

function toggleSelectAll(checked: boolean) {
  selectedIds.value = checked ? tasks.value.map((task) => task.id) : []
}

function toggleSelect(taskId: string) {
  if (!selectMode.value) return
  if (selectedIds.value.includes(taskId)) {
    selectedIds.value = selectedIds.value.filter((id) => id !== taskId)
  } else {
    selectedIds.value = [...selectedIds.value, taskId]
  }
}

function onRowClick(task: TaskUi) {
  if (selectMode.value) {
    toggleSelect(task.id)
    return
  }
  openTask(task)
}

function goFirstPage() {
  if (page.value !== 1) page.value = 1
}

function goLastPage() {
  if (page.value !== totalPages.value) page.value = totalPages.value
}

function getPlatformIcon(pack: string) {
  const icons: Record<string, string> = {
    Temu: '🛒',
    Amazon: '📦',
    System: '⚙️',
    SHEIN: '👗',
    TikTok: '🎵',
    百度: '🔍',
  }
  return icons[pack] || '🎣'
}

async function loadTasks() {
  const api = getElectronAPI()
  if (!api) return
  loading.value = true
  try {
    const result = await api.tasksList({
      status: activeTab.value,
      page: page.value,
      pageSize,
    })
    tasks.value = result.items.map(appStore.mapTaskForUi)
    total.value = result.total
    counts.value = result.counts
  } finally {
    loading.value = false
  }
}

function onTabChange(tab: string) {
  activeTab.value = tab as TaskTab
  page.value = 1
  exitSelectMode()
}

watch(activeTab, () => {
  page.value = 1
  exitSelectMode()
  loadTasks()
})

watch(page, () => {
  exitSelectMode()
  loadTasks()
})

onMounted(() => {
  loadTasks()
  const api = getElectronAPI()
  unsubProgress = api?.onTaskProgress(() => {
    loadTasks()
    appStore.refresh()
  })
})

onUnmounted(() => {
  unsubProgress?.()
})

async function handlePause(runId: string, e: Event) {
  e.stopPropagation()
  if (!runId) return
  await appStore.pauseTask(runId)
  message.success('任务已暂停')
  await loadTasks()
}

async function handleResume(runId: string, e: Event) {
  e.stopPropagation()
  if (!runId) return
  await appStore.resumeTask(runId)
  message.success('任务已继续')
  await loadTasks()
}

async function handleOpenFolder(runId: string, e: Event) {
  e.stopPropagation()
  if (!runId) return
  await appStore.openTaskExportFolder(runId)
}

async function handleRetry(planId: string, e: Event) {
  e.stopPropagation()
  const task = await appStore.retryTask(planId)
  if (task?.runId) router.push(`/tasks/${task.runId}/running`)
  await loadTasks()
}

async function confirmBatchDelete() {
  if (selectedCount.value === 0) {
    message.warning('请先选择要删除的任务')
    return
  }

  dialog.warning({
    title: '批量删除任务',
    content: `确定删除选中的 ${selectedCount.value} 个任务吗？此操作不可恢复。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      const ids = [...selectedIds.value]
      for (const taskId of ids) {
        await appStore.deleteTask(taskId)
      }
      message.success(`已删除 ${ids.length} 个任务`)
      exitSelectMode()
      if (tasks.value.length === ids.length && page.value > 1) page.value -= 1
      else await loadTasks()
    },
  })
}

async function handleDelete(taskId: string, e: Event) {
  e.stopPropagation()
  await appStore.deleteTask(taskId)
  message.success('任务已删除')
  if (tasks.value.length === 1 && page.value > 1) page.value -= 1
  else await loadTasks()
}

function formatResult(text: string, maxLen = 36) {
  if (!text) return '-'
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > maxLen ? `${oneLine.slice(0, maxLen)}…` : oneLine
}

function openTask(task: TaskUi) {
  const runId = task.runId || task.id
  if (!runId) return
  router.push(`/tasks/${runId}/running`)
}
</script>

<template>
  <div class="recent-tasks card">
    <div class="card-header">
      <h3 class="section-title">最近任务</h3>
      <NButton text type="primary" @click="router.push('/dispatch')">调度中心</NButton>
    </div>

    <NTabs
      :value="activeTab"
      type="line"
      size="small"
      class="task-tabs"
      @update:value="onTabChange"
    >
      <NTabPane name="all" :tab="tabLabels.all" />
      <NTabPane name="running" :tab="tabLabels.running" />
      <NTabPane name="completed" :tab="tabLabels.completed" />
      <NTabPane name="failed" :tab="tabLabels.failed" />
    </NTabs>

    <div class="task-body">
      <div v-if="loading" class="list-empty">加载中...</div>
      <div v-else-if="tasks.length === 0" class="list-empty">当前分类暂无任务</div>

      <div v-else class="task-list">
      <div
        v-for="task in tasks"
        :key="task.id"
        class="task-row"
        :class="{
          selected: selectMode && selectedIds.includes(task.id),
          'with-check': selectMode,
        }"
        @click="onRowClick(task)"
      >
        <div v-if="selectMode" class="task-check" @click.stop="toggleSelect(task.id)">
          <NCheckbox :checked="selectedIds.includes(task.id)" />
        </div>

        <div class="task-info">
          <span class="task-icon">{{ getPlatformIcon(task.skillPack) }}</span>
          <div class="task-meta">
            <span class="task-name">{{ task.name }}</span>
            <span class="task-id">
              {{ task.runCount > 1 ? `已执行 ${task.runCount} 次 · ` : '' }}第 {{ task.runNumber || 1 }} 次
            </span>
          </div>
        </div>

        <div class="task-status">
          <NTag :type="statusMap[task.status].type" size="small" round>
            {{ statusMap[task.status].label }}
          </NTag>
        </div>

        <div class="task-result">
          <template v-if="task.status === 'running' || task.status === 'paused'">
            <span class="progress-text" :title="task.progressText">{{ formatResult(task.progressText, 32) }}</span>
            <NProgress
              type="line"
              :percentage="task.progress || 0"
              :show-indicator="false"
              :height="4"
              :border-radius="2"
              style="margin-top: 4px"
            />
          </template>
          <span
            v-else
            class="result-text"
            :class="{ error: task.status === 'error' }"
            :title="task.result"
          >
            {{ formatResult(task.result) }}
          </span>
        </div>

        <div class="task-time">{{ task.lastActive }}</div>

        <div class="task-actions">
          <button
            v-if="task.status === 'running'"
            class="action-btn"
            title="暂停"
            @click="handlePause(task.runId, $event)"
          >
            <NIcon :size="16"><PauseOutline /></NIcon>
          </button>
          <button
            v-if="task.status === 'paused'"
            class="action-btn"
            title="继续"
            @click="handleResume(task.runId, $event)"
          >
            <NIcon :size="16"><PlayOutline /></NIcon>
          </button>
          <button
            v-if="task.status === 'completed'"
            class="action-btn"
            title="打开目录"
            @click="handleOpenFolder(task.runId, $event)"
          >
            <NIcon :size="16"><FolderOpenOutline /></NIcon>
          </button>
          <button
            v-if="['completed', 'error', 'cancelled'].includes(task.status)"
            class="action-btn"
            title="再次运行"
            @click="handleRetry(task.planId, $event)"
          >
            <NIcon :size="16"><RefreshOutline /></NIcon>
          </button>
          <button
            v-if="['queued', 'cancelled', 'error'].includes(task.status)"
            class="action-btn"
            title="删除"
            @click="handleDelete(task.id, $event)"
          >
            <NIcon :size="16"><TrashOutline /></NIcon>
          </button>
        </div>
      </div>
      </div>
    </div>

    <div v-if="total > 0" class="task-bottom">
      <div class="task-footer-bar">
        <div class="footer-left">
          <template v-if="!selectMode">
            <button type="button" class="batch-link" @click="enterSelectMode">
              批量删除最近任务
            </button>
          </template>
          <template v-else>
            <NCheckbox
              :checked="allSelected"
              :indeterminate="indeterminate"
              @update:checked="toggleSelectAll"
            >
              全选本页
            </NCheckbox>
            <span class="select-count">已选 {{ selectedCount }} 项</span>
            <button
              type="button"
              class="batch-link"
              :disabled="selectedCount === 0"
              @click="confirmBatchDelete"
            >
              确认删除
            </button>
            <button type="button" class="cancel-link" @click="exitSelectMode">取消</button>
          </template>
        </div>
        <div v-if="total > pageSize" class="footer-pagination">
          <button
            type="button"
            class="page-edge-btn"
            :disabled="page <= 1"
            title="第一页"
            @click="goFirstPage"
          >
            &laquo;
          </button>
          <NPagination
            v-model:page="page"
            :page-size="pageSize"
            :item-count="total"
            size="small"
            :page-slot="5"
            show-quick-jumper
          >
            <template #goto>跳至</template>
          </NPagination>
          <button
            type="button"
            class="page-edge-btn"
            :disabled="page >= totalPages"
            title="最后一页"
            @click="goLastPage"
          >
            &raquo;
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recent-tasks {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 12px;
  box-sizing: border-box;
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  flex-shrink: 0;
}

.section-title {
  margin-bottom: 0;
  font-size: 13px;
}

.task-tabs {
  margin-bottom: 8px;
  flex-shrink: 0;
}

.task-tabs :deep(.n-tabs-tab) {
  font-size: 12px;
  padding: 6px 4px;
}

.task-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.list-empty {
  padding: 16px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.task-bottom {
  flex-shrink: 0;
  margin-top: auto;
}

.task-row {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) 86px minmax(0, 1.2fr) 64px 64px;
  align-items: center;
  gap: 10px;
  padding: 6px;
  border-radius: 8px;
  transition: background 0.15s;
  cursor: pointer;
  flex-shrink: 0;
}

.task-row.with-check {
  grid-template-columns: 28px minmax(0, 1.5fr) 86px minmax(0, 1.2fr) 64px 64px;
}

.task-row.selected {
  background: rgba(255, 217, 61, 0.1);
}

.task-check {
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 760px) {
  .task-row {
    grid-template-columns: 1fr;
    gap: 6px;
    padding: 12px;
  }

  .task-time {
    text-align: left;
  }

  .task-actions {
    justify-content: flex-start;
  }
}

.task-row:hover {
  background: var(--bg-elevated);
}

.task-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.task-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.task-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.task-name {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-id {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-result {
  min-width: 0;
}

.progress-text {
  font-size: 12px;
  color: var(--text-secondary);
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-text {
  font-size: 12px;
  color: var(--text-secondary);
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-text.error {
  color: var(--error);
}

.task-time {
  font-size: 12px;
  color: var(--text-muted);
  text-align: right;
}

.task-actions {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
}

.action-btn {
  width: 28px;
  height: 28px;
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

.action-btn:hover {
  background: rgba(255, 217, 61, 0.12);
  color: var(--duck-yellow);
}

.task-footer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 6px;
  border-top: 1px solid var(--border-color);
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.batch-link {
  border: none;
  background: none;
  color: var(--duck-yellow);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.batch-link:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.batch-link:hover:not(:disabled) {
  opacity: 0.85;
}

.cancel-link {
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.cancel-link:hover {
  color: var(--text-secondary);
}

.select-count {
  font-size: 12px;
  color: var(--text-secondary);
}

.footer-left :deep(.n-checkbox .n-checkbox__label) {
  font-size: 12px;
}

.footer-pagination {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.page-edge-btn {
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s;
}

.page-edge-btn:hover:not(:disabled) {
  color: var(--duck-yellow);
  border-color: rgba(255, 217, 61, 0.35);
}

.page-edge-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.footer-pagination :deep(.n-pagination) {
  flex-wrap: nowrap;
}

.footer-pagination :deep(.n-pagination-quick-jumper) {
  font-size: 12px;
}

.footer-pagination :deep(.n-input) {
  width: 44px;
}
</style>
