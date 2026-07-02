<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NProgress, NTag, NButton, NSpin } from 'naive-ui'
import { getElectronAPI } from '@/api/electron'
import { useAppStore } from '@/stores/app'
import type { TaskRecord, TaskRuntimeState, TaskRunRecord, TaskStatus } from '../../shared/types'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()

const runHistory = ref<TaskRunRecord[]>([])
const viewingTask = ref<TaskRecord | null>(null)
const runtime = ref<TaskRuntimeState | null>(null)
const logs = ref<{ time: string; message: string; level?: string }[]>([])
const selectedRunId = ref('')
const switchingRun = ref(false)

let timer: ReturnType<typeof setInterval> | undefined
let unsubscribe: (() => void) | undefined

const runStatusMap: Record<TaskStatus, { label: string; type: 'info' | 'success' | 'error' | 'warning' | 'default' }> = {
  running: { label: '运行中', type: 'info' },
  completed: { label: '完成', type: 'success' },
  error: { label: '失败', type: 'error' },
  queued: { label: '排队', type: 'warning' },
  paused: { label: '暂停', type: 'default' },
  cancelled: { label: '取消', type: 'default' },
}

const progress = computed(() => runtime.value?.progress ?? viewingTask.value?.progress ?? 0)
const steps = computed(() => runtime.value?.steps ?? [])
const status = computed(() => runtime.value?.status || viewingTask.value?.status || 'queued')
const taskName = computed(() => viewingTask.value?.name || '任务详情')
const canRunAgain = computed(() => ['completed', 'error', 'cancelled'].includes(status.value))
const isViewingActiveRun = computed(() => status.value === 'running' || status.value === 'paused')

const statusTag = computed(() => {
  if (status.value === 'completed') return { type: 'success' as const, text: `已完成 · ${progress.value}%` }
  if (status.value === 'error') return { type: 'error' as const, text: '执行失败' }
  if (status.value === 'paused') return { type: 'warning' as const, text: '已暂停' }
  if (status.value === 'cancelled') return { type: 'default' as const, text: '已取消' }
  if (status.value === 'queued') return { type: 'warning' as const, text: '队列中' }
  return { type: 'info' as const, text: `运行中 · ${progress.value}%` }
})

const logTitle = computed(() => {
  const run = runHistory.value.find((r) => r.id === selectedRunId.value)
  if (!run) return status.value === 'running' ? '实时日志' : '执行日志'
  return `第 ${run.runNumber} 次 · 执行日志`
})

const flowTitle = computed(() => {
  const run = runHistory.value.find((r) => r.id === selectedRunId.value)
  if (!run) return '执行流程'
  return `第 ${run.runNumber} 次 · 执行流程`
})

function syncPolling() {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
  if (isViewingActiveRun.value) {
    timer = setInterval(() => loadRunState(selectedRunId.value), 10000)
  }
}

async function loadRunState(runId: string) {
  const api = getElectronAPI()
  if (!api || !runId) return
  switchingRun.value = true
  try {
    viewingTask.value = await api.tasksGet(runId)
    runtime.value = await api.tasksRuntime(runId)
    logs.value = await api.tasksLogs(runId)
    syncPolling()
  } finally {
    switchingRun.value = false
  }
}

async function loadPlanContext(runId: string) {
  const api = getElectronAPI()
  if (!api) return
  const current = await api.tasksGet(runId)
  if (!current?.planId) {
    viewingTask.value = current
    return
  }
  runHistory.value = await api.tasksPlanRuns(current.planId)
  selectedRunId.value = runId
  await loadRunState(runId)
}

async function selectRun(runId: string) {
  if (!runId || runId === selectedRunId.value) return
  selectedRunId.value = runId
  if (route.params.id !== runId) {
    router.replace(`/tasks/${runId}/running`)
  }
  await loadRunState(runId)
}

async function pauseTask() {
  await getElectronAPI()?.tasksPause(selectedRunId.value)
  await loadRunState(selectedRunId.value)
}

async function resumeTask() {
  await getElectronAPI()?.tasksResume(selectedRunId.value)
  await loadRunState(selectedRunId.value)
}

