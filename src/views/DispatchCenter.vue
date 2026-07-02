<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { getElectronAPI } from '@/api/electron'
import type { TaskStatus } from '../../shared/types'
import {
  NTabs,
  NTabPane,
  NTag,
  NButton,
  NProgress,
  NIcon,
  NSpin,
  NEmpty,
  useMessage,
} from 'naive-ui'
import { PauseOutline, PlayOutline, RefreshOutline, EyeOutline } from '@vicons/ionicons5'

type DispatchTab = 'active' | 'failed'

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

const activeTab = ref<DispatchTab>('active')
const loading = ref(false)
const activeTasks = ref<TaskUi[]>([])
const failedTasks = ref<TaskUi[]>([])
const counts = ref({ active: 0, failed: 0 })

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

const tabLabels = computed(() => ({
  active: `正在运行 (${counts.value.active})`,
  failed: `报错任务 (${counts.value.failed})`,
}))

const tabHints: Record<DispatchTab, string> = {
  active: '展示当前正在执行、排队或暂停的单次运行记录，可在此暂停/继续。',
  failed: '展示最近报错的单次运行记录，可查看详情或重新运行。',
}

const displayTasks = computed(() =>
  activeTab.value === 'active' ? activeTasks.value : failedTasks.value
)

function formatResult(text: string, maxLen = 100) {
  if (!text) return '-'
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > maxLen ? `${oneLine.slice(0, maxLen)}…` : oneLine
}

async function loadDispatch() {
  const api = getElectronAPI()
  if (!api) return
  loading.value = true
  try {
    const result = await api.tasksDispatchList(50)
    activeTasks.value = result.active.map(appStore.mapTaskForUi)
    failedTasks.value = result.failed.map(appStore.mapTaskForUi)
    counts.value = result.counts
  } finally {
    loading.value = false
  }
}

function openRun(runId: string) {
  if (!runId) return
  router.push(`/tasks/${runId}/running`)
}

async function handlePause(runId: string, e?: Event) {
  e?.stopPropagation()
  await appStore.pauseTask(runId)
  message.success('任务已暂停')
  await loadDispatch()
}

async function handleResume(runId: string, e?: Event) {
  e?.stopPropagation()
  await appStore.resumeTask(runId)
  message.success('任务已继续')
  await loadDispatch()
}

async function handleRetry(planId: string, e?: Event) {
  e?.stopPropagation()
  const task = await appStore.retryTask(planId)
  if (task?.runId) router.push(`/tasks/${task.runId}/running`)
  await loadDispatch()
}

onMounted(() => {
  loadDispatch()
  const api = getElectronAPI()
  unsubProgress = api?.onTaskProgress(() => {
    loadDispatch()
    appStore.refresh()
  })
})

onUnmounted(() => {
  unsubProgress?.()
})
</script>

<template>
  <div class="dispatch-center">
    <div class="page-header">
      <div>
        <h2 class="page-title">调度中心</h2>
        <p class="page-desc">关注当前运行中与报错的单次执行，按运行记录维度展示</p>
      </div>
      <NButton type="primary" @click="router.push('/new-task')">新建任务</NButton>
    </div>

    <NTabs v-model:value="activeTab" type="line" animated>
      <NTabPane name="active" :tab="tabLabels.active" />
      <NTabPane name="failed" :tab="tabLabels.failed" />
    </NTabs>
    <p class="tab-hint">{{ tabHints[activeTab] }}</p>

    <NSpin :show="loading">
      <NEmpty
        v-if="!loading && displayTasks.length === 0"
        :description="activeTab === 'active' ? '当前没有运行中的任务' : '暂无报错任务'"
        style="margin: 48px 0"
      />

      <div v-else class="run-list">
        <div v-for="task in displayTasks" :key="task.runId" class="run-card card" @click="openRun(task.runId)">
          <div class="run-header">
            <div>
              <h3 class="run-name">{{ task.name }}</h3>
              <p class="run-meta">
                {{ task.skillPack }} · 第 {{ task.runNumber }} 次运行 · {{ task.lastActive }}
              </p>
            </div>
            <NTag :type="statusMap[task.status].type" size="small" round>
              {{ statusMap[task.status].label }}
            </NTag>
          </div>

          <p v-if="task.progressText && ['running', 'queued', 'paused'].includes(task.status)" class="run-progress-text">
            {{ task.progressText }}
          </p>
          <NProgress
            v-if="task.progress && ['running', 'paused'].includes(task.status)"
            type="line"
            :percentage="task.progress"
            :height="6"
            :border-radius="3"
            style="margin-bottom: 8px"
          />
          <p v-else-if="task.result" class="run-result" :class="{ error: task.status === 'error' }">
            {{ formatResult(task.result) }}
          </p>

          <div class="run-actions" @click.stop>
            <NButton size="small" @click="openRun(task.runId)">
              <template #icon><NIcon><EyeOutline /></NIcon></template>
              查看详情
            </NButton>
            <NButton
              v-if="task.status === 'running'"
              size="small"
              quaternary
              @click="handlePause(task.runId, $event)"
            >
              <template #icon><NIcon><PauseOutline /></NIcon></template>
              暂停
            </NButton>
            <NButton
              v-if="task.status === 'paused'"
              size="small"
              quaternary
              @click="handleResume(task.runId, $event)"
            >
              <template #icon><NIcon><PlayOutline /></NIcon></template>
              继续
            </NButton>
            <NButton
              v-if="task.status === 'error'"
              size="small"
              type="primary"
              quaternary
              @click="handleRetry(task.planId, $event)"
            >
              <template #icon><NIcon><RefreshOutline /></NIcon></template>
              重新运行
            </NButton>
          </div>
        </div>
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
  margin-bottom: 8px;
}

.page-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.tab-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 4px 0 0;
  line-height: 1.5;
}

.run-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 12px;
}

.run-card {
  padding: 16px;
  cursor: pointer;
  transition: border-color 0.15s;
}

.run-card:hover {
  border-color: rgba(255, 217, 61, 0.25);
}

.run-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.run-name {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}

.run-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 4px 0 0;
}

.run-progress-text {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.run-result {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.run-result.error {
  color: var(--error);
}

.run-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06));
}
</style>
