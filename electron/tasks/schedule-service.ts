import cron from 'node-cron'
import { CronExpressionParser } from 'cron-parser'
import type { TaskScheduleInput } from '../../shared/types.js'
import { DEFAULT_TIMEZONE } from '../../shared/cron-presets.js'
import { getPlan, listScheduledPlans, updatePlanSchedule } from '../db/index.js'

type BroadcastFn = (channel: string, payload: unknown) => void

const jobs = new Map<string, cron.ScheduledTask>()
let broadcast: BroadcastFn = () => {}
let runPlanHandler: (planId: string) => Promise<{ runId: string; planId: string }> = async () => {
  throw new Error('任务执行器未初始化')
}

export function setScheduleBroadcast(fn: BroadcastFn) {
  broadcast = fn
}

export function setScheduleRunPlanHandler(fn: typeof runPlanHandler) {
  runPlanHandler = fn
}

export function validateCronExpression(expression: string) {
  const cronExpr = expression.trim()
  if (!cronExpr) return false
  if (!cron.validate(cronExpr)) return false
  try {
    CronExpressionParser.parse(cronExpr, { tz: DEFAULT_TIMEZONE })
    return true
  } catch {
    return false
  }
}

export function computeNextRunAt(expression: string, timezone = DEFAULT_TIMEZONE) {
  const cronExpr = expression.trim()
  if (!cronExpr || !validateCronExpression(cronExpr)) return null
  try {
    const interval = CronExpressionParser.parse(cronExpr, { tz: timezone })
    return interval.next().toISOString()
  } catch {
    return null
  }
}

function stopJob(planId: string) {
  const job = jobs.get(planId)
  if (job) {
    job.stop()
    jobs.delete(planId)
  }
}

async function triggerScheduledRun(planId: string) {
  const planRow = getPlan(planId)
  if (!planRow) return

  const scheduleEnabled = Number(planRow.schedule_enabled || 0) === 1
  const cronExpr = String(planRow.schedule_cron || '')
  const timezone = String(planRow.schedule_timezone || DEFAULT_TIMEZONE)
  if (!scheduleEnabled || !cronExpr) return

  try {
    const task = await runPlanHandler(planId)
    const now = new Date().toISOString()
    const nextRunAt = computeNextRunAt(cronExpr, timezone)
    updatePlanSchedule(planId, {
      enabled: true,
      cron: cronExpr,
      timezone,
      lastScheduledAt: now,
      nextRunAt,
    })
    broadcast('schedule:triggered', { planId, runId: task.runId, nextRunAt })
    broadcast('task:progress', { taskId: task.runId, planId })
  } catch (err) {
    console.error('[schedule] trigger failed', planId, err)
  }
}

export function schedulePlan(planId: string, schedule: TaskScheduleInput) {
  stopJob(planId)

  if (!schedule.enabled || !schedule.cron.trim()) {
    updatePlanSchedule(planId, {
      enabled: false,
      cron: '',
      timezone: schedule.timezone || DEFAULT_TIMEZONE,
      nextRunAt: null,
    })
    return null
  }

  const cronExpr = schedule.cron.trim()
  const timezone = schedule.timezone || DEFAULT_TIMEZONE
  if (!validateCronExpression(cronExpr)) {
    throw new Error('Cron 表达式无效，请使用标准 5 段格式，例如 0 9 * * *')
  }

  const nextRunAt = computeNextRunAt(cronExpr, timezone)
  updatePlanSchedule(planId, {
    enabled: true,
    cron: cronExpr,
    timezone,
    nextRunAt,
  })

  const job = cron.schedule(
    cronExpr,
    () => {
      void triggerScheduledRun(planId)
    },
    { timezone }
  )

  jobs.set(planId, job)
  return nextRunAt
}

export function reloadPlanSchedule(planId: string) {
  const planRow = getPlan(planId)
  if (!planRow) return null

  const schedule: TaskScheduleInput = {
    enabled: Number(planRow.schedule_enabled || 0) === 1,
    cron: String(planRow.schedule_cron || ''),
    timezone: String(planRow.schedule_timezone || DEFAULT_TIMEZONE),
  }

  if (!schedule.enabled) {
    stopJob(planId)
    return null
  }

  return schedulePlan(planId, schedule)
}

export function unschedulePlan(planId: string) {
  stopJob(planId)
}

export function startScheduleService() {
  stopScheduleService()
  const plans = listScheduledPlans()
  for (const plan of plans) {
    if (plan.schedule?.enabled && plan.schedule.cron) {
      try {
        schedulePlan(plan.planId, plan.schedule)
      } catch (err) {
        console.error('[schedule] failed to load plan', plan.planId, err)
      }
    }
  }
}

export function stopScheduleService() {
  for (const planId of [...jobs.keys()]) {
    stopJob(planId)
  }
}

export function updatePlanScheduleAndReload(planId: string, schedule: TaskScheduleInput) {
  if (!schedule.enabled) {
    unschedulePlan(planId)
    updatePlanSchedule(planId, {
      enabled: false,
      cron: '',
      timezone: schedule.timezone || DEFAULT_TIMEZONE,
      nextRunAt: null,
    })
    return getPlanScheduleView(planId)
  }

  const nextRunAt = schedulePlan(planId, schedule)
  return {
    enabled: true,
    cron: schedule.cron.trim(),
    timezone: schedule.timezone || DEFAULT_TIMEZONE,
    nextRunAt: nextRunAt || undefined,
  }
}

export function getPlanScheduleView(planId: string) {
  const planRow = getPlan(planId)
  if (!planRow) return null
  return {
    enabled: Number(planRow.schedule_enabled || 0) === 1,
    cron: String(planRow.schedule_cron || ''),
    timezone: String(planRow.schedule_timezone || DEFAULT_TIMEZONE),
    nextRunAt: (planRow.next_run_at as string) || undefined,
    lastScheduledAt: (planRow.last_scheduled_at as string) || undefined,
  }
}
