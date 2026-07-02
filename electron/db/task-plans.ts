import type {
  TaskRecord,
  TaskRunRecord,
  TaskStatus,
  TaskLogRecord,
  TaskCheckpoint,
  ExportRecord,
  TaskSchedule,
  TaskScheduleInput,
} from '../../shared/types.js'

type Db = import('better-sqlite3').Database

export function ensurePlanRunTables(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      action_id TEXT NOT NULL,
      action_name TEXT NOT NULL,
      params_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_runs (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      run_number INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'queued',
      progress REAL NOT NULL DEFAULT 0,
      progress_text TEXT NOT NULL DEFAULT '',
      result TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      FOREIGN KEY (plan_id) REFERENCES task_plans(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_task_runs_plan ON task_runs(plan_id);
    CREATE INDEX IF NOT EXISTS idx_task_runs_status ON task_runs(status);
  `)
  migratePlanScheduleColumns(db)
}

function migratePlanScheduleColumns(db: Db) {
  const columns = db.prepare(`PRAGMA table_info(task_plans)`).all() as { name: string }[]
  const names = new Set(columns.map((c) => c.name))
  if (!names.has('schedule_enabled')) {
    db.exec(`ALTER TABLE task_plans ADD COLUMN schedule_enabled INTEGER NOT NULL DEFAULT 0`)
  }
  if (!names.has('schedule_cron')) {
    db.exec(`ALTER TABLE task_plans ADD COLUMN schedule_cron TEXT NOT NULL DEFAULT ''`)
  }
  if (!names.has('schedule_timezone')) {
    db.exec(`ALTER TABLE task_plans ADD COLUMN schedule_timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai'`)
  }
  if (!names.has('next_run_at')) {
    db.exec(`ALTER TABLE task_plans ADD COLUMN next_run_at TEXT`)
  }
  if (!names.has('last_scheduled_at')) {
    db.exec(`ALTER TABLE task_plans ADD COLUMN last_scheduled_at TEXT`)
  }
}

function tableFkReferences(db: Db, table: string, refTable: string) {
  const fkList = db.pragma(`foreign_key_list(${table})`) as { table: string }[]
  return fkList.some((fk) => fk.table === refTable)
}

/** 将 task_logs / task_checkpoints 的外键从旧 tasks 表迁移到 task_runs */
export function migrateTaskChildTablesToRunFk(db: Db) {
  const done = getSetting(db, 'task_fk_v2')
  if (done === '1') return

  const hasRuns = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='task_runs'`)
    .get() as { name: string } | undefined
  if (!hasRuns) return

  const logsExist = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='task_logs'`)
    .get() as { name: string } | undefined
  const checkpointsExist = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='task_checkpoints'`)
    .get() as { name: string } | undefined

  const logsNeedMigrate = logsExist && tableFkReferences(db, 'task_logs', 'tasks')
  const checkpointsNeedMigrate =
    checkpointsExist && tableFkReferences(db, 'task_checkpoints', 'tasks')

  if (!logsNeedMigrate && !checkpointsNeedMigrate) {
    if (!logsExist) createTaskLogsTable(db)
    if (!checkpointsExist) createTaskCheckpointsTable(db)
    setSetting(db, 'task_fk_v2', '1')
    return
  }

  db.pragma('foreign_keys = OFF')
  const tx = db.transaction(() => {
    if (logsNeedMigrate) rebuildTaskLogsTable(db)
    else if (!logsExist) createTaskLogsTable(db)

    if (checkpointsNeedMigrate) rebuildTaskCheckpointsTable(db)
    else if (!checkpointsExist) createTaskCheckpointsTable(db)

    setSetting(db, 'task_fk_v2', '1')
  })
  tx()
  db.pragma('foreign_keys = ON')
}

function getSetting(db: Db, key: string) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? ''
}

function setSetting(db: Db, key: string, value: string) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

function createTaskLogsTable(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      node_id TEXT NOT NULL DEFAULT '',
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      screenshot_path TEXT NOT NULL DEFAULT '',
      console_json TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (task_id) REFERENCES task_runs(id) ON DELETE CASCADE
    );
  `)
}

function createTaskCheckpointsTable(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_checkpoints (
      task_id TEXT PRIMARY KEY,
      node_index INTEGER NOT NULL,
      node_id TEXT NOT NULL,
      variables_json TEXT NOT NULL DEFAULT '{}',
      loop_stack_json TEXT NOT NULL DEFAULT '[]',
      resume_mode TEXT NOT NULL DEFAULT 'after',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES task_runs(id) ON DELETE CASCADE
    );
  `)
}

export function migrateCheckpointResumeMode(db: Db) {
  const exists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='task_checkpoints'`)
    .get()
  if (!exists) return
  const columns = db.prepare(`PRAGMA table_info(task_checkpoints)`).all() as { name: string }[]
  if (!columns.some((c) => c.name === 'resume_mode')) {
    db.exec(`ALTER TABLE task_checkpoints ADD COLUMN resume_mode TEXT NOT NULL DEFAULT 'after'`)
  }
}

