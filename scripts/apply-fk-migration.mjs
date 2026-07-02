import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

const dbPath = join(process.env.APPDATA || '', 'chuiduck', 'ChuiDuck', 'chuiduck.db')
const db = new Database(dbPath)

function fkTarget(table) {
  return db.pragma(`foreign_key_list(${table})`).map((fk) => fk.table)
}

console.log('task_logs FK ->', fkTarget('task_logs'))
console.log('task_checkpoints FK ->', fkTarget('task_checkpoints'))

// Inline migration (same as task-plans.ts)
function tableFkReferences(table, refTable) {
  return fkTarget(table).includes(refTable)
}

if (tableFkReferences('task_logs', 'tasks') || tableFkReferences('task_checkpoints', 'tasks')) {
  db.pragma('foreign_keys = OFF')

  if (tableFkReferences('task_logs', 'tasks')) {
    const columns = db.prepare(`PRAGMA table_info(task_logs)`).all()
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
      INSERT INTO task_logs_new (id, task_id, node_id, level, message, duration_ms, created_at, screenshot_path, console_json)
      SELECT l.id, l.task_id, l.node_id, l.level, l.message, l.duration_ms, l.created_at, ${screenshotCol}, ${consoleCol}
      FROM task_logs l WHERE l.task_id IN (SELECT id FROM task_runs);
      DROP TABLE task_logs;
      ALTER TABLE task_logs_new RENAME TO task_logs;
    `)
  }

  if (tableFkReferences('task_checkpoints', 'tasks')) {
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
      INSERT INTO task_checkpoints_new SELECT * FROM task_checkpoints WHERE task_id IN (SELECT id FROM task_runs);
      DROP TABLE task_checkpoints;
      ALTER TABLE task_checkpoints_new RENAME TO task_checkpoints;
    `)
  }

  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('task_fk_v2', '1')").run()
  db.pragma('foreign_keys = ON')
  console.log('Migration applied.')
} else {
  console.log('Already migrated or no migration needed.')
}

console.log('After: task_logs FK ->', fkTarget('task_logs'))
console.log('After: task_checkpoints FK ->', fkTarget('task_checkpoints'))

// Test insert with a fake run if any run exists
const run = db.prepare('SELECT id FROM task_runs LIMIT 1').get()
if (run) {
  try {
    db.prepare(
      `INSERT INTO task_logs (task_id, node_id, level, message, duration_ms, created_at) VALUES (?, '', 'info', 'test', 0, datetime('now'))`
    ).run(run.id)
    db.prepare('DELETE FROM task_logs WHERE message = ?').run('test')
    console.log('Insert test: OK')
  } catch (e) {
    console.log('Insert test: FAIL', e.message)
  }
} else {
  console.log('No runs to test insert')
}

db.close()

if (process.versions.electron) {
  const { app } = await import('electron')
  app.quit()
}
