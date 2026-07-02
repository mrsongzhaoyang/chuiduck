import { createRequire } from 'node:module'
import type BetterSqlite3 from 'better-sqlite3'
import type {
  TaskRecord,
  TaskStatus,
  TaskLogRecord,
  TaskCheckpoint,
  ExportRecord,
  DashboardStatsDTO,
} from '../../shared/types.js'
import { getPaths, ensureAppDirs } from '../paths.js'
import {
  ensurePlanRunTables,
  migrateLegacyTasksTable,
  createPlan as insertPlan,
  createRun,
  getNextRunNumber,
  updateRun,
  resolveTask,
  getTaskByRunId,
  listPlanTasks,
  listPlansPaged,
  getPlanStatusCounts,
  listQueuedRuns,
  listDispatchRuns,
  listRunsByPlanId,
  deletePlan,
  clearAllTaskHistory as clearAllTaskHistoryInDb,
  migrateTaskChildTablesToRunFk,
  listPlansWithRunLogs,
  getRunLogs,
  saveRunCheckpoint,
  getRunCheckpoint,
  deleteRunCheckpoint,
  addRunLog,
  getDashboardStatsFromRuns,
  getExportsByRunId,
  type TaskListFilter,
} from './task-plans.js'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof BetterSqlite3

let db: BetterSqlite3.Database | null = null