function rebuildTaskLogsTable(db: Db) {
  const columns = db.prepare(`PRAGMA table_info(task_logs)`).all() as { name: string }[]
  const names = new Set(columns.map((c) => c.name))
  const screenshotCol = names.has('screenshot_path') ? 'screenshot_path' : "''"
  const consoleCol = names.has('console_json') ? 'console_json' : "'[]'"

  db.exec(`
    CREATE TABLE task_logs_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      node_id TEXT NOT NULL DEFAULT '',
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      screenshot_path TEXT NOT NULL DEFAULT '',
      console_json TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (task_id) REFERENCES task_runs(id) ON DELETE CASCADE
    );
  `)

  db.exec(`
    INSERT INTO task_logs_new (id, task_id, node_id, level, message, duration_ms, created_at, screenshot_path, console_json)
    SELECT l.id, l.task_id, l.node_id, l.level, l.message, l.duration_ms, l.created_at,
           ${screenshotCol}, ${consoleCol}
    FROM task_logs l
    WHERE l.task_id IN (SELECT id FROM task_runs)
  `)

  db.exec(`DROP TABLE task_logs`)
  db.exec(`ALTER TABLE task_logs_new RENAME TO task_logs`)
}

function rebuildTaskCheckpointsTable(db: Db) {
  db.exec(`
    CREATE TABLE task_checkpoints_new (
      task_id TEXT PRIMARY KEY,
      node_index INTEGER NOT NULL,
      node_id TEXT NOT NULL,
      variables_json TEXT NOT NULL DEFAULT '{}',
      loop_stack_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES task_runs(id) ON DELETE CASCADE
    );
  `)

  db.exec(`
    INSERT INTO task_checkpoints_new (task_id, node_index, node_id, variables_json, loop_stack_json, updated_at)
    SELECT c.task_id, c.node_index, c.node_id, c.variables_json, c.loop_stack_json, c.updated_at
    FROM task_checkpoints c
    WHERE c.task_id IN (SELECT id FROM task_runs)
  `)

  db.exec(`DROP TABLE task_checkpoints`)
  db.exec(`ALTER TABLE task_checkpoints_new RENAME TO task_checkpoints`)
}

export function migrateLegacyTasksTable(db: Db) {
  const planCount = (db.prepare('SELECT COUNT(*) as c FROM task_plans').get() as { c: number }).c
  if (planCount > 0) return

  const hasLegacy = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'`)
    .get() as { name: string } | undefined
  if (!hasLegacy) return

  const legacyRows = db.prepare('SELECT * FROM tasks ORDER BY created_at ASC').all() as Record<
    string,
    unknown
  >[]
  if (legacyRows.length === 0) return

  const insertPlan = db.prepare(`
    INSERT INTO task_plans (id, name, skill_id, skill_name, action_id, action_name, params_json, created_at, updated_at)
    VALUES (@id, @name, @skillId, @skillName, @actionId, @actionName, @paramsJson, @createdAt, @updatedAt)
  `)
  const insertRun = db.prepare(`
    INSERT INTO task_runs (id, plan_id, run_number, status, progress, progress_text, result, created_at, updated_at, started_at, finished_at)
    VALUES (@id, @planId, 1, @status, @progress, @progressText, @result, @createdAt, @updatedAt, @startedAt, @finishedAt)
  `)

  const tx = db.transaction(() => {
    for (const row of legacyRows) {
      const planId = row.id as string
      insertPlan.run({
        id: planId,
        name: row.name,
        skillId: row.skill_id,
        skillName: row.skill_name,
        actionId: row.action_id,
        actionName: row.action_name,
        paramsJson: row.params_json,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })
      insertRun.run({
        id: planId,
        planId,
        status: row.status,
        progress: row.progress,
        progressText: row.progress_text,
        result: row.result,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        startedAt: row.started_at ?? null,
        finishedAt: row.finished_at ?? null,
      })
    }
  })
  tx()
}

function mapRunRow(row: Record<string, unknown>): TaskRunRecord {
  return {
    id: row.id as string,
    planId: row.plan_id as string,
    runNumber: row.run_number as number,
    status: row.status as TaskStatus,
    progress: row.progress as number,
    progressText: row.progress_text as string,
    result: row.result as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    startedAt: (row.started_at as string) || undefined,
    finishedAt: (row.finished_at as string) || undefined,
  }
}

