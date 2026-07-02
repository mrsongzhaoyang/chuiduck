<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { NTag, NTabs, NTabPane } from 'naive-ui'
import { getElectronAPI } from '@/api/electron'
import type { TaskRecord, TaskStatus } from '../../shared/types'

type LogItem = {
  id: number
  taskId: string
  nodeId: string
  level: string
  message: string
  durationMs: number
  createdAt: string
  screenshotPath?: string
  consoleLines?: string[]
}

type TaskLogGroup = {
  task: TaskRecord
  logs: LogItem[]
}

const groups = ref<TaskLogGroup[]>([])
const selectedKey = ref('')
const expandedTasks = ref<Set<string>>(new Set())
const loading = ref(true)
const screenshotDataUrl = ref<string | null>(null)
const detailTab = ref('message')

const statusMap: Record<TaskStatus, { label: string; type: 'info' | 'success' | 'error' | 'warning' | 'default' }> = {
  running: { label: '运行中', type: 'info' },
  completed: { label: '已完成', type: 'success' },
  error: { label: '失败', type: 'error' },
  queued: { label: '队列中', type: 'warning' },
  paused: { label: '已暂停', type: 'default' },
  cancelled: { label: '已取消', type: 'default' },
}

const selectedLog = computed(() => {
  if (!selectedKey.value.includes(':')) return null
  const [runId, logId] = selectedKey.value.split(':')
  const group = groups.value.find((g) => g.task.runId === runId)
  return group?.logs.find((l) => String(l.id) === logId) || null
})

const selectedTask = computed(() => {
  const runId = selectedKey.value.includes(':') ? selectedKey.value.split(':')[0] : selectedKey.value
  return groups.value.find((g) => g.task.runId === runId)?.task || null
})

const hasConsole = computed(() => (selectedLog.value?.consoleLines?.length || 0) > 0)
const hasScreenshot = computed(() => !!selectedLog.value?.screenshotPath)

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function stepTitle(log: LogItem) {
  const msg = log.message.trim()
  if (msg.endsWith(' 完成')) return msg.slice(0, -3)
  if (msg.startsWith('已导出 ')) return '导出结果'
  if (msg.startsWith('条件判断:')) return '条件判断'
  if (msg.startsWith('第 ') && msg.includes('次失败')) return '重试'
  return msg.length > 28 ? `${msg.slice(0, 28)}…` : msg
}

function stepSubtitle(log: LogItem) {
  const parts: string[] = [formatTime(log.createdAt)]
  if (log.durationMs) parts.push(`${(log.durationMs / 1000).toFixed(1)}s`)
  if (log.nodeId) parts.push(log.nodeId)
  return parts.join(' · ')
}

function levelIcon(level: string) {
  if (level === 'error') return '×'
  if (level === 'warning') return '!'
  return '✓'
}

function isExpanded(runId: string) {
  return expandedTasks.value.has(runId)
}

function toggleTask(runId: string) {
  const next = new Set(expandedTasks.value)
  if (next.has(runId)) next.delete(runId)
  else next.add(runId)
  expandedTasks.value = next
}

function selectLog(runId: string, logId: number) {
  selectedKey.value = `${runId}:${logId}`
}

async function loadScreenshot(path?: string) {
  screenshotDataUrl.value = null
  if (!path) return
  const api = getElectronAPI()
  if (!api) return
  screenshotDataUrl.value = await api.logsReadImage(path)
}

watch(selectedLog, (log) => {
  detailTab.value = log?.level === 'error' && log.screenshotPath ? 'screenshot' : 'message'
  loadScreenshot(log?.screenshotPath)
})

onMounted(async () => {
  const api = getElectronAPI()
  if (!api) {
    loading.value = false
    return
  }
  const raw = await api.logsList()
  groups.value = raw.flatMap((item) =>
    item.runs.map(({ run, logs }) => ({
      task: {
        ...item.task,
        runId: run.id,
        status: run.status,
        runNumber: run.runNumber,
        updatedAt: run.updatedAt,
        result: run.result,
      },
      logs: logs.map((l) => ({ ...l, taskId: run.id })),
    }))
  )
  const first = groups.value[0]
  if (first) {
    expandedTasks.value = new Set([first.task.runId])
    if (first.logs[0]) selectedKey.value = `${first.task.runId}:${first.logs[0].id}`
  }
  loading.value = false
})
</script>