async function runAgain() {
  if (!viewingTask.value?.planId) return
  const next = await appStore.retryTask(viewingTask.value.planId)
  if (next?.runId) {
    selectedRunId.value = next.runId
    router.replace(`/tasks/${next.runId}/running`)
    await loadPlanContext(next.runId)
  }
}

watch(
  () => route.params.id as string,
  (runId) => {
    if (runId && runId !== selectedRunId.value) {
      selectedRunId.value = runId
      void loadRunState(runId)
    }
  }
)

onMounted(async () => {
  const runId = route.params.id as string
  await loadPlanContext(runId)
  const api = getElectronAPI()
  unsubscribe = api?.onTaskProgress((state) => {
    if (state.runId === selectedRunId.value || state.taskId === selectedRunId.value) {
      runtime.value = state
      if (viewingTask.value) {
        viewingTask.value = {
          ...viewingTask.value,
          status: state.status,
          progress: state.progress,
          progressText: state.progressText,
        }
      }
    }
    if (viewingTask.value?.planId) {
      void api.tasksPlanRuns(viewingTask.value.planId).then((runs) => {
        runHistory.value = runs
      })
    }
  })
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  unsubscribe?.()
})
</script>

<template>
  <div class="task-running">
    <button class="back-btn" @click="router.push('/tasks')">← 返回任务中心</button>

    <div v-if="!viewingTask && !switchingRun" class="empty">任务不存在或已删除</div>

    <template v-else>
      <div class="running-header">
        <h2 class="page-title">{{ taskName }}</h2>
        <NTag :type="statusTag.type" round>{{ statusTag.text }}</NTag>
        <NButton v-if="status === 'running'" size="small" @click="pauseTask">暂停</NButton>
        <NButton v-if="status === 'paused'" size="small" @click="resumeTask">继续</NButton>
        <NButton v-if="canRunAgain" size="small" type="primary" @click="runAgain">再次运行</NButton>
      </div>

      <div v-if="viewingTask" class="task-summary card">
        <div class="summary-row">
          <span class="label">当前查看</span>
          <span>第 {{ viewingTask.runNumber }} 次 / 共 {{ viewingTask.runCount }} 次</span>
        </div>
        <div class="summary-row">
          <span class="label">技能包</span>
          <span>{{ viewingTask.skillName }}</span>
        </div>
        <div class="summary-row">
          <span class="label">动作</span>
          <span>{{ viewingTask.actionName }}</span>
        </div>
        <div class="summary-row">
          <span class="label">本次执行 ID</span>
          <span class="mono">{{ viewingTask.runId }}</span>
        </div>
        <div v-if="viewingTask.progressText" class="summary-row">
          <span class="label">进度说明</span>
          <span>{{ viewingTask.progressText }}</span>
        </div>
        <div v-if="viewingTask.result" class="summary-row">
          <span class="label">执行结果</span>
          <span :class="{ error: status === 'error' }">{{ viewingTask.result }}</span>
        </div>
      </div>

      <div v-if="runHistory.length > 1" class="run-history card">
        <h3 class="section-title">执行历史（共 {{ runHistory.length }} 次）</h3>
        <p class="section-hint">点击切换查看每次运行的流程与日志</p>
        <div class="run-history-list">
          <button
            v-for="run in runHistory"
            :key="run.id"
            type="button"
            class="run-history-item"
            :class="{ active: run.id === selectedRunId }"
            @click="selectRun(run.id)"
          >
            <span class="run-history-label">第 {{ run.runNumber }} 次</span>
            <NTag size="small" round :type="runStatusMap[run.status]?.type || 'default'">
              {{ runStatusMap[run.status]?.label || run.status }}
            </NTag>
          </button>
        </div>
      </div>

      <NSpin :show="switchingRun">
        <div class="running-body">
          <div class="running-left">
            <div class="progress-overview card">
              <h3 class="section-title">{{ flowTitle }}</h3>
              <div v-if="steps.length === 0" class="empty-steps">该次运行暂无流程步骤记录，请查看右侧日志</div>
              <div v-else class="step-tree">
                <div
                  v-for="step in steps"
                  :key="step.id"
                  class="step-node"
                  :class="step.status"
                >
                  <div class="step-indicator">
                    <span v-if="step.status === 'done'" class="step-check">✓</span>
                    <span v-else-if="step.status === 'running'" class="step-spinner" />
                    <span v-else-if="step.status === 'error'" class="step-error">×</span>
                    <span v-else class="step-pending" />
                  </div>
                  <div class="step-content">
                    <span class="step-name">{{ step.name }}</span>
                    <span v-if="step.durationMs" class="step-duration">{{ step.durationMs }}ms</span>
                  </div>
                  <div v-if="step.status === 'running'" class="step-bar">
                    <NProgress type="line" :percentage="progress" :show-indicator="false" :height="3" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="running-right">
            <div class="log-panel card">
              <h3 class="section-title">{{ logTitle }}</h3>
              <div v-if="logs.length === 0" class="empty-steps">该次运行暂无日志</div>
              <div v-else class="log-list">
                <div v-for="(log, i) in logs" :key="i" class="log-entry" :class="log.level">
                  <span class="log-time">{{ log.time }}</span>
                  <span class="log-msg">{{ log.message }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </NSpin>
    </template>
  </div>
</template>

<style scoped>
.back-btn {
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  margin-bottom: 12px;
  padding: 0;
}

.back-btn:hover {
  color: var(--duck-yellow);
}

.empty,
.empty-steps {
  color: var(--text-muted);
  font-size: 13px;
  padding: 12px 0;
}

.running-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.running-header .page-title {
  margin-bottom: 0;
  flex: 1;
  min-width: 0;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px;
}

.section-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0 0 12px;
}

