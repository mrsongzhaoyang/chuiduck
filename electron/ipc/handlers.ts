import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import os from 'node:os'
import fs from 'fs-extra'
import {
  initDatabase,
  closeDatabase,
  getDashboardStats,
  listExports,
  getSetting,
  setSetting,
  getTask,
  listTasksPaged,
  listTasksWithLogs,
  listPlanRuns,
  listDispatchTasks,
  getExportsByTaskId,
  type TaskListFilter,
} from '../db/index.js'
import {
  connectBrowser,
  disconnectBrowser,
  getBrowserStatus,
  restartChromeDriver,
  launchSystemChrome,
  selectWindow,
  setBrowserAccount,
  ensureExtensionBundle,
  getExtensionInstallPath,
  getBridgeInfo,
  restartExtensionBridge,
  startCdpWatcher,
  stopCdpWatcher,
} from '../browser/extension-manager.js'
import { listAllSkills, installSkillFromDirectory, getSkillById } from '../skills/loader.js'
import {
  createAndStartTask,
  createAndQueueTask,
  startTaskExecution,
  pauseTaskById,
  resumeTaskById,
  cancelTaskById,
  deleteTaskById,
  clearAllTaskHistory,
  retryTaskById,
  runPlanAgain,
  getRecentTasks,
  setTaskBroadcast,
} from '../tasks/task-service.js'
import {
  getPlanScheduleView,
  setScheduleBroadcast,
  setScheduleRunPlanHandler,
  startScheduleService,
  stopScheduleService,
  updatePlanScheduleAndReload,
  validateCronExpression,
  computeNextRunAt,
} from '../tasks/schedule-service.js'
import { getRuntimeState, loadRuntimeState, formatLogsForUi } from '../runtime/engine.js'
import { getSystemStats } from '../system/stats.js'
import type { AppInitData } from '../../shared/types.js'
import { DEFAULT_TIMEZONE } from '../../shared/cron-presets.js'
import { ensureAppDirs } from '../paths.js'
import { isSafeReadablePath } from '../security/safe-path.js'

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

async function buildAppInitData(): Promise<AppInitData> {
  const browser = await getBrowserStatus()
  return {
    stats: getDashboardStats(),
    recentTasks: getRecentTasks(20),
    browser,
    skills: await listAllSkills(),
    exports: listExports(50),
  }
}