<template>
  <div class="log-center">
    <h2 class="page-title">日志中心</h2>
    <p class="page-desc">主任务展开后可查看各执行步骤的详细日志</p>

    <div v-if="loading" class="empty">加载中...</div>
    <div v-else-if="groups.length === 0" class="empty card">暂无任务日志，执行技能后这里会显示记录。</div>

    <div v-else class="log-layout">
      <div class="log-tree-panel card">
        <div class="panel-head">
          <h3 class="section-title">任务列表</h3>
          <span class="panel-count">{{ groups.length }} 个任务</span>
        </div>

        <div class="task-groups">
          <div v-for="group in groups" :key="group.task.runId" class="task-group">
            <button
              type="button"
              class="task-header"
              :class="{ expanded: isExpanded(group.task.runId) }"
              @click="toggleTask(group.task.runId)"
            >
              <span class="task-chevron">{{ isExpanded(group.task.runId) ? '▾' : '▸' }}</span>
              <span class="task-icon">🎣</span>
              <div class="task-head-text">
                <span class="task-name">{{ group.task.name }}</span>
                <span class="task-meta">
                  第 {{ group.task.runNumber }} 次 · {{ group.task.skillName }} · {{ group.logs.length }} 个步骤
                </span>
              </div>
              <NTag :type="statusMap[group.task.status].type" size="small" round>
                {{ statusMap[group.task.status].label }}
              </NTag>
            </button>

            <div v-show="isExpanded(group.task.runId)" class="step-list">
              <div class="step-list-label">执行步骤</div>
              <button
                v-for="(log, idx) in group.logs"
                :key="log.id"
                type="button"
                class="step-item"
                :class="[log.level, { active: selectedKey === `${group.task.runId}:${log.id}` }]"
                @click="selectLog(group.task.runId, log.id)"
              >
                <span class="step-index">{{ idx + 1 }}</span>
                <span class="step-dot" :class="log.level">{{ levelIcon(log.level) }}</span>
                <div class="step-content">
                  <span class="step-title">{{ stepTitle(log) }}</span>
                  <span class="step-sub">{{ stepSubtitle(log) }}</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="log-detail-panel card">
        <template v-if="selectedLog && selectedTask">
          <div class="detail-header">
            <div>
              <p class="detail-breadcrumb">
                <span class="crumb-task">{{ selectedTask.name }}</span>
                <span class="crumb-sep">/</span>
                <span class="crumb-step">步骤 {{ stepTitle(selectedLog) }}</span>
              </p>
              <h3 class="section-title detail-title">日志详情</h3>
            </div>
            <NTag
              :type="selectedLog.level === 'error' ? 'error' : selectedLog.level === 'warning' ? 'warning' : 'success'"
              size="small"
              round
            >
              {{ selectedLog.level }}
            </NTag>
          </div>

          <div class="detail-meta">
            <span>任务时间: {{ formatDate(selectedTask.updatedAt) }}</span>
            <span> · 日志时间: {{ formatTime(selectedLog.createdAt) }}</span>
            <span v-if="selectedLog.durationMs"> · 耗时: {{ (selectedLog.durationMs / 1000).toFixed(1) }}s</span>
          </div>

          <NTabs v-model:value="detailTab" type="line" size="small">
            <NTabPane name="message" tab="日志">
              <code class="log-code" :class="{ error: selectedLog.level === 'error' }">{{ selectedLog.message }}</code>
            </NTabPane>
            <NTabPane v-if="hasScreenshot" name="screenshot" tab="截图">
              <div v-if="screenshotDataUrl" class="screenshot-wrap">
                <img :src="screenshotDataUrl" alt="失败截图" class="screenshot-img" />
              </div>
              <div v-else class="empty-detail">截图加载中...</div>
            </NTabPane>
            <NTabPane v-if="hasConsole" name="console" tab="Console">
              <div class="console-panel">
                <div v-for="(line, idx) in selectedLog.consoleLines" :key="idx" class="console-line">{{ line }}</div>
              </div>
            </NTabPane>
          </NTabs>
        </template>
        <div v-else class="empty-detail">展开左侧任务，点击某个执行步骤查看详情</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: -12px;
  margin-bottom: 20px;
}

