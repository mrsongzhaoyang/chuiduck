export type CronPreset = {
  id: string
  label: string
  cron: string
  description: string
}

export const CRON_PRESETS: CronPreset[] = [
  { id: 'every30m', label: '每 30 分钟', cron: '*/30 * * * *', description: '每 30 分钟执行一次' },
  { id: 'hourly', label: '每小时', cron: '0 * * * *', description: '每小时整点执行' },
  { id: 'daily9', label: '每天 09:00', cron: '0 9 * * *', description: '每天上午 9 点' },
  { id: 'daily18', label: '每天 18:00', cron: '0 18 * * *', description: '每天下午 6 点' },
  { id: 'weekday9', label: '工作日 09:00', cron: '0 9 * * 1-5', description: '周一至周五 9 点' },
  { id: 'custom', label: '自定义 Cron', cron: '', description: '标准 5 段 cron 表达式' },
]

export const DEFAULT_TIMEZONE = 'Asia/Shanghai'

export function describeCron(cron: string) {
  const preset = CRON_PRESETS.find((p) => p.cron === cron && p.id !== 'custom')
  return preset?.description || cron
}
