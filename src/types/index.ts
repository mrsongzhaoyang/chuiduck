export type TaskStatus = 'running' | 'completed' | 'error' | 'queued' | 'paused'

export interface Task {
  id: string
  name: string
  skillPack: string
  action: string
  status: TaskStatus
  progress?: number
  progressText?: string
  result?: string
  lastActive: string
}

export interface SkillPack {
  id: string
  name: string
  platform: string
  version: string
  rating: number
  description: string
  icon: string
  isNew?: boolean
  isInstalled?: boolean
  hasUpdate?: boolean
  actions: SkillAction[]
}

export interface SkillAction {
  id: string
  name: string
  description: string
}

export interface DashboardStats {
  todayRuns: number
  todayRunsChange: number
  success: number
  failure: number
  waiting: number
  runtime: string
  exportExcel: number
  exportImages: number
  exportJson: number
}

export interface BrowserInfo {
  connected: boolean
  account: string
  windows: number
  tabs: number
  windowsList: { id: string; name: string; selected: boolean }[]
}

export interface SkillUpdate {
  id: string
  name: string
  version: string
  time: string
}

export interface LogEntry {
  time: string
  message: string
  level?: 'info' | 'success' | 'warning' | 'error'
}