function mapScheduleFromPlan(plan: Record<string, unknown>): TaskSchedule {
  return {
    enabled: Number(plan.schedule_enabled || 0) === 1,
    cron: String(plan.schedule_cron || ''),
    timezone: String(plan.schedule_timezone || 'Asia/Shanghai'),
    nextRunAt: (plan.next_run_at as string) || undefined,
    lastScheduledAt: (plan.last_scheduled_at as string) || undefined,
  }
}

function extractPlanFromRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    skill_id: row.skill_id,
    skill_name: row.skill_name,
    action_id: row.action_id,
    action_name: row.action_name,
    params_json: row.params_json,
    created_at: row.created_at,
    updated_at: row.updated_at,
    schedule_enabled: row.schedule_enabled,
    schedule_cron: row.schedule_cron,
    schedule_timezone: row.schedule_timezone,
    next_run_at: row.next_run_at,
    last_scheduled_at: row.last_scheduled_at,
  }
}

function parsePlanParams(raw: unknown): Record<string, unknown> {
  try {
    return JSON.parse(String(raw || '{}')) as Record<string, unknown>
  } catch {
    console.warn('[db] params_json 解析失败，已使用空对象')
    return {}
  }
}

function mergePlanRun(
  plan: Record<string, unknown>,
  run: Record<string, unknown> | null | undefined,
  runCount: number
): TaskRecord {
  const params = parsePlanParams(plan.params_json)
  const schedule = mapScheduleFromPlan(plan)
  if (!run) {
    return {
      id: plan.id as string,
      planId: plan.id as string,
      runId: '',
      runNumber: 0,
      runCount,
      name: plan.name as string,
      skillId: plan.skill_id as string,
      skillName: plan.skill_name as string,
      actionId: plan.action_id as string,
      actionName: plan.action_name as string,
      status: 'queued',
      progress: 0,
      progressText: '',
      result: '',
      params,
      schedule,
      createdAt: plan.created_at as string,
      updatedAt: plan.updated_at as string,
    }
  }
  return {
    id: plan.id as string,
    planId: plan.id as string,
    runId: run.id as string,
    runNumber: run.run_number as number,
    runCount,
    name: plan.name as string,
    skillId: plan.skill_id as string,
    skillName: plan.skill_name as string,
    actionId: plan.action_id as string,
    actionName: plan.action_name as string,
    status: run.status as TaskStatus,
    progress: run.progress as number,
    progressText: run.progress_text as string,
    result: run.result as string,
    params,
    schedule,
    createdAt: plan.created_at as string,
    updatedAt: run.updated_at as string,
    startedAt: (run.started_at as string) || undefined,
    finishedAt: (run.finished_at as string) || undefined,
  }
}

const LATEST_RUN_CTE = `
  WITH latest_runs AS (
    SELECT r.*, ROW_NUMBER() OVER (PARTITION BY plan_id ORDER BY run_number DESC, id DESC) AS rn
    FROM task_runs r
  ),
  run_counts AS (
    SELECT plan_id, COUNT(*) AS run_count FROM task_runs GROUP BY plan_id
  )
`

const PLAN_WITH_LATEST_RUN_FROM = `
  FROM task_plans p
  LEFT JOIN latest_runs lr ON lr.plan_id = p.id AND lr.rn = 1
  LEFT JOIN run_counts rc ON rc.plan_id = p.id
`

function mapPlanWithLatestRunRow(row: Record<string, unknown>): TaskRecord {
  const plan = extractPlanFromRow(row)
  const run = row.run_id
    ? {
        id: row.run_id,
        run_number: row.run_number,
        status: row.status,
        progress: row.progress,
        progress_text: row.progress_text,
        result: row.result,
        updated_at: row.run_updated_at,
        started_at: row.started_at,
        finished_at: row.finished_at,
      }
    : null
  return mergePlanRun(plan, run, (row.run_count as number) || 0)
}

