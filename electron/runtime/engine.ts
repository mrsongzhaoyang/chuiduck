import type { BrowserPage } from '../browser/browser-page.js'
import type {
  TaskRuntimeState,
  TaskStatus,
  TaskLogRecord,
  WorkflowDef,
  WorkflowNode,
  SkillActionDef,
} from '../../shared/types.js'
import { connectBrowser, getTaskPage } from '../browser/extension-manager.js'
import {
  attachPageConsole,
  captureFailureScreenshot,
  cleanupTaskMonitor,
  getTaskConsoleLines,
} from './page-monitor.js'
import { loadManifestFromDir, loadWorkflow } from '../skills/manifest.js'
import { RuntimeContext, executeNode, interpolateParams } from './context.js'
import { exportToCsv, exportToExcel, exportToJson } from '../export/exporter.js'
import {
  addTaskLog,
  deleteCheckpoint,
  getCheckpoint,
  getSetting,
  getTask,
  getTaskLogs,
  saveCheckpoint,
  updateTask,
} from '../db/index.js'

type ProgressCallback = (state: TaskRuntimeState) => void
type NodeResult = { jumpToId?: string; cancelled?: boolean }

const runningTasks = new Map<
  string,
  { paused: boolean; cancelled: boolean; nodeIndex: number; ctx?: RuntimeContext; workflow?: WorkflowDef }
>()
const runtimeStates = new Map<string, TaskRuntimeState>()
const taskLogCache = new Map<string, TaskLogRecord[]>()
const MAX_CACHED_LOGS = 200

function initTaskLogCache(taskId: string) {
  taskLogCache.set(taskId, getTaskLogs(taskId))
}

function clearTaskLogCache(taskId: string) {
  taskLogCache.delete(taskId)
}

function appendTaskLog(log: Omit<TaskLogRecord, 'id'>) {
  const id = addTaskLog(log)
  const entry: TaskLogRecord = {
    ...log,
    id,
    runId: log.runId || log.taskId,
  }
  const cache = taskLogCache.get(log.taskId)
  if (cache) {
    cache.push(entry)
    if (cache.length > MAX_CACHED_LOGS) {
      cache.splice(0, cache.length - MAX_CACHED_LOGS)
    }
  }
  return id
}

function getCachedTaskLogs(taskId: string): TaskLogRecord[] {
  return taskLogCache.get(taskId) ?? getTaskLogs(taskId)
}

function isTaskCancelled(taskId: string) {
  return runningTasks.get(taskId)?.cancelled === true
}

async function waitIfPaused(taskId: string): Promise<'ok' | 'cancelled'> {
  while (true) {
    const control = runningTasks.get(taskId)
    if (control?.cancelled) return 'cancelled'
    if (!control?.paused) return 'ok'
    await new Promise((r) => setTimeout(r, 300))
  }
}

function markTaskCancelled(taskId: string, workflow: WorkflowDef, onProgress?: ProgressCallback) {
  deleteCheckpoint(taskId)
  updateTask(taskId, { status: 'cancelled', progressText: '任务已取消', finishedAt: nowIso() })
  emit(taskId, workflow, onProgress)
}

function nowIso() {
  return new Date().toISOString()
}

function getDefaultRetryCount() {
  return Math.max(0, Number(getSetting('retryCount', '3')) || 3)
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toTimeString().slice(0, 5)
}

type StepStatus = TaskRuntimeState['steps'][number]['status']

function getNodeLogDuration(logs: TaskLogRecord[]) {
  const total = logs.reduce((sum, log) => sum + (log.durationMs || 0), 0)
  return total > 0 ? total : logs[logs.length - 1]?.durationMs
}

