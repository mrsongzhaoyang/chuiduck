import { contextBridge, ipcRenderer } from 'electron'
import type { AppInitData, SkillPackInfo, TaskRecord, BrowserStatus, ExportRecord, TaskRuntimeState } from '../shared/types.js'

const electronAPI = {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  getInitData: (): Promise<AppInitData> => ipcRenderer.invoke('app:getInitData'),
  refresh: (): Promise<AppInitData> => ipcRenderer.invoke('app:refresh'),

  browserConnect: (): Promise<BrowserStatus> => ipcRenderer.invoke('browser:connect'),
  browserDisconnect: (): Promise<BrowserStatus> => ipcRenderer.invoke('browser:disconnect'),
  browserStatus: (): Promise<BrowserStatus> => ipcRenderer.invoke('browser:status'),
  browserRestart: (): Promise<BrowserStatus> => ipcRenderer.invoke('browser:restart'),
  browserLaunchSystem: (): Promise<BrowserStatus> => ipcRenderer.invoke('browser:launchSystem'),
  browserSelectWindow: (targetId: string): Promise<BrowserStatus> =>
    ipcRenderer.invoke('browser:selectWindow', targetId),
  onBrowserStatus: (callback: (status: BrowserStatus) => void) => {
    const listener = (_: unknown, status: BrowserStatus) => callback(status)
    ipcRenderer.on('browser:statusChanged', listener)
    return () => ipcRenderer.removeListener('browser:statusChanged', listener)
  },
  browserCreateShortcut: (): Promise<{ ok: boolean; path: string }> =>
    ipcRenderer.invoke('browser:createShortcut'),
  browserOpenExtensionDir: (): Promise<{ ok: boolean; path: string }> =>
    ipcRenderer.invoke('browser:openExtensionDir'),
  browserBridgeInfo: (): Promise<{ port: number; token: string; extensionPath: string }> =>
    ipcRenderer.invoke('browser:bridgeInfo'),
  browserDebugCommand: (): Promise<string> => ipcRenderer.invoke('browser:debugCommand'),

  skillsList: (): Promise<SkillPackInfo[]> => ipcRenderer.invoke('skills:list'),
  skillsGet: (skillId: string): Promise<SkillPackInfo | null> => ipcRenderer.invoke('skills:get', skillId),
  skillsInstallDialog: (): Promise<SkillPackInfo | null> => ipcRenderer.invoke('skills:installDialog'),

  tasksCreateAndStart: (input: {
    skillId: string
    actionId?: string
    name?: string
    params?: Record<string, unknown>
  }): Promise<TaskRecord> => ipcRenderer.invoke('tasks:createAndStart', input),
  tasksPause: (taskId: string) => ipcRenderer.invoke('tasks:pause', taskId),
  tasksResume: (taskId: string) => ipcRenderer.invoke('tasks:resume', taskId),
  tasksCancel: (taskId: string) => ipcRenderer.invoke('tasks:cancel', taskId),
  tasksDelete: (taskId: string) => ipcRenderer.invoke('tasks:delete', taskId),
  tasksRetry: (planId: string) => ipcRenderer.invoke('tasks:retry', planId),
  tasksRunPlan: (planId: string) => ipcRenderer.invoke('tasks:runPlan', planId),
  tasksPlanRuns: (planId: string) => ipcRenderer.invoke('tasks:planRuns', planId),
  tasksGet: (taskId: string): Promise<TaskRecord | null> => ipcRenderer.invoke('tasks:get', taskId),
  tasksList: (input?: { status?: 'all' | 'running' | 'completed' | 'failed'; page?: number; pageSize?: number }) =>
    ipcRenderer.invoke('tasks:list', input),
  tasksDispatchList: (failedLimit?: number) => ipcRenderer.invoke('tasks:dispatchList', failedLimit),
  tasksRuntime: (taskId: string): Promise<TaskRuntimeState | null> => ipcRenderer.invoke('tasks:runtime', taskId),
  tasksLogs: (taskId: string) => ipcRenderer.invoke('tasks:logs', taskId),
  tasksExports: (taskId: string) => ipcRenderer.invoke('tasks:exports', taskId),
  logsList: () => ipcRenderer.invoke('logs:list'),
  logsReadImage: (filePath: string): Promise<string | null> => ipcRenderer.invoke('logs:readImage', filePath),
  systemStats: () => ipcRenderer.invoke('system:stats'),

  exportsList: (): Promise<ExportRecord[]> => ipcRenderer.invoke('exports:list'),
  exportsOpenFolder: (filePath: string) => ipcRenderer.invoke('exports:openFolder', filePath),
  exportsOpenFile: (filePath: string) => ipcRenderer.invoke('exports:openFile', filePath),

  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsBrowseExportDir: (): Promise<string | null> => ipcRenderer.invoke('settings:browseExportDir'),
  settingsSave: (settings: Record<string, unknown>) => ipcRenderer.invoke('settings:save', settings),

  onTaskProgress: (callback: (state: TaskRuntimeState) => void) => {
    const listener = (_: unknown, state: TaskRuntimeState) => callback(state)
    ipcRenderer.on('task:progress', listener)
    return () => ipcRenderer.removeListener('task:progress', listener)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