.task-summary {
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.summary-row {
  display: flex;
  gap: 16px;
  font-size: 13px;
}

.summary-row .label {
  width: 72px;
  flex-shrink: 0;
  color: var(--text-secondary);
}

.summary-row .mono {
  font-family: 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  word-break: break-all;
}

.summary-row .error {
  color: var(--error);
}

.run-history {
  margin-bottom: 16px;
}

.run-history-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.run-history-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}

.run-history-item:hover {
  border-color: rgba(255, 217, 61, 0.35);
  background: rgba(255, 217, 61, 0.06);
}

.run-history-item.active {
  border-color: rgba(255, 217, 61, 0.55);
  background: rgba(255, 217, 61, 0.12);
  box-shadow: 0 0 0 1px rgba(255, 217, 61, 0.12);
}

.run-history-label {
  font-weight: 500;
}

.running-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  gap: 16px;
  align-items: start;
}

@media (max-width: 1100px) {
  .running-body {
    grid-template-columns: 1fr;
  }
}

.step-tree {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.step-node {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 8px;
  position: relative;
}

.step-node.running {
  background: rgba(255, 217, 61, 0.08);
  border: 1px solid rgba(255, 217, 61, 0.2);
}

.step-node.done {
  opacity: 0.7;
}

.step-node.error {
  background: rgba(255, 71, 87, 0.08);
  border: 1px solid rgba(255, 71, 87, 0.2);
}

.step-indicator {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.step-check {
  color: var(--success);
  font-weight: 700;
}

.step-error {
  color: var(--error);
  font-weight: 700;
}

.step-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--duck-yellow);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.step-pending {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border-color);
}

.step-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}

.step-name {
  font-size: 13.5px;
  font-weight: 500;
}

.step-duration {
  font-size: 11px;
  color: var(--text-muted);
}

.step-bar {
  position: absolute;
  bottom: 4px;
  left: 50px;
  right: 14px;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: min(480px, 55vh);
  overflow-y: auto;
  font-family: 'Cascadia Code', 'Consolas', monospace;
  font-size: 12.5px;
}

.log-entry {
  display: flex;
  gap: 10px;
  padding: 4px 0;
  min-width: 0;
}

.log-msg {
  color: var(--text-secondary);
  word-break: break-word;
}

.log-time {
  color: var(--text-muted);
  flex-shrink: 0;
}

.log-entry.success .log-msg {
  color: var(--success);
}

.log-entry.error .log-msg {
  color: var(--error);
}
</style>
