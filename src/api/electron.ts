import type {
  AppInitData,
  SkillPackInfo,
  TaskRecord,
  BrowserStatus,
  ExportRecord,
  TaskRuntimeState,
} from '../../shared/types.js'

export interface ElectronAPI {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
  getInitData: () => Promise<AppInitData>
  refresh: () => Promise<AppInitData>
  browserConnect: () => Promise<BrowserStatus>
  browserDisconnect: () => Promise<BrowserStatus>
  browserStatus: () => Promise<BrowserStatus>
  browserRestart: () => Promise<BrowserStatus>
  browserLaunchSystem: () => Promise<BrowserStatus>
  browserSelectWindow: (targetId: string) => Promise<BrowserStatus>
  browserCreateShortcut: () => Promise<{ ok: boolean; path: string }>
  browserOpenExtensionDir: () => Promise<{ ok: boolean; path: string }>
  browserBridgeInfo: () => Promise<{ port: number; token: string; extensionPath: string }>
  browserDebugCommand: () => Promise<string>
  skillsList: () => Promise<SkillPackInfo[]>
  skillsGet: (skillId: string) => Promise<SkillPackInfo | null>
  skillsInstallDialog: () => Promise<SkillPackInfo | null>
  tasksCreateAndStart: (input: {
    skillId: string
    actionId?: string
    name?: string
    params?: Record<string, unknown>
  }) => Promise<TaskRecord>
  tasksPause: (taskId: string) => Promise<TaskRecord | undefined>
  tasksResume: (taskId: string) => Promise<TaskRecord | undefined>
  tasksCancel: (taskId: string) => Promise<TaskRecord | undefined>
  tasksDelete: (taskId: string) => Promise<{ ok: boolean }>
  tasksRetry: (planId: string) => Promise<TaskRecord>
  tasksRunPlan: (planId: string) => Promise<TaskRecord>
  tasksPlanRuns: (planId: string) => Promise<import('../../shared/types.js').TaskRunRecord[]>
  tasksGet: (taskId: string) => Promise<TaskRecord | null>
  tasksList: (input?: {
    status?: 'all' | 'running' | 'completed' | 'failed'
    page?: number
    pageSize?: number
  }) => Promise<{
    items: TaskRecord[]
    total: number
    page: number
    pageSize: number
    counts: { all: number; running: number; completed: number; failed: number }
  }>
  tasksDispatchList: (failedLimit?: number) => Promise<import('../../shared/types.js').DispatchListDTO>
  tasksRuntime: (taskId: string) => Promise<TaskRuntimeState | null>
  tasksLogs: (taskId: string) => Promise<{ time: string; message: string; level?: string; nodeId?: string; durationMs?: number; screenshotPath?: string; consoleLines?: string[] }[]>
  tasksExports: (taskId: string) => Promise<import('../../shared/types.js').ExportRecord[]>
  logsList: () => Promise<
    {
      task: TaskRecord
      runs: {
        run: import('../../shared/types.js').TaskRunRecord
        logs: { id: number; taskId: string; nodeId: string; level: string; message: string; durationMs: number; createdAt: string; screenshotPath?: string; consoleLines?: string[] }[]
      }[]
    }[]
  >
  logsReadImage: (filePath: string) => Promise<string | null>
  systemStats: () => Promise<{ cpu: number; memoryUsed: number; memoryTotal: number }>
  exportsList: () => Promise<ExportRecord[]>
  exportsOpenFolder: (filePath: string) => Promise<void>
  exportsOpenFile: (filePath: string) => Promise<void>
  settingsGet: () => Promise<Record<string, unknown>>
  settingsBrowseExportDir: () => Promise<string | null>
  settingsSave: (settings: Record<string, unknown>) => Promise<{ ok: boolean; settings: Record<string, unknown> }>
  onTaskProgress: (callback: (state: TaskRuntimeState) => void) => () => void
  onBrowserStatus: (callback: (status: BrowserStatus) => void) => () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export function isElectron() {
  return typeof window !== 'undefined' && !!window.electronAPI
}

export function getElectronAPI(): ElectronAPI | null {
  return window.electronAPI ?? null
}
