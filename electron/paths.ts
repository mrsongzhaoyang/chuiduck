import { app } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs-extra'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function getUserDataRoot() {
  return join(app.getPath('userData'), 'ChuiDuck')
}

export function getBundledSkillsDir() {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'skills')
  }
  const candidates = [
    join(app.getAppPath(), 'skills'),
    join(process.cwd(), 'skills'),
    join(__dirname, '../../skills'),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  return join(process.cwd(), 'skills')
}

export function getPaths() {
  const root = getUserDataRoot()
  return {
    root,
    db: join(root, 'chuiduck.db'),
    skillsInstalled: join(root, 'skills', 'installed'),
    bundledSkills: getBundledSkillsDir(),
    export: join(root, 'export'),
    download: join(root, 'download'),
    cache: join(root, 'cache'),
    logs: join(root, 'logs'),
    chromeProfile: join(root, 'chrome-profile'),
  }
}

export async function ensureAppDirs() {
  const p = getPaths()
  await Promise.all([
    fs.ensureDir(p.root),
    fs.ensureDir(p.skillsInstalled),
    fs.ensureDir(p.export),
    fs.ensureDir(p.download),
    fs.ensureDir(p.cache),
    fs.ensureDir(p.logs),
    fs.ensureDir(p.chromeProfile),
  ])
  return p
}

export function resolveDevPath(...segments: string[]) {
  return join(dirname(__dirname), ...segments)
}