export function createPlan(
  db: Db,
  plan: {
    id: string
    name: string
    skillId: string
    skillName: string
    actionId: string
    actionName: string
    params: Record<string, unknown>
    schedule?: TaskScheduleInput
  }
) {
  const now = new Date().toISOString()
  const schedule = plan.schedule
  db.prepare(
    `INSERT INTO task_plans (
      id, name, skill_id, skill_name, action_id, action_name, params_json,
      schedule_enabled, schedule_cron, schedule_timezone, next_run_at, last_scheduled_at,
      created_at, updated_at
    ) VALUES (
      @id, @name, @skillId, @skillName, @actionId, @actionName, @paramsJson,
      @scheduleEnabled, @scheduleCron, @scheduleTimezone, @nextRunAt, @lastScheduledAt,
      @createdAt, @updatedAt
    )`
  ).run({
    id: plan.id,
    name: plan.name,
    skillId: plan.skillId,
    skillName: plan.skillName,
    actionId: plan.actionId,
    actionName: plan.actionName,
    paramsJson: JSON.stringify(plan.params),
    scheduleEnabled: schedule?.enabled ? 1 : 0,
    scheduleCron: schedule?.enabled ? schedule.cron || '' : '',
    scheduleTimezone: schedule?.timezone || 'Asia/Shanghai',
    nextRunAt: null,
    lastScheduledAt: null,
    createdAt: now,
    updatedAt: now,
  })
}

export function updatePlanSchedule(
  db: Db,
  planId: string,
  input: TaskScheduleInput & { nextRunAt?: string | null; lastScheduledAt?: string | null }
) {
  const now = new Date().toISOString()
  db.prepare(
    `UPDATE task_plans SET
      schedule_enabled = @enabled,
      schedule_cron = @cron,
      schedule_timezone = @timezone,
      next_run_at = @nextRunAt,
      last_scheduled_at = COALESCE(@lastScheduledAt, last_scheduled_at),
      updated_at = @updatedAt
     WHERE id = @planId`
  ).run({
    planId,
    enabled: input.enabled ? 1 : 0,
    cron: input.enabled ? input.cron : '',
    timezone: input.timezone || 'Asia/Shanghai',
    nextRunAt: input.nextRunAt ?? null,
    lastScheduledAt: input.lastScheduledAt ?? null,
    updatedAt: now,
  })
}

export function listEnabledScheduledPlans(db: Db): TaskRecord[] {
  const rows = db
    .prepare(
      `SELECT p.*,
              (SELECT COUNT(*) FROM task_runs WHERE plan_id = p.id) as run_count
       FROM task_plans p
       WHERE p.schedule_enabled = 1 AND p.schedule_cron != ''
       ORDER BY p.updated_at DESC`
    )
    .all() as Record<string, unknown>[]

  return rows.map((row) => {
    const plan = row
    const runCount = (row.run_count as number) || 0
    return mergePlanRun(plan, null, runCount)
  })
}

export function createRun(
  db: Db,
  run: {
    id: string
    planId: string
    runNumber: number
    status?: TaskStatus
    progressText?: string
  }
) {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO task_runs (id, plan_id, run_number, status, progress, progress_text, result, created_at, updated_at)
     VALUES (@id, @planId, @runNumber, @status, 0, @progressText, '', @createdAt, @updatedAt)`
  ).run({
    id: run.id,
    planId: run.planId,
    runNumber: run.runNumber,
    status: run.status || 'queued',
    progressText: run.progressText || '等待执行',
    createdAt: now,
    updatedAt: now,
  })
  db.prepare(`UPDATE task_plans SET updated_at = ? WHERE id = ?`).run(now, run.planId)
}

export function getNextRunNumber(db: Db, planId: string) {
  const row = db
    .prepare(`SELECT COALESCE(MAX(run_number), 0) + 1 as n FROM task_runs WHERE plan_id = ?`)
    .get(planId) as { n: number }
  return row.n
}

export function getRunCount(db: Db, planId: string) {
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM task_runs WHERE plan_id = ?`)
    .get(planId) as { c: number }
  return row.c
}

export function updateRun(
  db: Db,
  runId: string,
  patch: Partial<
    Pick<TaskRunRecord, 'status' | 'progress' | 'progressText' | 'result' | 'startedAt' | 'finishedAt'>
  >
) {
  const fields: string[] = ['updated_at = ?']
  const values: unknown[] = [new Date().toISOString()]

  if (patch.status !== undefined) {
    fields.push('status = ?')
    values.push(patch.status)
  }
  if (patch.progress !== undefined) {
    fields.push('progress = ?')
    values.push(patch.progress)
  }
  if (patch.progressText !== undefined) {
    fields.push('progress_text = ?')
    values.push(patch.progressText)
  }
  if (patch.result !== undefined) {
    fields.push('result = ?')
    values.push(patch.result)
  }
  if (patch.startedAt !== undefined) {
    fields.push('started_at = ?')
    values.push(patch.startedAt)
  }
  if (patch.finishedAt !== undefined) {
    fields.push('finished_at = ?')
    values.push(patch.finishedAt)
  }

  values.push(runId)
  db.prepare(`UPDATE task_runs SET ${fields.join(', ')} WHERE id = ?`).run(...values)

  const run = db.prepare('SELECT plan_id FROM task_runs WHERE id = ?').get(runId) as
    | { plan_id: string }
    | undefined
  if (run) {
    db.prepare(`UPDATE task_plans SET updated_at = ? WHERE id = ?`).run(
      new Date().toISOString(),
      run.plan_id
    )
  }
}

