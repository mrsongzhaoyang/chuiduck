import os from 'node:os'

export function getSystemStats() {
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem
  const cpuCount = os.cpus().length || 1
  const load = os.loadavg()[0] || 0
  const cpu = Math.min(100, Math.round((load / cpuCount) * 100))

  return {
    cpu: cpu || Math.round(process.cpuUsage().system / 1000000) % 100,
    memoryUsed: Math.round((usedMem / 1024 / 1024 / 1024) * 10) / 10,
    memoryTotal: Math.round((totalMem / 1024 / 1024 / 1024) * 10) / 10,
  }
}