.empty {
  color: var(--text-muted);
  font-size: 13px;
  padding: 24px;
}

.log-layout {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 16px;
  align-items: start;
}

@media (max-width: 1100px) {
  .log-layout {
    grid-template-columns: 1fr;
  }
}

.log-tree-panel {
  padding: 0;
  overflow: hidden;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border-color);
}

.panel-head .section-title {
  margin-bottom: 0;
}

.panel-count {
  font-size: 11px;
  color: var(--text-muted);
}

.task-groups {
  max-height: min(620px, 70vh);
  overflow-y: auto;
  padding: 8px;
}

.task-group {
  margin-bottom: 8px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
  overflow: hidden;
}

.task-group:last-child {
  margin-bottom: 0;
}

.task-header {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}

.task-header:hover {
  background: rgba(255, 217, 61, 0.06);
}

.task-header.expanded {
  background: rgba(255, 217, 61, 0.08);
  border-bottom: 1px solid var(--border-color);
}

.task-chevron {
  font-size: 12px;
  color: var(--duck-yellow);
  width: 12px;
  flex-shrink: 0;
}

.task-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.task-head-text {
  flex: 1;
  min-width: 0;
}

.task-name {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-meta {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.step-list {
  padding: 8px 10px 10px 18px;
  border-left: 2px solid rgba(255, 217, 61, 0.25);
  margin: 0 12px 10px 28px;
}

.step-list-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.step-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  margin-bottom: 4px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--bg-surface);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}

.step-item:last-child {
  margin-bottom: 0;
}

.step-item:hover {
  border-color: rgba(255, 217, 61, 0.2);
}

.step-item.active {
  border-color: rgba(255, 217, 61, 0.45);
  background: rgba(255, 217, 61, 0.1);
}

.step-index {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  width: 16px;
  flex-shrink: 0;
  padding-top: 2px;
}

.step-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.step-dot.success,
.step-dot.info {
  background: rgba(82, 196, 26, 0.15);
  color: var(--success);
}

.step-dot.warning {
  background: rgba(255, 159, 28, 0.15);
  color: var(--duck-orange);
}

.step-dot.error {
  background: rgba(255, 71, 87, 0.15);
  color: var(--error);
}

.step-content {
  flex: 1;
  min-width: 0;
}

.step-title {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.step-sub {
  display: block;
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.log-detail-panel {
  min-height: 360px;
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.detail-breadcrumb {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.crumb-task {
  color: var(--duck-yellow);
}

.crumb-sep {
  margin: 0 6px;
}

.crumb-step {
  color: var(--text-secondary);
}

.detail-title {
  margin-bottom: 0;
}

.detail-meta {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 16px;
}

.log-code {
  display: block;
  padding: 12px 14px;
  background: var(--bg-elevated);
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-primary);
  font-family: 'Cascadia Code', 'Consolas', monospace;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-code.error {
  background: rgba(255, 71, 87, 0.1);
  border: 1px solid rgba(255, 71, 87, 0.2);
  color: var(--error);
}

.screenshot-wrap {
  padding: 8px 0;
}

.screenshot-img {
  max-width: 100%;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.console-panel {
  max-height: 360px;
  overflow-y: auto;
  padding: 10px 14px;
  background: #0d1117;
  border-radius: 8px;
  font-family: 'Cascadia Code', 'Consolas', monospace;
  font-size: 11px;
  line-height: 1.6;
}

.console-line {
  color: #c9d1d9;
  white-space: pre-wrap;
  word-break: break-all;
}

.empty-detail {
  color: var(--text-muted);
  font-size: 13px;
  padding: 48px 0;
  text-align: center;
}
</style>
