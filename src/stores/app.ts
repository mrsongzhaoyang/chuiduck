import { defineStore } from 'pinia'

import { ref, computed } from 'vue'

import { getElectronAPI, isElectron } from '@/api/electron'

import type { SkillPackInfo, TaskRecord, BrowserStatus, ExportRecord, DashboardStatsDTO } from '../../shared/types'



function formatRelativeTime(iso: string) {

  const diff = Date.now() - new Date(iso).getTime()

  const mins = Math.floor(diff / 60000)

  if (mins < 1) return '刚刚'

  if (mins < 60) return `${mins} 分钟前`

  const hours = Math.floor(mins / 60)

  if (hours < 24) return `${hours} 小时前`

  return `${Math.floor(hours / 24)} 天前`

}



function mapTaskForUi(task: TaskRecord) {
  return {
    id: task.id,
    planId: task.planId,
    runId: task.runId,
    runNumber: task.runNumber,
    runCount: task.runCount,
    name: task.name,
    skillPack: task.skillName,
    action: task.actionName,
    status: task.status,
    progress: task.progress,
    progressText: task.progressText,
    result: task.result,
    lastActive: formatRelativeTime(task.updatedAt),
    raw: task,
  }
}



export type GlobalSearchResult = {

  type: 'skill' | 'task' | 'export'

  id: string

  title: string

  subtitle: string

  path: string

}