function getDb() {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

export async function initDatabase() {
  await ensureAppDirs()
  const { db: dbPath } = getPaths()
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS installed_skills (
      id TEXT NOT NULL,
      version TEXT NOT NULL,
      install_path TEXT NOT NULL,
      installed_at TEXT NOT NULL,
      PRIMARY KEY (id, version)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      action_id TEXT NOT NULL,
      action_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress REAL NOT NULL DEFAULT 0,
      progress_text TEXT NOT NULL DEFAULT '',
      result TEXT NOT NULL DEFAULT '',
      params_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS task_checkpoints (
      task_id TEXT PRIMARY KEY,
      node_index INTEGER NOT NULL,
      node_id TEXT NOT NULL,
      variables_json TEXT NOT NULL DEFAULT '{}',
      loop_stack_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      node_id TEXT NOT NULL DEFAULT '',
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exports (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      task_name TEXT NOT NULL,
      type TEXT NOT NULL,
      filename TEXT NOT NULL,
      path TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `)
  migrateTaskLogsColumns()
  ensurePlanRunTables(db)
  migrateLegacyTasksTable(db)
  migrateTaskChildTablesToRunFk(db)
  db.pragma('foreign_keys = ON')
  return db
}

function migrateTaskLogsColumns() {
  const database = getDb()
  const columns = database.prepare(`PRAGMA table_info(task_logs)`).all() as { name: string }[]
  const names = new Set(columns.map((c) => c.name))
  if (!names.has('screenshot_path')) {
    database.exec(`ALTER TABLE task_logs ADD COLUMN screenshot_path TEXT NOT NULL DEFAULT ''`)
  }
  if (!names.has('console_json')) {
    database.exec(`ALTER TABLE task_logs ADD COLUMN console_json TEXT NOT NULL DEFAULT '[]'`)
  }
}

export function closeDatabase() {
  db?.close()
  db = null
}

export function getSetting(key: string, defaultValue = '') {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? defaultValue
}

export function setSetting(key: string, value: string) {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

export function recordInstalledSkill(id: string, version: string, installPath: string) {
  getDb()
    .prepare(
      'INSERT OR REPLACE INTO installed_skills (id, version, install_path, installed_at) VALUES (?, ?, ?, ?)'
    )
    .run(id, version, installPath, new Date().toISOString())
}

export function getInstalledSkills() {
  return getDb()
    .prepare('SELECT id, version, install_path as installPath, installed_at as installedAt FROM installed_skills')
    .all() as { id: string; version: string; installPath: string; installedAt: string }[]
}

export function createPlan(plan: {
  id: string
  name: string
  skillId: string
  skillName: string
  actionId: string
  actionName: string
  params: Record<string, unknown>
}) {
  insertPlan(getDb(), plan)
}

export function createTask(task: Omit<TaskRecord, 'createdAt' | 'updatedAt' | 'planId' | 'runId' | 'runNumber' | 'runCount'> & { params: Record<string, unknown>; planId?: string; runId?: string }) {
  const db = getDb()
  const planId = task.planId || task.id
  const runId = task.runId || task.id
  insertPlan(db, {
    id: planId,
    name: task.name,
    skillId: task.skillId,
    skillName: task.skillName,
    actionId: task.actionId,
    actionName: task.actionName,
    params: task.params,
  })
  createRun(db, {
    id: runId,
    planId,
    runNumber: 1,
    status: task.status,
    progressText: task.progressText,
  })
  if (task.status !== 'queued' || task.progress > 0 || task.result) {
    updateRun(db, runId, {
      status: task.status,
      progress: task.progress,
      progressText: task.progressText,
      result: task.result,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
    })
  }
  return getTaskByRunId(db, runId)!
}

export function createRunForPlan(planId: string, runId: string) {
  const db = getDb()
  const runNumber = getNextRunNumber(db, planId)
  createRun(db, {
    id: runId,
    planId,
    runNumber,
    status: 'queued',
    progressText: '等待执行',
  })
  return getTaskByRunId(db, runId)!
}

export function updateTask(
  id: string,
  patch: Partial<Pick<TaskRecord, 'status' | 'progress' | 'progressText' | 'result' | 'startedAt' | 'finishedAt'>>
) {
  updateRun(getDb(), id, patch)
}

export function getTask(id: string): TaskRecord | null {
  return resolveTask(getDb(), id)
}

export function listTasks(limit = 50): TaskRecord[] {
  return listPlanTasks(getDb(), limit)
}

export { type TaskListFilter }

export function getTaskStatusCounts() {
  return getPlanStatusCounts(getDb())
}

export function listTasksPaged(options: {
  status?: TaskListFilter
  page?: number
  pageSize?: number
}) {
  return listPlansPaged(getDb(), options)
}

export function listDispatchTasks(failedLimit = 50) {
  return listDispatchRuns(getDb(), failedLimit)
}

export function saveCheckpoint(checkpoint: TaskCheckpoint) {
  saveRunCheckpoint(getDb(), checkpoint)
}

export function getCheckpoint(taskId: string): TaskCheckpoint | null {
  return getRunCheckpoint(getDb(), taskId)
}

export function deleteCheckpoint(taskId: string) {
  deleteRunCheckpoint(getDb(), taskId)
}

export function resetTaskForRetry(_taskId: string) {
  // deprecated: use createRunForPlan instead
}

export function deleteTask(taskId: string) {
  const db = getDb()
  const asRun = getTaskByRunId(db, taskId)
  if (asRun) {
    deletePlan(db, asRun.planId)
    return
  }
  deletePlan(db, taskId)
}

export function clearAllTaskHistory() {
  clearAllTaskHistoryInDb(getDb())
}

export function listQueuedTasks(limit = 10): TaskRecord[] {
  return listQueuedRuns(getDb(), limit)
}

export function countRunningTasks(): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) as c FROM task_runs WHERE status = 'running'`)
    .get() as { c: number }
  return row.c
}

export function listTasksWithLogs(limit = 30) {
  return listPlansWithRunLogs(getDb(), limit)
}

export function listPlanRuns(planId: string) {
  return listRunsByPlanId(getDb(), planId)
}

export function getExportsByTaskId(taskId: string): ExportRecord[] {
  const db = getDb()
  const task = resolveTask(db, taskId)
  if (task?.runId) return getExportsByRunId(db, task.runId)
  return getExportsByRunId(db, taskId)
}

export function addTaskLog(log: Omit<TaskLogRecord, 'id'>) {
  return addRunLog(getDb(), log)
}

export function getTaskLogs(taskId: string, limit = 200): TaskLogRecord[] {
  return getRunLogs(getDb(), taskId, limit)
}

export function createExportRecord(record: ExportRecord) {
  getDb()
    .prepare(
      `INSERT INTO exports (id, task_id, task_name, type, filename, path, size, created_at)
       VALUES (@id, @taskId, @taskName, @type, @filename, @path, @size, @createdAt)`
    )
    .run({
      id: record.id,
      taskId: record.taskId,
      taskName: record.taskName,
      type: record.type,
      filename: record.filename,
      path: record.path,
      size: record.size,
      createdAt: record.createdAt,
    })
}

export function listExports(limit = 100): ExportRecord[] {
  const rows = getDb()
    .prepare('SELECT * FROM exports ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Record<string, unknown>[]
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

export function getDashboardStats(): DashboardStatsDTO {
  return getDashboardStatsFromRuns(getDb())
}
