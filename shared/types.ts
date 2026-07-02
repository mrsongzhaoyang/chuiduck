/** 技能包与运行时共享类型 */

export type TaskStatus = 'running' | 'completed' | 'error' | 'queued' | 'paused' | 'cancelled'

export interface SkillManifest {
  id: string
  name: string
  version: string
  platform: string
  category?: string
  description: string
  icon?: string
  author?: string
  actions: SkillActionDef[]
}

export interface SkillActionDef {
  id: string
  name: string
  description: string
  workflow: string
  params?: SkillParamDef[]
}

export interface SkillParamDef {
  field: string
  label: string
  type: 'string' | 'number' | 'date' | 'select' | 'boolean'
  default?: unknown
  options?: { label: string; value: string }[]
  required?: boolean
}

export interface WorkflowDef {
  id: string
  name: string
  nodes: WorkflowNode[]
}

export type WorkflowNodeType =
  | 'openPage'
  | 'wait'
  | 'click'
  | 'input'
  | 'scroll'
  | 'extract'
  | 'loop'
  | 'condition'
  | 'export'
  | 'log'

export interface WorkflowNodeBase {
  id: string
  type: WorkflowNodeType
  name?: string
}

export interface WorkflowNode extends WorkflowNodeBase {
  url?: string
  ms?: number
  selector?: string
  xpath?: string
  text?: string
  value?: string
  var?: string
  format?: 'excel' | 'json' | 'csv'
  data?: string
  message?: string
  condition?: string
  trueNext?: string
  falseNext?: string
  items?: string
  body?: WorkflowNode[]
  retry?: number
  waitFor?: 'selector' | 'navigation' | 'networkIdle'
  mode?: 'allText' | 'default'
}

export interface SkillPackInfo {
  id: string
  name: string
  platform: string
  version: string
  category: string
  description: string
  icon: string
  source: 'bundled' | 'installed'
  installPath: string
  isInstalled: boolean
  actions: { id: string; name: string; description: string; params?: SkillParamDef[] }[]
}

export interface TaskRecord {
  id: string
  planId: string
  runId: string
  runNumber: number
  runCount: number
  name: string
  skillId: string
  skillName: string
  actionId: string
  actionName: string
  status: TaskStatus
  progress: number
  progressText: string
  result: string
  params: Record<string, unknown>
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
}

export interface TaskRunRecord {
  id: string
  planId: string
  runNumber: number
  status: TaskStatus
  progress: number
  progressText: string
  result: string
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
}

export interface TaskCheckpoint {
  taskId: string
  nodeIndex: number
  nodeId: string
  variables: Record<string, unknown>
  loopStack: unknown[]
  updatedAt: string
}

export interface TaskLogRecord {
  id: number
  taskId: string
  runId?: string
  nodeId: string
  level: 'info' | 'success' | 'warning' | 'error'
  message: string
  durationMs: number
  createdAt: string
  screenshotPath?: string
  consoleLines?: string[]
}

export interface BrowserStatus {
  connected: boolean
  extensionOnline?: boolean
  bridgePort: number
  bridgeToken?: string
  extensionPath?: string
  clientId?: string
  browserVersion?: string
  account: string
  windows: number
  tabs: number
  windowsList: { id: string; name: string; url: string; selected: boolean }[]
  error?: string
  /** @deprecated 兼容旧 UI */
  cdpDetected?: boolean
  cdpPort?: number
  chromePath?: string
}

export interface ExportRecord {
  id: string
  taskId: string
  taskName: string
  type: string
  filename: string
  path: string
  size: number
  createdAt: string
}

export interface DashboardStatsDTO {
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

export interface TaskRuntimeState {
  taskId: string
  runId: string
  planId: string
  runNumber: number
  status: TaskStatus
  progress: number
  progressText: string
  currentNodeId: string
  currentNodeName: string
  logs: TaskLogRecord[]
  steps: { id: string; name: string; status: 'pending' | 'running' | 'done' | 'error'; durationMs?: number }[]
}

export interface DispatchListDTO {
  active: TaskRecord[]
  failed: TaskRecord[]
  counts: { active: number; failed: number }
}

export interface AppInitData {
  stats: DashboardStatsDTO
  recentTasks: TaskRecord[]
  browser: BrowserStatus
  skills: SkillPackInfo[]
  exports: ExportRecord[]
}
