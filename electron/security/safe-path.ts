import path from 'node:path'
import { getPaths } from '../paths.js'
import { getSetting } from '../db/index.js'

/** 仅允许读取应用数据目录内的文件，防止任意文件读取 */
export function isSafeReadablePath(filePath: string) {
  if (!filePath || typeof filePath !== 'string') return false
  if (filePath.includes('\0')) return false

  let normalized: string
  try {
    normalized = path.resolve(filePath)
  } catch {
    return false
  }

  const roots = [
    getPaths().root,
    getPaths().logs,
    getPaths().export,
    getPaths().cache,
    getPaths().download,
  ]
  const exportDir = getSetting('exportDir', '').trim()
  if (exportDir) roots.push(path.resolve(exportDir))

  return roots.some((root) => {
    const resolvedRoot = path.resolve(root)
    return normalized === resolvedRoot || normalized.startsWith(resolvedRoot + path.sep)
  })
}