export function getRunById(db: Db, runId: string): TaskRunRecord | null {
  const row = db.prepare('SELECT * FROM task_runs WHERE id = ?').get(runId) as
    | Record<string, unknown>
    | undefined
  return row ? mapRunRow(row) : null
}

export function getPlanById(db: Db, planId: string) {
  return db.prepare('SELECT * FROM task_plans WHERE id = ?').get(planId) as
    | Record<string, unknown>
    | undefined
}

export function getTaskByRunId(db: Db, runId: string): TaskRecord | null {
  const run = db.prepare('SELECT * FROM task_runs WHERE id = ?').get(runId) as
    | Record<string, unknown>
    | undefined
  if (!run) return null
  const plan = getPlanById(db, run.plan_id as string)
  if (!plan) return null
  const runCount = getRunCount(db, plan.id as string)
  return mergePlanRun(plan, run, runCount)
}

export function getTaskByPlanId(db: Db, planId: string): TaskRecord | null {
  const plan = getPlanById(db, planId)
  if (!plan) return null
  const run = db
    .prepare(`SELECT * FROM task_runs WHERE plan_id = ? ORDER BY run_number DESC LIMIT 1`)
    .get(planId) as Record<string, unknown> | undefined
  const runCount = getRunCount(db, planId)
  return mergePlanRun(plan, run, runCount)
}

export function resolveTask(db: Db, id: string): TaskRecord | null {
  return getTaskByRunId(db, id) || getTaskByPlanId(db, id)
}

export function listPlanTasks(db: Db, limit = 50): TaskRecord[] {
  const rows = db
    .prepare(
      `${LATEST_RUN_CTE}
       SELECT p.*, lr.id as run_id, lr.run_number, lr.status, lr.progress, lr.progress_text, lr.result,
              lr.updated_at as run_updated_at, lr.started_at, lr.finished_at,
              COALESCE(rc.run_count, 0) as run_count
       ${PLAN_WITH_LATEST_RUN_FROM}
       ORDER BY COALESCE(lr.updated_at, p.updated_at) DESC
       LIMIT ?`
    )
    .all(limit) as Record<string, unknown>[]
  return rows.map(mapPlanWithLatestRunRow)
}

export type TaskListFilter = 'all' | 'running' | 'completed' | 'failed'

function statusWhere(filter: TaskListFilter) {
  if (filter === 'running') return `AND lr.status IN ('running', 'queued', 'paused')`
  if (filter === 'completed') return `AND lr.status = 'completed'`
  if (filter === 'failed') return `AND lr.status = 'error'`
  return ''
}

export function getPlanStatusCounts(db: Db) {
  const rows = db
    .prepare(
      `${LATEST_RUN_CTE}
       SELECT lr.status, COUNT(*) as c
       ${PLAN_WITH_LATEST_RUN_FROM}
       WHERE lr.id IS NOT NULL
       GROUP BY lr.status`
    )
    .all() as { status: string; c: number }[]
  const map = Object.fromEntries(rows.map((r) => [r.status, r.c]))
  const all = (db.prepare('SELECT COUNT(*) as c FROM task_plans').get() as { c: number }).c
  return {
    all,
    running: (map.running || 0) + (map.queued || 0) + (map.paused || 0),
    completed: map.completed || 0,
    failed: map.error || 0,
  }
}

export function listPlansPaged(
  db: Db,
  options: { status?: TaskListFilter; page?: number; pageSize?: number }
) {
  const page = Math.max(1, options.page || 1)
  const pageSize = Math.max(1, Math.min(50, options.pageSize || 5))
  const offset = (page - 1) * pageSize
  const filter = options.status || 'all'
  const statusClause = statusWhere(filter)
  const baseFrom = `${PLAN_WITH_LATEST_RUN_FROM} WHERE 1=1 ${statusClause}`

  const totalRow = db.prepare(`${LATEST_RUN_CTE} SELECT COUNT(*) as c ${baseFrom}`).get() as { c: number }
  const rows = db
    .prepare(
      `${LATEST_RUN_CTE}
       SELECT p.*, lr.id as run_id, lr.run_number, lr.status, lr.progress, lr.progress_text, lr.result,
              lr.updated_at as run_updated_at, lr.started_at, lr.finished_at,
              COALESCE(rc.run_count, 0) as run_count
       ${baseFrom}
       ORDER BY COALESCE(lr.updated_at, p.updated_at) DESC
       LIMIT ? OFFSET ?`
    )
    .all(pageSize, offset) as Record<string, unknown>[]

  const items = rows.map(mapPlanWithLatestRunRow)

  return {
    items,
    total: totalRow.c,
    page,
    pageSize,
    counts: getPlanStatusCounts(db),
  }
}