function buildStepsFromWorkflowAndLogs(
  workflow: WorkflowDef,
  logs: TaskLogRecord[],
  taskStatus: TaskStatus
): TaskRuntimeState['steps'] {
  const nodeLogs = new Map<string, TaskLogRecord[]>()
  for (const log of logs) {
    if (!log.nodeId) continue
    const list = nodeLogs.get(log.nodeId) || []
    list.push(log)
    nodeLogs.set(log.nodeId, list)
  }

  if (taskStatus === 'completed') {
    return workflow.nodes.map((node) => {
      const nodeLogList = nodeLogs.get(node.id) || []
      return {
        id: node.id,
        name: node.name || node.type,
        status: 'done' as const,
        durationMs: getNodeLogDuration(nodeLogList),
      }
    })
  }

  if (taskStatus === 'error' || taskStatus === 'cancelled') {
    let afterError = false
    return workflow.nodes.map((node) => {
      if (afterError) {
        return { id: node.id, name: node.name || node.type, status: 'pending' as const }
      }
      const nodeLogList = nodeLogs.get(node.id) || []
      const lastLog = nodeLogList[nodeLogList.length - 1]
      if (lastLog?.level === 'error') {
        afterError = true
        return {
          id: node.id,
          name: node.name || node.type,
          status: 'error' as const,
          durationMs: getNodeLogDuration(nodeLogList),
        }
      }
      if (lastLog) {
        return {
          id: node.id,
          name: node.name || node.type,
          status: 'done' as const,
          durationMs: getNodeLogDuration(nodeLogList),
        }
      }
      return { id: node.id, name: node.name || node.type, status: 'pending' as const }
    })
  }

  let lastDoneIndex = -1
  let errorIndex = -1
  const steps = workflow.nodes.map((node, idx) => {
    const nodeLogList = nodeLogs.get(node.id) || []
    const lastLog = nodeLogList[nodeLogList.length - 1]
    if (lastLog?.level === 'error') {
      errorIndex = idx
      return {
        id: node.id,
        name: node.name || node.type,
        status: 'error' as const,
        durationMs: getNodeLogDuration(nodeLogList),
      }
    }
    if (lastLog) {
      lastDoneIndex = idx
      return {
        id: node.id,
        name: node.name || node.type,
        status: 'done' as const,
        durationMs: getNodeLogDuration(nodeLogList),
      }
    }
    return { id: node.id, name: node.name || node.type, status: 'pending' as const }
  })

  if (errorIndex >= 0) return steps

  const runningIndex = lastDoneIndex + 1
  if ((taskStatus === 'running' || taskStatus === 'paused' || taskStatus === 'queued') && runningIndex < steps.length) {
    steps[runningIndex] = { ...steps[runningIndex], status: 'running' }
  }
  return steps
}

function finalizeSteps(steps: TaskRuntimeState['steps'], taskStatus: TaskStatus) {
  if (taskStatus === 'completed') {
    return steps.map((step) => ({
      ...step,
      status: step.status === 'error' ? ('error' as StepStatus) : ('done' as StepStatus),
    }))
  }
  return steps
}

function markStepDone(state: TaskRuntimeState, index: number, durationMs?: number) {
  state.steps = state.steps.map((step, idx) =>
    idx === index ? { ...step, status: 'done', durationMs: durationMs ?? step.durationMs } : step
  )
}

function markStepError(state: TaskRuntimeState, index: number) {
  state.steps = state.steps.map((step, idx) =>
    idx === index ? { ...step, status: 'error' } : step
  )
}

function buildRuntimeState(taskId: string, workflow: WorkflowDef): TaskRuntimeState {
  const task = getTask(taskId)
  const logs = getCachedTaskLogs(taskId)
  const existing = runtimeStates.get(taskId)
  const steps =
    existing?.steps ||
    workflow.nodes.map((n) => ({
      id: n.id,
      name: n.name || n.type,
      status: 'pending' as const,
    }))

  return {
    taskId,
    runId: task?.runId || taskId,
    planId: task?.planId || '',
    runNumber: task?.runNumber || 0,
    status: (task?.status || 'running') as TaskStatus,
    progress: task?.progress || 0,
    progressText: task?.progressText || '',
    currentNodeId: existing?.currentNodeId || '',
    currentNodeName: existing?.currentNodeName || '',
    logs,
    steps,
  }
}

