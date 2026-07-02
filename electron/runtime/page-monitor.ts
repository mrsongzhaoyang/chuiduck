import { join } from 'node:path'
import fs from 'fs-extra'
import type { BrowserPage } from '../browser/browser-page.js'
import { getPaths } from '../paths.js'

const taskConsoleBuffers = new Map<string, string[]>()

export function attachPageConsole(taskId: string, _page: BrowserPage) {
  clearPageConsole(taskId)
  const buffer: string[] = []
  taskConsoleBuffers.set(taskId, buffer)
  // 控制台日志由插件侧扩展，当前保留缓冲结构
}

export function attachPageConsoleLegacy(taskId: string, page: BrowserPage) {
  attachPageConsole(taskId, page)
}

export function getTaskConsoleLines(taskId: string) {
  return [...(taskConsoleBuffers.get(taskId) || [])]
}

export function clearPageConsole(taskId: string) {
  taskConsoleBuffers.delete(taskId)
}

export async function captureFailureScreenshot(taskId: string, page: BrowserPage | null) {
  if (!page) return ''
  try {
    const { logs } = getPaths()
    const dir = join(logs, 'screenshots')
    await fs.ensureDir(dir)
    const filePath = join(dir, `${taskId}-${Date.now()}.png`)
    await page.screenshot({ path: filePath, fullPage: false })
    return filePath
  } catch {
    return ''
  }
}

export function cleanupTaskMonitor(taskId: string) {
  taskConsoleBuffers.delete(taskId)
}
