import fs from 'fs-extra'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { v4 as uuidv4 } from 'uuid'
import type { ExportRecord } from '../../shared/types.js'
import { getPaths } from '../paths.js'
import { createExportRecord, getSetting } from '../db/index.js'

export function getExportDir() {
  const custom = getSetting('exportDir', '').trim()
  if (custom) return custom
  return getPaths().export
}

function escapeCsvField(value: unknown): string {
  const str = value == null ? '' : String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

async function ensureExportDir() {
  const exportDir = getExportDir()
  await fs.ensureDir(exportDir)
  return exportDir
}

export async function exportToExcel(
  taskId: string,
  taskName: string,
  filename: string,
  rows: Record<string, unknown>[]
): Promise<ExportRecord> {
  const exportDir = await ensureExportDir()

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Data')

  if (rows.length > 0) {
    const columns = Object.keys(rows[0]).map((key) => ({ header: key, key, width: 20 }))
    sheet.columns = columns
    sheet.addRows(rows)
  }

  const safeName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  const filePath = path.join(exportDir, safeName)
  await workbook.xlsx.writeFile(filePath)

  const stat = await fs.stat(filePath)
  const record: ExportRecord = {
    id: uuidv4(),
    taskId,
    taskName,
    type: 'excel',
    filename: safeName,
    path: filePath,
    size: stat.size,
    createdAt: new Date().toISOString(),
  }
  createExportRecord(record)
  return record
}

export async function exportToJson(
  taskId: string,
  taskName: string,
  filename: string,
  data: unknown
): Promise<ExportRecord> {
  const exportDir = await ensureExportDir()

  const safeName = filename.endsWith('.json') ? filename : `${filename}.json`
  const filePath = path.join(exportDir, safeName)
  await fs.writeJson(filePath, data, { spaces: 2 })

  const stat = await fs.stat(filePath)
  const record: ExportRecord = {
    id: uuidv4(),
    taskId,
    taskName,
    type: 'json',
    filename: safeName,
    path: filePath,
    size: stat.size,
    createdAt: new Date().toISOString(),
  }
  createExportRecord(record)
  return record
}

export async function exportToCsv(
  taskId: string,
  taskName: string,
  filename: string,
  rows: Record<string, unknown>[]
): Promise<ExportRecord> {
  const exportDir = await ensureExportDir()

  const safeName = filename.endsWith('.csv') ? filename : `${filename}.csv`
  const filePath = path.join(exportDir, safeName)

  if (rows.length === 0) {
    await fs.writeFile(filePath, '')
  } else {
    const headers = Object.keys(rows[0])
    const lines = [
      headers.map(escapeCsvField).join(','),
      ...rows.map((row) => headers.map((h) => escapeCsvField(row[h])).join(',')),
    ]
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8')
  }

  const stat = await fs.stat(filePath)
  const record: ExportRecord = {
    id: uuidv4(),
    taskId,
    taskName,
    type: 'csv',
    filename: safeName,
    path: filePath,
    size: stat.size,
    createdAt: new Date().toISOString(),
  }
  createExportRecord(record)
  return record
}