function mapRunWithPlanRow(db: Db, row: Record<string, unknown>): TaskRecord {
  const plan = extractPlanFromRow({
    id: row.plan_id,
    name: row.name,
    skill_id: row.skill_id,
    skill_name: row.skill_name,
    action_id: row.action_id,
    action_name: row.action_name,
    params_json: row.params_json,
    created_at: row.plan_created_at,
    updated_at: row.updated_at,
    schedule_enabled: row.schedule_enabled,
    schedule_cron: row.schedule_cron,
    schedule_timezone: row.schedule_timezone,
    next_run_at: row.next_run_at,
    last_scheduled_at: row.last_scheduled_at,
  })
  const runCount = getRunCount(db, row.plan_id as string)
  return mergePlanRun(plan, row, runCount)
}

export function listDispatchRuns(db: Db, failedLimit = 50) {
  const activeRows = db
    .prepare(
      `SELECT r.*, p.name, p.skill_id, p.skill_name, p.action_id, p.action_name, p.params_json, p.created_at as plan_created_at,
              p.schedule_enabled, p.schedule_cron, p.schedule_timezone, p.next_run_at, p.last_scheduled_at
       FROM task_runs r
       JOIN task_plans p ON p.id = r.plan_id
       WHERE r.status IN ('running', 'queued', 'paused')
       ORDER BY CASE r.status WHEN 'running' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, r.updated_at DESC`
    )
    .all() as Record<string, unknown>[]

  const failedRows = db
    .prepare(
      `SELECT r.*, p.name, p.skill_id, p.skill_name, p.action_id, p.action_name, p.params_json, p.created_at as plan_created_at,
              p.schedule_enabled, p.schedule_cron, p.schedule_timezone, p.next_run_at, p.last_scheduled_at
       FROM task_runs r
       JOIN task_plans p ON p.id = r.plan_id
       WHERE r.status = 'error'
       ORDER BY COALESCE(r.finished_at, r.updated_at) DESC
       LIMIT ?`
    )
    .all(failedLimit) as Record<string, unknown>[]

  return {
    active: activeRows.map((row) => mapRunWithPlanRow(db, row)),
    failed: failedRows.map((row) => mapRunWithPlanRow(db, row)),
    counts: {
      active: activeRows.length,
      failed: failedRows.length,
    },
  }
}

export function listQueuedRuns(db: Db, limit = 10): TaskRecord[] {
  const rows = db
    .prepare(
      `SELECT r.*, p.name, p.skill_id, p.skill_name, p.action_id, p.action_name, p.params_json, p.created_at as plan_created_at,
              p.schedule_enabled, p.schedule_cron, p.schedule_timezone, p.next_run_at, p.last_scheduled_at
       FROM task_runs r
       JOIN task_plans p ON p.id = r.plan_id
       WHERE r.status = 'queued'
       ORDER BY r.created_at ASC
       LIMIT ?`
    )
    .all(limit) as Record<string, unknown>[]

  return rows.map((row) => {
    const plan = {
      id: row.plan_id,
      name: row.name,
      skill_id: row.skill_id,
      skill_name: row.skill_name,
      action_id: row.action_id,
      action_name: row.action_name,
      params_json: row.params_json,
      created_at: row.plan_created_at,
      updated_at: row.updated_at,
    }
    const runCount = getRunCount(db, row.plan_id as string)
    return mergePlanRun(plan, row, runCount)
  })
}

export function listRunsByPlanId(db: Db, planId: string): TaskRunRecord[] {
  const rows = db
    .prepare(`SELECT * FROM task_runs WHERE plan_id = ? ORDER BY run_number DESC`)
    .all(planId) as Record<string, unknown>[]
  return rows.map(mapRunRow)
}

export function deletePlan(db: Db, planId: string) {
  const runs = db.prepare('SELECT id FROM task_runs WHERE plan_id = ?').all(planId) as { id: string }[]
  for (const run of runs) {
    db.prepare('DELETE FROM task_logs WHERE task_id = ?').run(run.id)
    db.prepare('DELETE FROM task_checkpoints WHERE task_id = ?').run(run.id)
  }
  db.prepare('DELETE FROM task_runs WHERE plan_id = ?').run(planId)
  db.prepare('DELETE FROM task_plans WHERE id = ?').run(planId)
}

