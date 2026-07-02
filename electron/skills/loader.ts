import fs from 'fs-extra'
import path from 'node:path'
import type { SkillPackInfo } from '../../shared/types.js'
import { getPaths } from '../paths.js'
import { getInstalledSkills } from '../db/index.js'
import { getSkillIcon, loadManifestFromDir } from './manifest.js'

type SkillsCache = {
  skills: SkillPackInfo[]
  byId: Map<string, SkillPackInfo>
  signature: string
}

let cache: SkillsCache | null = null

async function dirSignature(baseDir: string) {
  if (!(await fs.pathExists(baseDir))) return ''
  const entries = await fs.readdir(baseDir)
  const parts: string[] = []
  for (const entry of entries.sort()) {
    const full = path.join(baseDir, entry)
    try {
      const stat = await fs.stat(full)
      if (stat.isDirectory()) parts.push(`${entry}:${stat.mtimeMs}`)
    } catch {
      /* ignore */
    }
  }
  return parts.join('|')
}

async function buildCacheSignature() {
  const paths = getPaths()
  const bundledSig = await dirSignature(paths.bundledSkills)
  const installedSig = await dirSignature(paths.skillsInstalled)
  const installedDb = getInstalledSkills()
    .map((r) => `${r.id}@${r.version}:${r.installPath}`)
    .sort()
    .join('|')
  return `${bundledSig}::${installedSig}::${installedDb}`
}

async function loadSkillFromDir(dir: string, source: 'bundled' | 'installed'): Promise<SkillPackInfo | null> {
  try {
    const manifest = await loadManifestFromDir(dir)
    const installedRecords = getInstalledSkills()
    const isInstalled =
      source === 'bundled' ||
      source === 'installed' ||
      installedRecords.some((r) => r.id === manifest.id && r.version === manifest.version)

    return {
      id: manifest.id,
      name: manifest.name,
      platform: manifest.platform,
      version: manifest.version,
      category: manifest.category || 'ecommerce',
      description: manifest.description,
      icon: getSkillIcon(dir, manifest),
      source,
      installPath: dir,
      isInstalled,
      actions: manifest.actions.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        params: a.params,
      })),
    }
  } catch (err) {
    console.warn('[skills] skip', dir, err)
    return null
  }
}

async function scanSkillsDir(baseDir: string, source: 'bundled' | 'installed') {
  if (!(await fs.pathExists(baseDir))) return [] as SkillPackInfo[]
  const entries = await fs.readdir(baseDir)
  const skills: SkillPackInfo[] = []
  for (const entry of entries) {
    const full = path.join(baseDir, entry)
    const stat = await fs.stat(full)
    if (!stat.isDirectory()) continue
    const skill = await loadSkillFromDir(full, source)
    if (skill) skills.push(skill)
  }
  return skills
}

async function rebuildSkillsCache(): Promise<SkillsCache> {
  const paths = getPaths()
  const bundled = await scanSkillsDir(paths.bundledSkills, 'bundled')
  const installed = await scanSkillsDir(paths.skillsInstalled, 'installed')

  const map = new Map<string, SkillPackInfo>()
  for (const skill of bundled) {
    map.set(`${skill.id}@${skill.version}`, skill)
  }
  for (const skill of installed) {
    map.set(`${skill.id}@${skill.version}`, { ...skill, isInstalled: true })
  }

  const skills = Array.from(map.values()).sort((a, b) => a.platform.localeCompare(b.platform))
  const byId = new Map<string, SkillPackInfo>()
  for (const skill of skills) {
    byId.set(skill.id, skill)
  }

  cache = {
    skills,
    byId,
    signature: await buildCacheSignature(),
  }
  return cache
}

async function ensureSkillsCache() {
  const signature = await buildCacheSignature()
  if (cache && cache.signature === signature) return cache
  return rebuildSkillsCache()
}

export function invalidateSkillsCache() {
  cache = null
}

export async function listAllSkills(): Promise<SkillPackInfo[]> {
  const current = await ensureSkillsCache()
  return current.skills
}

export async function getSkillById(skillId: string): Promise<SkillPackInfo | null> {
  const current = await ensureSkillsCache()
  return current.byId.get(skillId) || null
}

export async function installSkillFromDirectory(sourceDir: string): Promise<SkillPackInfo> {
  const manifest = await loadManifestFromDir(sourceDir)
  const paths = getPaths()
  const targetDir = path.join(paths.skillsInstalled, `${manifest.id}-${manifest.version}`)

  await fs.ensureDir(paths.skillsInstalled)
  await fs.copy(sourceDir, targetDir, { overwrite: true })

  const { recordInstalledSkill } = await import('../db/index.js')
  recordInstalledSkill(manifest.id, manifest.version, targetDir)

  invalidateSkillsCache()
  const skill = await loadSkillFromDir(targetDir, 'installed')
  if (!skill) throw new Error('安装后加载技能包失败')
  return { ...skill, isInstalled: true }
}
