import { v4 as uuidv4 } from 'uuid'
import {
  createPlan,
  createRunForPlan,
  getTask,
  listQueuedTasks,
  listTasks,
  deleteTask,
  clearAllTaskHistory as clearAllTaskHistoryInDb,
  updateTask,
  getSetting,
} from '../db/index.js'
import {
  runTask,
  pauseTask,
  resumeTask,
  cancelTask,
  getRuntimeState,
  resolveSkillActionPaths,
} from '../runtime/engine.js'

type BroadcastFn = (channel: string, payload: unknown) => void

let broadcast: BroadcastFn = () => {}
const runningRunIds = new Set<string>()

export function setTaskBroadcast(fn: BroadcastFn) {
  broadcast = fn
}

function getMaxConcurrent() {
  return Math.max(1, Number(getSetting('maxConcurrent', '3')) || 3)
}

function notifyProgress(runId: string) {
  const state = getRuntimeState(runId)
  if (state) broadcast('task:progress', state)
}

async function processQueue() {
  while (runningRunIds.size < getMaxConcurrent()) {
    const next = listQueuedTasks(1)[0]
    if (!next?.runId) break
    void startRunExecution(next.runId)
  }
}

function finishRun(runId: string) {
  runningRunIds.delete(runId)
  void processQueue()
}

export async function createAndQueueTask(input: {
  skillId: string
  actionId?: string
  name?: string
  params?: Record<string, unknown>
  planId?: string
}) {
  const { skill, action } = await resolveSkillActionPaths(input.skillId, input.actionId)
  const planId = input.planId || uuidv4()
  const runId = uuidv4()

  if (!input.planId) {
    createPlan({
      id: planId,
      name: input.name || `${skill.name} - ${action.name}`,
      skillId: skill.id,
      skillName: skill.name,
      actionId: action.id,
      actionName: action.name,
      params: input.params || {},
    })
  }

  createRunForPlan(planId, runId)
  return getTask(runId)!
}

export async function startRunExecution(runId: string) {
  const task = getTask(runId)
  if (!task?.runId) throw new Error('执行记录不存在')
  if (runningRunIds.has(runId)) return task

  if (runningRunIds.size >= getMaxConcurrent() && task.status !== 'running') {
    updateTask(runId, { status: 'queued', progressText: '排队等待中' })
    return getTask(runId)
  }

  const { skill, action } = await resolveSkillActionPaths(task.skillId, task.actionId)
  runningRunIds.add(runId)

  runTask(runId, skill.installPath, action, task.params, (state) => {
    broadcast('task:progress', state)
  })
    .catch((err) => {
      notifyProgress(runId)
      console.error('[task]', runId, err)
    })
    .finally(() => {
      finishRun(runId)
    })

  return getTask(runId)
}

export const startTaskExecution = startRunExecution

export async function createAndStartTask(input: {
  skillId: string
  actionId?: string
  name?: string
  params?: Record<string, unknown>
}) {
  const task = await createAndQueueTask(input)
  if (runningRunIds.size < getMaxConcurrent()) {
    await startRunExecution(task.runId)
  }
  return getTask(task.runId)!
}

export function pauseRunById(runId: string) {
  pauseTask(runId)
  notifyProgress(runId)
  return getTask(runId)
}

export const pauseTaskById = pauseRunById

export function resumeRunById(runId: string) {
  const task = getTask(runId)
  if (!task) return null

  if (task.status === 'paused' && !runningRunIds.has(runId)) {
    updateTask(runId, { status: 'queued', progressText: '等待继续执行' })
    void processQueue()
    return getTask(runId)
  }

  resumeTask(runId)
  notifyProgress(runId)
  return getTask(runId)
}

export const resumeTaskById = resumeRunById

export function cancelRunById(runId: string) {
  cancelTask(runId)
  notifyProgress(runId)
  return getTask(runId)
}

export const cancelTaskById = cancelRunById

export async function deletePlanById(planId: string) {
  const task = getTask(planId)
  const id = task?.planId || planId
  if (task?.runId) runningRunIds.delete(task.runId)
  deleteTask(id)
  return { ok: true }
}

export const deleteTaskById = deletePlanById

export function clearAllTaskHistory() {
  runningRunIds.clear()
  clearAllTaskHistoryInDb()
  return { ok: true }
}

/** 再次运行：同方案下新建一次执行记录 */
export async function runPlanAgain(planId: string) {
  const plan = getTask(planId)
  if (!plan) throw new Error('任务方案不存在')

  const runId = uuidv4()
  createRunForPlan(plan.planId, runId)

  if (runningRunIds.size < getMaxConcurrent()) {
    await startRunExecution(runId)
  } else {
    void processQueue()
  }

  return getTask(runId)!
}

export const retryTaskById = runPlanAgain

export function getRecentTasks(limit = 20) {
  return listTasks(limit)
}
