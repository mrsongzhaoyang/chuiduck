<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { getElectronAPI } from '@/api/electron'
import type { TaskRunRecord, TaskStatus } from '../../shared/types'
import {
  NTag,
  NButton,
  NIcon,
  NPagination,
  NSpin,
  NEmpty,
  useMessage,
} from 'naive-ui'
import {
  ChevronDownOutline,
  ChevronUpOutline,
  AddOutline,
  TrashOutline,
  PlayOutline,
} from '@vicons/ionicons5'

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

const page = ref(1)
const pageSize = 8
const total = ref(0)
const loading = ref(false)
const tasks = ref<TaskUi[]>([])

const expandedPlans = ref<Record<string, boolean>>({})
const runHistoryMap = ref<Record<string, TaskRunRecord[]>>({})
const loadingRuns = ref<Record<string, boolean>>({})

let unsubProgress: (() => void) | undefined

const statusMap: Record<
  TaskStatus,
  { label: string; type: 'info' | 'success' | 'error' | 'warning' | 'default' }
> = {
  running: { label: '运行中', type: 'info' },
  completed: { label: '已完成', type: 'success' },
  error: { label: '失败', type: 'error' },
  queued: { label: '队列中', type: 'warning' },
  paused: { label: '已暂停', type: 'default' },
  cancelled: { label: '已取消', type: 'default' },
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

function matchesSearch(task: TaskUi) {
  const q = appStore.searchQuery.trim().toLowerCase()
  if (!q) return true
  return (
    task.name.toLowerCase().includes(q) ||
    task.skillPack.toLowerCase().includes(q)
  )
}

const displayTasks = computed(() => tasks.value.filter(matchesSearch))

function formatRunTime(iso?: string) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const now = Date.now()
  const diff = now - d.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function loadTasks() {
  const api = getElectronAPI()
  if (!api) return
  loading.value = true
  try {
    const result = await api.tasksList({
      status: 'all',
      page: page.value,
      pageSize,
    })
    tasks.value = result.items.map(appStore.mapTaskForUi)
    total.value = result.total
  } finally {
    loading.value = false
  }
}

async function loadRunHistory(planId: string) {
  const api = getElectronAPI()
  if (!api || runHistoryMap.value[planId]) return
  loadingRuns.value[planId] = true
  try {
    runHistoryMap.value[planId] = await api.tasksPlanRuns(planId)
  } finally {
    loadingRuns.value[planId] = false
  }
}

async function toggleHistory(planId: string) {
  const next = !expandedPlans.value[planId]
  expandedPlans.value = { ...expandedPlans.value, [planId]: next }
  if (next) await loadRunHistory(planId)
}

function openRun(runId: string) {
  if (!runId) return
  router.push(`/tasks/${runId}/running`)
}

async function handleRun(planId: string, e?: Event) {
  e?.stopPropagation()
  const api = getElectronAPI()
  if (!api) return
  const task = await api.tasksRunPlan(planId)
  message.success('已开始新的运行')
  router.push(`/tasks/${task.runId}/running`)
  await loadTasks()
}

async function handleDelete(planId: string, e?: Event) {
  e?.stopPropagation()
  await appStore.deleteTask(planId)
  message.success('任务已删除')
  delete runHistoryMap.value[planId]
  if (tasks.value.length === 1 && page.value > 1) page.value -= 1
  else await loadTasks()
}

watch(page, () => {
  expandedPlans.value = {}
  loadTasks()
})

onMounted(() => {
  loadTasks()
  const api = getElectronAPI()
  unsubProgress = api?.onTaskProgress(() => {
    loadTasks()
    appStore.refresh()
    for (const planId of Object.keys(expandedPlans.value)) {
      if (expandedPlans.value[planId]) {
        delete runHistoryMap.value[planId]
        void loadRunHistory(planId)
      }
    }
  })
})

onUnmounted(() => {
  unsubProgress?.()
})
</script>

<template>
  <div class="task-center">
    <div class="page-header">
      <div>
        <h2 class="page-title">任务中心</h2>
        <p class="page-desc">管理所有任务方案，查看每次运行的历史记录</p>
      </div>
      <NButton type="primary" @click="router.push('/new-task')">
        <template #icon><NIcon><AddOutline /></NIcon></template>
        新建任务
      </NButton>
    </div>

    <NSpin :show="loading">
      <NEmpty
        v-if="!loading && displayTasks.length === 0"
        description="暂无任务，点击右上角新建一个吧"
        style="margin: 48px 0"
      />

      <div v-else class="plan-list">
        <div v-for="task in displayTasks" :key="task.planId" class="plan-card card">
          <div class="plan-main">
            <div class="plan-header">
              <div class="plan-title-block">
                <h3 class="plan-name">{{ task.name }}</h3>
                <p class="plan-meta">{{ task.skillPack }} · 共执行 {{ task.runCount }} 次</p>
              </div>
            </div>

            <div class="plan-stats">
              <span>最近运行：第 {{ task.runNumber }} 次 · {{ task.lastActive }}</span>
              <NTag v-if="task.status" :type="statusMap[task.status].type" size="small" round>
                {{ statusMap[task.status].label }}
              </NTag>
            </div>
          </div>

          <div class="plan-actions">
            <NButton size="small" type="primary" @click="handleRun(task.planId, $event)">
              <template #icon><NIcon><PlayOutline /></NIcon></template>
              再次运行
            </NButton>
            <NButton size="small" @click="toggleHistory(task.planId)">
              <template #icon>
                <NIcon>
                  <ChevronUpOutline v-if="expandedPlans[task.planId]" />
                  <ChevronDownOutline v-else />
                </NIcon>
              </template>
              {{ expandedPlans[task.planId] ? '收起历史' : '运行历史' }}
            </NButton>
            <NButton size="small" quaternary type="error" @click="handleDelete(task.planId, $event)">
              <template #icon><NIcon><TrashOutline /></NIcon></template>
              删除
            </NButton>
          </div>

          <div v-if="expandedPlans[task.planId]" class="run-history-panel">
            <div class="run-history-header">执行历史（每次运行独立状态）</div>
            <NSpin :show="!!loadingRuns[task.planId]" size="small">
              <div v-if="runHistoryMap[task.planId]?.length" class="run-history-list">
                <div
                  v-for="run in runHistoryMap[task.planId]"
                  :key="run.id"
                  class="run-history-row"
                  @click="openRun(run.id)"
                >
                  <div class="run-history-left">
                    <span class="run-number">第 {{ run.runNumber }} 次</span>
                    <NTag
                      size="small"
                      round
                      :type="
                        run.status === 'completed'
                          ? 'success'
                          : run.status === 'error'
                            ? 'error'
                            : run.status === 'running'
                              ? 'info'
                              : 'default'
                      "
                    >
                      {{ statusMap[run.status]?.label || run.status }}
                    </NTag>
                    <span v-if="run.progressText" class="run-progress-text">{{ run.progressText }}</span>
                    <span v-else-if="run.result" class="run-progress-text">{{ run.result }}</span>
                  </div>
                  <div class="run-history-right">
                    <span class="run-time">{{ formatRunTime(run.finishedAt || run.startedAt || run.createdAt) }}</span>
                    <NButton size="tiny" quaternary @click.stop="openRun(run.id)">详情</NButton>
                  </div>
                </div>
              </div>
              <p v-else-if="!loadingRuns[task.planId]" class="run-history-empty">暂无执行记录</p>
            </NSpin>
          </div>
        </div>
      </div>

      <div v-if="total > pageSize" class="pagination-bar">
        <NPagination
          v-model:page="page"
          :page-count="totalPages"
          :page-size="pageSize"
          show-quick-jumper
        />
      </div>
    </NSpin>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.page-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.plan-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.plan-card {
  padding: 16px;
}

.plan-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.plan-name {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}

.plan-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 4px 0 0;
}

.plan-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-muted);
}

.plan-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06));
}

.run-history-panel {
  margin-top: 12px;
  padding: 12px;
  background: var(--bg-elevated);
  border-radius: 8px;
}

.run-history-header {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.run-history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.run-history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.run-history-row:hover {
  background: rgba(255, 217, 61, 0.06);
}

.run-history-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.run-number {
  font-size: 13px;
  font-weight: 500;
}

.run-progress-text {
  font-size: 12px;
  color: var(--text-secondary);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-history-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.run-time {
  font-size: 11px;
  color: var(--text-muted);
}

.run-history-empty {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
  margin: 8px 0;
}

.pagination-bar {
  display: flex;
  justify-content: center;
  margin-top: 20px;
  padding-bottom: 8px;
}
</style>