/** 清空全部任务方案与执行记录（含日志、断点、关联导出元数据） */
export function clearAllTaskHistory(db: Db) {
  const tx = db.transaction(() => {
    db.exec('DELETE FROM task_logs')
    db.exec('DELETE FROM task_checkpoints')
    db.exec('DELETE FROM exports')
    db.exec('DELETE FROM task_runs')
    db.exec('DELETE FROM task_plans')
    const hasLegacy = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'`)
      .get() as { name: string } | undefined
    if (hasLegacy) db.exec('DELETE FROM tasks')
  })
  tx()
}

export function listPlansWithRunLogs(db: Db, limit = 30) {
  const plans = listPlanTasks(db, limit)
  if (plans.length === 0) return []

  const planIds = plans.map((p) => p.planId)
  const planPlaceholders = planIds.map(() => '?').join(',')
  const runRows = db
    .prepare(
      `SELECT * FROM task_runs WHERE plan_id IN (${planPlaceholders}) ORDER BY plan_id, run_number DESC`
    )
    .all(...planIds) as Record<string, unknown>[]

  const runsByPlan = new Map<string, TaskRunRecord[]>()
  const allRunIds: string[] = []
  for (const row of runRows) {
    const run = mapRunRow(row)
    allRunIds.push(run.id)
    const list = runsByPlan.get(run.planId) || []
    list.push(run)
    runsByPlan.set(run.planId, list)
  }

  const logsByRun = new Map<string, TaskLogRecord[]>()
  if (allRunIds.length > 0) {
    const runPlaceholders = allRunIds.map(() => '?').join(',')
    const logRows = db
      .prepare(
        `WITH ranked AS (
           SELECT *, ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY id DESC) AS rn
           FROM task_logs
           WHERE task_id IN (${runPlaceholders})
         )
         SELECT * FROM ranked WHERE rn <= 50 ORDER BY task_id, id ASC`
      )
      .all(...allRunIds) as Record<string, unknown>[]

    for (const row of logRows) {
      const log = mapLogRow(row)
      const list = logsByRun.get(log.taskId) || []
      list.push(log)
      logsByRun.set(log.taskId, list)
    }
  }

  return plans.map((task) => ({
    task,
    runs: (runsByPlan.get(task.planId) || []).map((run) => ({
      run,
      logs: logsByRun.get(run.id) || [],
    })),
  }))
}

function mapLogRow(row: Record<string, unknown>): TaskLogRecord {
  return {
    id: row.id as number,
    taskId: row.task_id as string,
    runId: row.task_id as string,
    nodeId: row.node_id as string,
    level: row.level as TaskLogRecord['level'],
    message: row.message as string,
    durationMs: row.duration_ms as number,
    createdAt: row.created_at as string,
    screenshotPath: (row.screenshot_path as string) || undefined,
    consoleLines: parseConsoleJson(row.console_json as string | undefined),
  }
}

export function getRunLogs(db: Db, runId: string, limit = 200): TaskLogRecord[] {
  const rows = db
    .prepare('SELECT * FROM task_logs WHERE task_id = ? ORDER BY id DESC LIMIT ?')
    .all(runId, limit) as Record<string, unknown>[]
  return rows.reverse().map(mapLogRow)
}