export const useAppStore = defineStore('app', () => {

  const isDesktop = ref(isElectron())

  const loading = ref(false)

  const systemStatus = ref<'optimal' | 'warning' | 'error'>('optimal')

  const searchQuery = ref('')

  const operatorName = ref('')



  const stats = ref<DashboardStatsDTO>({

    todayRuns: 0,

    todayRunsChange: 0,

    success: 0,

    failure: 0,

    waiting: 0,

    runtime: '0m',

    exportExcel: 0,

    exportImages: 0,

    exportJson: 0,

  })



  const recentTasks = ref<ReturnType<typeof mapTaskForUi>[]>([])

  const browserInfo = ref<BrowserStatus>({
    connected: false,
    extensionOnline: false,
    bridgePort: 37892,
    account: '',
    windows: 0,
    tabs: 0,
    windowsList: [],
  })

  const skillPacks = ref<SkillPackInfo[]>([])

  const exports = ref<ExportRecord[]>([])



  const successRate = computed(() => {

    const total = stats.value.success + stats.value.failure

    return total > 0 ? Math.round((stats.value.success / total) * 100) : 0

  })



  const globalSearchResults = computed((): GlobalSearchResult[] => {

    const q = searchQuery.value.trim().toLowerCase()

    if (!q) return []



    const results: GlobalSearchResult[] = []



    for (const skill of skillPacks.value) {

      if (

        skill.name.toLowerCase().includes(q) ||

        skill.platform.toLowerCase().includes(q) ||

        skill.description.toLowerCase().includes(q)

      ) {

        results.push({

          type: 'skill',

          id: skill.id,

          title: skill.name,

          subtitle: `${skill.platform} · v${skill.version}`,

          path: `/fishpond/${skill.id}`,

        })

      }

    }



    for (const task of recentTasks.value) {

      if (

        task.name.toLowerCase().includes(q) ||

        task.skillPack.toLowerCase().includes(q) ||

        task.action.toLowerCase().includes(q)

      ) {

        results.push({

          type: 'task',

          id: task.id,

          title: task.name,

          subtitle: `${task.skillPack} · ${task.status}`,

          path: `/tasks/${task.runId || task.id}/running`,

        })

      }

    }



    for (const item of exports.value) {

      if (

        item.filename.toLowerCase().includes(q) ||

        item.taskName.toLowerCase().includes(q) ||

        item.type.toLowerCase().includes(q)

      ) {

        results.push({

          type: 'export',

          id: item.id,

          title: item.filename,

          subtitle: `${item.taskName} · ${item.type.toUpperCase()}`,

          path: '/export',

        })

      }

    }



    return results.slice(0, 12)

  })



  async function loadOperatorName() {

    const api = getElectronAPI()

    if (!api) return

    const data = await api.settingsGet()

    operatorName.value = String(data.operatorName || '')

  }



  async function loadInitData() {

    const api = getElectronAPI()

    if (!api) return



    loading.value = true

    try {

      const [data] = await Promise.all([api.getInitData(), loadOperatorName()])

      stats.value = data.stats

      recentTasks.value = data.recentTasks.map(mapTaskForUi)

      browserInfo.value = data.browser

      skillPacks.value = data.skills

      exports.value = data.exports

      systemStatus.value = data.browser.connected ? 'optimal' : 'warning'

    } finally {

      loading.value = false

    }

  }



  async function refresh() {

    const api = getElectronAPI()

    if (!api) return

    const data = await api.refresh()

    stats.value = data.stats

    recentTasks.value = data.recentTasks.map(mapTaskForUi)

    browserInfo.value = data.browser

    skillPacks.value = data.skills

    exports.value = data.exports

    systemStatus.value = data.browser.connected ? 'optimal' : 'warning'

  }



  async function installSkillDialog() {

    const api = getElectronAPI()

    if (!api) return null

    const skill = await api.skillsInstallDialog()

    if (skill) await refresh()

    return skill

  }



  async function connectBrowser() {

    const api = getElectronAPI()

    if (!api) return

    browserInfo.value = await api.browserConnect()

    systemStatus.value = browserInfo.value.connected ? 'optimal' : 'warning'

  }



  async function restartBrowser() {

    const api = getElectronAPI()

    if (!api) return

    browserInfo.value = await api.browserRestart()

  }



  async function launchSystemBrowser() {

    const api = getElectronAPI()

    if (!api) return

    browserInfo.value = await api.browserLaunchSystem()

    systemStatus.value = browserInfo.value.connected ? 'optimal' : 'warning'

  }



  async function selectBrowserWindow(targetId: string) {

    const api = getElectronAPI()

    if (!api) return

    browserInfo.value = await api.browserSelectWindow(targetId)

  }



  async function createBrowserShortcut() {

    const api = getElectronAPI()

    if (!api) throw new Error('请在 Electron 桌面版中操作')

    return api.browserCreateShortcut()

  }



  function subscribeBrowserStatus() {

    const api = getElectronAPI()

    if (!api) return () => {}

    return api.onBrowserStatus((status) => {

      browserInfo.value = status

      systemStatus.value = status.connected ? 'optimal' : status.extensionOnline ? 'warning' : 'warning'

    })

  }



  async function startTask(input: {

    skillId: string

    actionId?: string

    name?: string

    params?: Record<string, unknown>

  }) {

    const api = getElectronAPI()

    if (!api) throw new Error('请在 Electron 桌面版中运行任务')

    const task = await api.tasksCreateAndStart(input)

    await refresh()

    return task

  }



  async function pauseTask(taskId: string) {

    const api = getElectronAPI()

    if (!api) return

    await api.tasksPause(taskId)

    await refresh()

  }



  async function resumeTask(taskId: string) {

    const api = getElectronAPI()

    if (!api) return

    await api.tasksResume(taskId)

    await refresh()

  }



  async function deleteTask(taskId: string) {

    const api = getElectronAPI()

    if (!api) return

    await api.tasksDelete(taskId)

    await refresh()

  }



  async function retryTask(taskId: string) {

    const api = getElectronAPI()

    if (!api) return

    const task = await api.tasksRetry(taskId)

    await refresh()

    return task

  }



  async function openTaskExportFolder(taskId: string) {

    const api = getElectronAPI()

    if (!api) return

    const exports = await api.tasksExports(taskId)

    if (exports[0]?.path) {

      await api.exportsOpenFolder(exports[0].path)

    }

  }



  return {

    isDesktop,

    loading,

    systemStatus,

    searchQuery,

    operatorName,

    stats,

    recentTasks,

    browserInfo,

    skillPacks,

    exports,

    successRate,

    globalSearchResults,

    loadInitData,

    loadOperatorName,

    refresh,

    installSkillDialog,

    connectBrowser,

    restartBrowser,

    launchSystemBrowser,

    selectBrowserWindow,

    createBrowserShortcut,

    subscribeBrowserStatus,

    startTask,

    pauseTask,

    resumeTask,

    deleteTask,

    retryTask,

    openTaskExportFolder,

    mapTaskForUi,

  }

})