export async function registerIpcHandlers() {
  await ensureAppDirs()
  await initDatabase()
  await ensureExtensionBundle()

  setTaskBroadcast(broadcast)
  setScheduleBroadcast(broadcast)
  setScheduleRunPlanHandler(async (planId) => {
    try {
      const task = await runPlanAgain(planId)
      return { runId: task.runId, planId: task.planId }
    } catch (err) {
      console.error('[schedule] runPlanAgain failed:', planId, err)
      throw err
    }
  })
  startScheduleService()

  ipcMain.handle('app:getInitData', () => buildAppInitData())
  ipcMain.handle('app:refresh', () => buildAppInitData())

  ipcMain.handle('browser:connect', async () => connectBrowser().then(() => getBrowserStatus()))
  ipcMain.handle('browser:disconnect', async () => {
    await disconnectBrowser()
    return getBrowserStatus()
  })
  ipcMain.handle('browser:status', async () => getBrowserStatus())
  ipcMain.handle('browser:restart', async () => restartChromeDriver())
  ipcMain.handle('browser:launchSystem', async () => launchSystemChrome())
  ipcMain.handle('browser:selectWindow', async (_e, targetId: string) => {
    selectWindow(targetId)
    return getBrowserStatus()
  })
  ipcMain.handle('browser:bridgeInfo', async () => getBridgeInfo())
  ipcMain.handle('browser:openExtensionDir', async () => {
    const dir = getExtensionInstallPath() || (await ensureExtensionBundle())
    shell.openPath(dir)
    return { ok: true, path: dir }
  })
  ipcMain.handle('browser:createShortcut', async () => {
    const path = await ensureExtensionBundle()
    shell.openPath(path)
    return { ok: true, path }
  })
  ipcMain.handle('browser:debugCommand', async () => {
    const info = getBridgeInfo()
    return `配对码: ${info.token}\n插件目录: ${info.extensionPath}`
  })

  startCdpWatcher((status) => {
    broadcast('browser:statusChanged', status)
  })

  ipcMain.handle('skills:list', async () => listAllSkills())
  ipcMain.handle('skills:get', async (_e, skillId: string) => getSkillById(skillId))
  ipcMain.handle('skills:installDialog', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择技能包文件夹',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return installSkillFromDirectory(result.filePaths[0])
  })
  ipcMain.handle('skills:installPath', async (_e, dirPath: string) => installSkillFromDirectory(dirPath))

  ipcMain.handle('tasks:create', async (_e, input) => createAndQueueTask(input))
  ipcMain.handle('tasks:start', async (_e, taskId: string) => startTaskExecution(taskId))
  ipcMain.handle('tasks:createAndStart', async (_e, input) => createAndStartTask(input))
  ipcMain.handle('tasks:updateSchedule', async (_e, planId: string, schedule) => {
    try {
      updatePlanScheduleAndReload(planId, schedule)
      return getTask(planId)
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })
  ipcMain.handle('tasks:getSchedule', async (_e, planId: string) => getPlanScheduleView(planId))
  ipcMain.handle('tasks:validateCron', async (_e, cronExpr: string, timezone?: string) => ({
    valid: validateCronExpression(cronExpr),
    nextRunAt: computeNextRunAt(cronExpr, timezone || DEFAULT_TIMEZONE),
  }))
  ipcMain.handle('tasks:pause', async (_e, taskId: string) => pauseTaskById(taskId))
  ipcMain.handle('tasks:resume', async (_e, taskId: string) => resumeTaskById(taskId))
  ipcMain.handle('tasks:cancel', async (_e, taskId: string) => cancelTaskById(taskId))
  ipcMain.handle('tasks:delete', async (_e, taskId: string) => deleteTaskById(taskId))
  ipcMain.handle('tasks:clearHistory', async () => clearAllTaskHistory())
  ipcMain.handle('tasks:retry', async (_e, planId: string) => runPlanAgain(planId))
  ipcMain.handle('tasks:runPlan', async (_e, planId: string) => runPlanAgain(planId))
  ipcMain.handle('tasks:planRuns', async (_e, planId: string) => listPlanRuns(planId))
  ipcMain.handle('tasks:get', async (_e, taskId: string) => getTask(taskId))
  ipcMain.handle(
    'tasks:list',
    async (
      _e,
      input?: { status?: TaskListFilter; page?: number; pageSize?: number }
    ) => listTasksPaged(input || {})
  )
  ipcMain.handle('tasks:dispatchList', async (_e, failedLimit?: number) =>
    listDispatchTasks(failedLimit ?? 50)
  )
  ipcMain.handle('tasks:runtime', async (_e, taskId: string) => loadRuntimeState(taskId))
  ipcMain.handle('tasks:logs', async (_e, taskId: string) => formatLogsForUi(taskId))
  ipcMain.handle('logs:list', async () => listTasksWithLogs(30))
  ipcMain.handle('logs:readImage', async (_e, filePath: string) => {
    if (!filePath || !(await fs.pathExists(filePath))) return null
    if (!isSafeReadablePath(filePath)) {
      throw new Error('无权读取该路径下的文件')
    }
    const buf = await fs.readFile(filePath)
    return `data:image/png;base64,${buf.toString('base64')}`
  })
  ipcMain.handle('tasks:exports', async (_e, taskId: string) => getExportsByTaskId(taskId))

  ipcMain.handle('system:stats', async () => getSystemStats())

  ipcMain.handle('exports:list', async () => listExports(100))
  ipcMain.handle('exports:openFolder', async (_e, filePath: string) => {
    shell.showItemInFolder(filePath)
  })
  ipcMain.handle('exports:openFile', async (_e, filePath: string) => {
    if (await fs.pathExists(filePath)) shell.openPath(filePath)
  })

  ipcMain.handle('settings:get', async () => ({
    bridgePort: Number(getSetting('bridgePort', '37892')),
    bridgeToken: getSetting('bridgeToken', ''),
    extensionPath: getExtensionInstallPath(),
    autoConnect: getSetting('autoConnect', 'true') === 'true',
    exportDir: getSetting('exportDir', ''),
    maxConcurrent: Number(getSetting('maxConcurrent', '3')),
    retryCount: Number(getSetting('retryCount', '3')),
    browserAccount: getSetting('browserAccount', ''),
    operatorName: getSetting('operatorName', os.userInfo().username || 'Operator'),
  }))

  ipcMain.handle('settings:browseExportDir', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择导出目录',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('settings:save', async (_e, settings: Record<string, unknown>) => {
    const previousPort = Number(getSetting('bridgePort', '37892'))

    if (settings.browserAccount !== undefined) {
      setBrowserAccount(String(settings.browserAccount))
    }
    if (settings.autoConnect !== undefined) setSetting('autoConnect', String(settings.autoConnect))
    if (settings.exportDir !== undefined) setSetting('exportDir', String(settings.exportDir))
    if (settings.maxConcurrent !== undefined) {
      setSetting('maxConcurrent', String(settings.maxConcurrent))
    }
    if (settings.retryCount !== undefined) setSetting('retryCount', String(settings.retryCount))
    if (settings.operatorName !== undefined) setSetting('operatorName', String(settings.operatorName))
    if (settings.bridgePort !== undefined) setSetting('bridgePort', String(settings.bridgePort))

    const nextPort = Number(getSetting('bridgePort', '37892'))
    if (settings.bridgePort !== undefined && nextPort !== previousPort) {
      restartExtensionBridge()
    }

    return {
      ok: true,
      settings: {
        bridgePort: Number(getSetting('bridgePort', '37892')),
        bridgeToken: getSetting('bridgeToken', ''),
        extensionPath: getExtensionInstallPath(),
        autoConnect: getSetting('autoConnect', 'true') === 'true',
        exportDir: getSetting('exportDir', ''),
        maxConcurrent: Number(getSetting('maxConcurrent', '3')),
        retryCount: Number(getSetting('retryCount', '3')),
        browserAccount: getSetting('browserAccount', ''),
        operatorName: getSetting('operatorName', os.userInfo().username || 'Operator'),
      },
    }
  })
}

export function unregisterIpcHandlers() {
  stopScheduleService()
  stopCdpWatcher()
  closeDatabase()
}