function emit(taskId: string, workflow: WorkflowDef, cb?: ProgressCallback) {
  const state = buildRuntimeState(taskId, workflow)
  runtimeStates.set(taskId, state)
  cb?.(state)
}

function resolveNodeIndex(workflow: WorkflowDef, nodeId: string) {
  return workflow.nodes.findIndex((n) => n.id === nodeId)
}

async function runExportNode(
  taskId: string,
  taskName: string,
  node: WorkflowNode,
  ctx: RuntimeContext
) {
  const format = (ctx.resolve(node.format) || 'json') as 'excel' | 'json' | 'csv'
  const varName = (node.data || node.var || 'data').replace(/\{\{|\}\}/g, '')
  const raw = ctx.getVar(varName)
  const rows = Array.isArray(raw)
    ? (raw as Record<string, unknown>[])
    : typeof raw === 'object' && raw !== null && Array.isArray((raw as { lines?: string[] }).lines)
      ? (raw as { lines: string[] }).lines.map((text, index) => ({ index: index + 1, text }))
      : [{ value: raw }]
  const filename = `${taskName}_${Date.now()}`

  if (format === 'excel') return exportToExcel(taskId, taskName, filename, rows)
  if (format === 'csv') return exportToCsv(taskId, taskName, filename, rows)
  return exportToJson(taskId, taskName, filename, raw)
}

async function executeWorkflowNodeOnce(
  taskId: string,
  taskName: string,
  node: WorkflowNode,
  ctx: RuntimeContext,
  workflow: WorkflowDef,
  page: BrowserPage
): Promise<NodeResult | void> {
  const start = Date.now()

  if (node.type === 'export') {
    const record = await runExportNode(taskId, taskName, node, ctx)
    appendTaskLog({
      taskId,
      nodeId: node.id,
      level: 'success',
      message: `已导出 ${record.filename}`,
      durationMs: Date.now() - start,
      createdAt: nowIso(),
    })
    return
  }

  if (node.type === 'condition') {
    const expr = ctx.resolve(node.condition)
    const pass = expr === 'true' || expr === '1' || (!!expr && expr !== 'false' && expr !== '0')
    appendTaskLog({
      taskId,
      nodeId: node.id,
      level: 'info',
      message: `条件判断: ${pass ? '通过' : '不通过'}`,
      durationMs: Date.now() - start,
      createdAt: nowIso(),
    })
    const jumpToId = pass ? node.trueNext : node.falseNext
    if (jumpToId) return { jumpToId }
    return
  }

  if (node.type === 'loop' && node.body?.length) {
    const itemsVar = (node.items || 'items').replace(/\{\{|\}\}/g, '')
    const items = ctx.getVar(itemsVar)
    const list = Array.isArray(items) ? items : []
    for (let i = 0; i < list.length; i++) {
      if (isTaskCancelled(taskId)) return { cancelled: true }
      const waitResult = await waitIfPaused(taskId)
      if (waitResult === 'cancelled') return { cancelled: true }

      ctx.setVar('loopIndex', i)
      ctx.setVar('loopItem', list[i])
      for (const child of node.body) {
        if (isTaskCancelled(taskId)) return { cancelled: true }
        await executeWorkflowNodeWithRetry(taskId, taskName, child, ctx, workflow, page)
      }
    }
    appendTaskLog({
      taskId,
      nodeId: node.id,
      level: 'success',
      message: node.message || `${node.name || node.type} 完成`,
      durationMs: Date.now() - start,
      createdAt: nowIso(),
    })
    return
  }

  if (node.type === 'log') {
    const message = ctx.resolve(node.message) || node.name || '日志'
    appendTaskLog({
      taskId,
      nodeId: node.id,
      level: 'info',
      message,
      durationMs: Date.now() - start,
      createdAt: nowIso(),
    })
    return
  }

  await executeNode(page, ctx, node)

  appendTaskLog({
    taskId,
    nodeId: node.id,
    level: 'success',
    message: node.message || `${node.name || node.type} 完成`,
    durationMs: Date.now() - start,
    createdAt: nowIso(),
  })
}