function parseConsoleJson(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export function saveRunCheckpoint(db: Db, checkpoint: TaskCheckpoint) {
  db.prepare(
    `INSERT OR REPLACE INTO task_checkpoints (task_id, node_index, node_id, variables_json, loop_stack_json, resume_mode, updated_at)
     VALUES (@taskId, @nodeIndex, @nodeId, @variablesJson, @loopStackJson, @resumeMode, @updatedAt)`
  ).run({
    taskId: checkpoint.taskId,
    nodeIndex: checkpoint.nodeIndex,
    nodeId: checkpoint.nodeId,
    variablesJson: JSON.stringify(checkpoint.variables),
    loopStackJson: JSON.stringify(checkpoint.loopStack),
    resumeMode: checkpoint.resumeMode || 'after',
    updatedAt: checkpoint.updatedAt,
  })
}

function parseCheckpointJson<T>(raw: unknown, fallback: T): T {
  try {
    return JSON.parse(String(raw || (Array.isArray(fallback) ? '[]' : '{}'))) as T
  } catch {
    return fallback
  }
}

export function getRunCheckpoint(db: Db, runId: string): TaskCheckpoint | null {
  const row = db.prepare('SELECT * FROM task_checkpoints WHERE task_id = ?').get(runId) as
    | Record<string, unknown>
    | undefined
  if (!row) return null
  const resumeMode = String(row.resume_mode || 'after')
  return {
    taskId: row.task_id as string,
    nodeIndex: row.node_index as number,
    nodeId: row.node_id as string,
    variables: parseCheckpointJson(row.variables_json, {}),
    loopStack: parseCheckpointJson(row.loop_stack_json, []),
    resumeMode: resumeMode === 'at' ? 'at' : 'after',
    updatedAt: row.updated_at as string,
  }
}

export function deleteRunCheckpoint(db: Db, runId: string) {
  db.prepare('DELETE FROM task_checkpoints WHERE task_id = ?').run(runId)
}

export function addRunLog(db: Db, log: Omit<TaskLogRecord, 'id'>) {
  const runId = log.runId || log.taskId
  const result = db
    .prepare(
      `INSERT INTO task_logs (task_id, node_id, level, message, duration_ms, created_at, screenshot_path, console_json)
       VALUES (@taskId, @nodeId, @level, @message, @durationMs, @createdAt, @screenshotPath, @consoleJson)`
    )
    .run({
      taskId: runId,
      nodeId: log.nodeId,
      level: log.level,
      message: log.message,
      durationMs: log.durationMs,
      createdAt: log.createdAt,
      screenshotPath: log.screenshotPath || '',
      consoleJson: JSON.stringify(log.consoleLines || []),
    })
  return Number(result.lastInsertRowid)
}

export function getDashboardStatsFromRuns(db: Db) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = today.toISOString()

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayIso = yesterday.toISOString()

  const runStats = db
    .prepare(
      `SELECT
         SUM(CASE WHEN created_at >= @todayIso THEN 1 ELSE 0 END) AS todayRuns,
         SUM(CASE WHEN status = 'completed' AND created_at >= @todayIso THEN 1 ELSE 0 END) AS success,
         SUM(CASE WHEN status = 'error' AND created_at >= @todayIso THEN 1 ELSE 0 END) AS failure,
         SUM(CASE WHEN status IN ('queued', 'paused') THEN 1 ELSE 0 END) AS waiting,
         COALESCE(SUM(
           CASE WHEN created_at >= @todayIso AND started_at IS NOT NULL AND finished_at IS NOT NULL
           THEN (julianday(finished_at) - julianday(started_at)) * 86400000
           ELSE 0 END
         ), 0) AS runtimeMs,
         SUM(CASE WHEN created_at >= @yesterdayIso AND created_at < @todayIso THEN 1 ELSE 0 END) AS yesterdayRuns
       FROM task_runs`
    )
    .get({ todayIso, yesterdayIso }) as {
    todayRuns: number | null
    success: number | null
    failure: number | null
    waiting: number | null
    runtimeMs: number | null
    yesterdayRuns: number | null
  }

  const exportStats = db
    .prepare(
      `SELECT
         SUM(CASE WHEN type = 'excel' THEN 1 ELSE 0 END) AS exportExcel,
         SUM(CASE WHEN type = 'json' THEN 1 ELSE 0 END) AS exportJson,
         SUM(CASE WHEN type IN ('image', 'zip') THEN 1 ELSE 0 END) AS exportImages
       FROM exports`
    )
    .get() as {
    exportExcel: number | null
    exportJson: number | null
    exportImages: number | null
  }

  const todayRuns = runStats.todayRuns || 0
  const success = runStats.success || 0
  const failure = runStats.failure || 0
  const waiting = runStats.waiting || 0
  const runtimeMs = runStats.runtimeMs || 0
  const yesterdayRuns = runStats.yesterdayRuns || 0

  const hours = Math.floor(runtimeMs / 3600000)
  const mins = Math.floor((runtimeMs % 3600000) / 60000)
  const runtime = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`

  const todayRunsChange =
    yesterdayRuns > 0
      ? Math.round(((todayRuns - yesterdayRuns) / yesterdayRuns) * 100)
      : todayRuns > 0
        ? 100
        : 0

  return {
    todayRuns,
    todayRunsChange,
    success,
    failure,
    waiting,
    runtime,
    exportExcel: exportStats.exportExcel || 0,
    exportImages: exportStats.exportImages || 0,
    exportJson: exportStats.exportJson || 0,
  }
}

export function getExportsByRunId(db: Db, runId: string): ExportRecord[] {
  const rows = db
    .prepare('SELECT * FROM exports WHERE task_id = ? ORDER BY created_at DESC')
    .all(runId) as Record<string, unknown>[]
  return rows.map((row) => ({
    id: row.id as string,
    taskId: row.task_id as string,
    taskName: row.task_name as string,
    type: row.type as string,
    filename: row.filename as string,
    path: row.path as string,
    size: row.size as number,
    createdAt: row.created_at as string,
  }))
}
