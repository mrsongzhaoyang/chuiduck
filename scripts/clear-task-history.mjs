import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

const dbPath =
  process.argv[2] ||
  join(process.env.APPDATA || '', 'chuiduck', 'ChuiDuck', 'chuiduck.db')

const db = new Database(dbPath)

const count = (sql) => db.prepare(sql).get().c

const before = {
  plans: count('SELECT COUNT(*) as c FROM task_plans'),
  runs: count('SELECT COUNT(*) as c FROM task_runs'),
  logs: count('SELECT COUNT(*) as c FROM task_logs'),
}

const tx = db.transaction(() => {
  db.exec('DELETE FROM task_logs')
  db.exec('DELETE FROM task_checkpoints')
  db.exec('DELETE FROM exports')
  db.exec('DELETE FROM task_runs')
  db.exec('DELETE FROM task_plans')
  const hasLegacy = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'`)
    .get()
  if (hasLegacy) db.exec('DELETE FROM tasks')
})
tx()

const after = {
  plans: count('SELECT COUNT(*) as c FROM task_plans'),
  runs: count('SELECT COUNT(*) as c FROM task_runs'),
  logs: count('SELECT COUNT(*) as c FROM task_logs'),
}

console.log(JSON.stringify({ dbPath, before, after }, null, 2))
db.close()

if (process.versions.electron) {
  const { app } = await import('electron')
  app.quit()
} else {
  process.exit(0)
}