async function executeWorkflowNodeWithRetry(
  taskId: string,
  taskName: string,
  node: WorkflowNode,
  ctx: RuntimeContext,
  workflow: WorkflowDef,
  page: BrowserPage
): Promise<NodeResult | void> {
  const maxRetry = node.retry ?? getDefaultRetryCount()
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      return await executeWorkflowNodeOnce(taskId, taskName, node, ctx, workflow, page)
    } catch (err) {
      lastError = err
      if (attempt < maxRetry) {
        const msg = err instanceof Error ? err.message : String(err)
        appendTaskLog({
          taskId,
          nodeId: node.id,
          level: 'warning',
          message: `第 ${attempt + 1} 次失败，重试中: ${msg}`,
          durationMs: 0,
          createdAt: nowIso(),
        })
        await new Promise((r) => setTimeout(r, 1000))
      }
    }
  }

  throw lastError
}

export async function runTask(
  taskId: string,
  skillDir: string,
  actionDef: SkillActionDef,
  params: Record<string, unknown>,
  onProgress?: ProgressCallback
) {
  const task = getTask(taskId)
  if (!task) throw new Error('任务不存在')

  const manifest = await loadManifestFromDir(skillDir)
  const workflow = await loadWorkflow(skillDir, actionDef)
  const mergedParams = interpolateParams(params, actionDef.params)
  const ctx = new RuntimeContext(mergedParams)

  runningTasks.set(taskId, { paused: false, cancelled: false, nodeIndex: 0, ctx, workflow })
  initTaskLogCache(taskId)
  updateTask(taskId, {
    status: 'running',
    progress: 0,
    progressText: '正在连接浏览器...',
    startedAt: nowIso(),
  })
  emit(taskId, workflow, onProgress)

  const checkpoint = getCheckpoint(taskId)
  let startIndex = 0
  if (checkpoint) {
    startIndex = checkpoint.resumeMode === 'at' ? checkpoint.nodeIndex : checkpoint.nodeIndex + 1
    ctx.variables = { ...checkpoint.variables }
    ctx.loopStack = [...checkpoint.loopStack]
    updateTask(taskId, { progressText: `从断点恢复，继续第 ${startIndex + 1} 步` })
  }

  let finishedNormally = false

  try {
    updateTask(taskId, { progressText: '正在连接浏览器插件...' })
    emit(taskId, workflow, onProgress)

    await connectBrowser()

    updateTask(taskId, { progressText: '正在获取标签页...' })
    emit(taskId, workflow, onProgress)

    const taskPage = await getTaskPage()
    attachPageConsole(taskId, taskPage)
    updateTask(taskId, { progressText: '已在选中标签页执行' })
    emit(taskId, workflow, onProgress)

    for (let i = startIndex; i < workflow.nodes.length; i++) {
      const control = runningTasks.get(taskId)
      if (control?.cancelled) {
        markTaskCancelled(taskId, workflow, onProgress)
        return
      }

      const waitResult = await waitIfPaused(taskId)
      if (waitResult === 'cancelled') {
        markTaskCancelled(taskId, workflow, onProgress)
        return
      }

      const node = workflow.nodes[i]
      if (control) control.nodeIndex = i

      const state = buildRuntimeState(taskId, workflow)
      state.currentNodeId = node.id
      state.currentNodeName = node.name || node.type
      state.progress = Math.round((i / workflow.nodes.length) * 100)
      state.progressText = node.name || node.type
      state.steps = state.steps.map((s, idx) => ({
        ...s,
        status: idx < i ? 'done' : idx === i ? 'running' : 'pending',
      }))
      runtimeStates.set(taskId, state)
      onProgress?.(state)

      updateTask(taskId, {
        progress: state.progress,
        progressText: state.progressText,
      })

      try {
        const result = await executeWorkflowNodeWithRetry(
          taskId,
          task.name,
          node,
          ctx,
          workflow,
          taskPage
        )

        if (result?.cancelled || isTaskCancelled(taskId)) {
          markTaskCancelled(taskId, workflow, onProgress)
          return
        }

        saveCheckpoint({
          taskId,
          nodeIndex: i,
          nodeId: node.id,
          variables: ctx.variables,
          loopStack: ctx.loopStack,
          resumeMode: 'after',
          updatedAt: nowIso(),
        })

        if (result?.jumpToId) {
          const jumpIndex = resolveNodeIndex(workflow, result.jumpToId)
          if (jumpIndex >= 0) {
            i = jumpIndex - 1
            continue
          }
        }

        const doneState = runtimeStates.get(taskId)
        if (doneState) {
          const nodeLogs = getCachedTaskLogs(taskId).filter((log) => log.nodeId === node.id)
          markStepDone(doneState, i, getNodeLogDuration(nodeLogs))
          runtimeStates.set(taskId, doneState)
          onProgress?.(doneState)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const screenshotPath = await captureFailureScreenshot(taskId, taskPage)
        const consoleLines = getTaskConsoleLines(taskId)
        appendTaskLog({
          taskId,
          nodeId: node.id,
          level: 'error',
          message: msg,
          durationMs: 0,
          createdAt: nowIso(),
          screenshotPath: screenshotPath || undefined,
          consoleLines,
        })
        const errorState = runtimeStates.get(taskId)
        if (errorState) {
          markStepError(errorState, i)
          runtimeStates.set(taskId, errorState)
        }
        updateTask(taskId, {
          status: 'error',
          result: msg,
          progressText: '执行失败',
          finishedAt: nowIso(),
        })
        emit(taskId, workflow, onProgress)
        throw err
      }
    }

    const finalControl = runningTasks.get(taskId)
    if (!finalControl?.cancelled) {
      deleteCheckpoint(taskId)
      updateTask(taskId, {
        status: 'completed',
        progress: 100,
        progressText: '已完成',
        result: 'Success',
        finishedAt: nowIso(),
      })
      finishedNormally = true
    }

    const completedState = runtimeStates.get(taskId)
    if (completedState && finishedNormally) {
      completedState.steps = finalizeSteps(completedState.steps, 'completed')
      completedState.progress = 100
      completedState.progressText = '已完成'
      runtimeStates.set(taskId, completedState)
    }
    emit(taskId, workflow, onProgress)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (getTask(taskId)?.status === 'running') {
      updateTask(taskId, {
        status: 'error',
        result: msg,
        progressText: `执行失败: ${msg}`,
        finishedAt: nowIso(),
      })
      appendTaskLog({
        taskId,
        nodeId: '',
        level: 'error',
        message: msg,
        durationMs: 0,
        createdAt: nowIso(),
      })
    }
    emit(taskId, workflow, onProgress)
    throw err
  } finally {
    cleanupTaskMonitor(taskId)
    runningTasks.delete(taskId)
    runtimeStates.delete(taskId)
    clearTaskLogCache(taskId)
    if (!finishedNormally && getTask(taskId)?.status === 'running') {
      updateTask(taskId, { status: 'error', progressText: '异常结束', finishedAt: nowIso() })
    }
  }
}

export function pauseTask(taskId: string) {
  const control = runningTasks.get(taskId)
  if (!control) return

  control.paused = true
  if (control.ctx && control.workflow) {
    const node = control.workflow.nodes[control.nodeIndex]
    if (node) {
      saveCheckpoint({
        taskId,
        nodeIndex: control.nodeIndex,
        nodeId: node.id,
        variables: control.ctx.variables,
        loopStack: control.ctx.loopStack,
        resumeMode: 'at',
        updatedAt: nowIso(),
      })
    }
  }
  updateTask(taskId, { status: 'paused', progressText: '已暂停' })
}

export function resumeTask(taskId: string) {
  const control = runningTasks.get(taskId)
  if (control) {
    control.paused = false
    updateTask(taskId, { status: 'running', progressText: '继续执行' })
    return
  }

  updateTask(taskId, { status: 'queued', progressText: '等待继续执行' })
}

export function cancelTask(taskId: string) {
  const control = runningTasks.get(taskId)
  if (control) {
    control.cancelled = true
    control.paused = false
    deleteCheckpoint(taskId)
    updateTask(taskId, { status: 'cancelled', progressText: '任务已取消', finishedAt: nowIso() })
    return
  }

  deleteCheckpoint(taskId)
  updateTask(taskId, { status: 'cancelled', progressText: '任务已取消', finishedAt: nowIso() })
}

export function getRuntimeState(taskId: string): TaskRuntimeState | null {
  const task = getTask(taskId)
  if (!task) return null

  const cached = runtimeStates.get(taskId)
  if (cached) {
    const status = task.status as TaskStatus
    if (['completed', 'error', 'cancelled'].includes(status)) {
      return {
        ...cached,
        status,
        progress: task.progress,
        progressText: task.progressText,
        logs: getCachedTaskLogs(taskId),
        steps: finalizeSteps(cached.steps, status),
      }
    }
    return {
      ...cached,
      status,
      progress: task.progress,
      progressText: task.progressText,
      logs: getCachedTaskLogs(taskId),
    }
  }

  return {
    taskId,
    runId: task.runId || taskId,
    planId: task.planId,
    runNumber: task.runNumber,
    status: task.status as TaskStatus,
    progress: task.progress,
    progressText: task.progressText,
    currentNodeId: '',
    currentNodeName: '',
    logs: getCachedTaskLogs(taskId),
    steps: [],
  }
}

export async function loadRuntimeState(taskId: string): Promise<TaskRuntimeState | null> {
  const task = getTask(taskId)
  if (!task) return null

  const cached = runtimeStates.get(taskId)
  if (cached && (task.status === 'running' || task.status === 'paused')) {
    return {
      ...cached,
      status: task.status as TaskStatus,
      progress: task.progress,
      progressText: task.progressText,
      logs: getCachedTaskLogs(taskId),
    }
  }

  try {
    const { action, skillDir } = await resolveSkillActionPaths(task.skillId, task.actionId)
    const workflow = await loadWorkflow(skillDir, action)
    const logs = getCachedTaskLogs(taskId)
    const steps = buildStepsFromWorkflowAndLogs(workflow, logs, task.status as TaskStatus)

    const state: TaskRuntimeState = {
      taskId,
      runId: task.runId || taskId,
      planId: task.planId,
      runNumber: task.runNumber,
      status: task.status as TaskStatus,
      progress: task.progress,
      progressText: task.progressText,
      currentNodeId: '',
      currentNodeName: '',
      logs,
      steps,
    }

    if (cached && task.status === 'completed') {
      runtimeStates.set(taskId, state)
    }

    return state
  } catch (err) {
    console.warn('[runtime] rebuild steps failed', taskId, err)
    return getRuntimeState(taskId)
  }
}

export function formatLogsForUi(taskId: string) {
  return getTaskLogs(taskId).map((log) => ({
    time: formatTime(log.createdAt),
    message: log.message,
    level: log.level,
    nodeId: log.nodeId,
    durationMs: log.durationMs,
    screenshotPath: log.screenshotPath,
    consoleLines: log.consoleLines || [],
  }))
}

export async function resolveSkillActionPaths(skillId: string, actionId?: string) {
  const { getSkillById } = await import('../skills/loader.js')
  const skill = await getSkillById(skillId)
  if (!skill) throw new Error('技能包不存在')
  const manifest = await loadManifestFromDir(skill.installPath)
  const resolvedActionId = actionId || manifest.actions[0]?.id
  if (!resolvedActionId) throw new Error('技能包未定义可用动作')
  const action = manifest.actions.find((a) => a.id === resolvedActionId)
  if (!action) throw new Error('动作不存在')
  return { skill, manifest, action, skillDir: skill.installPath }
}
