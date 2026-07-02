import fs from 'fs-extra'
import path from 'node:path'
import type { SkillManifest, SkillActionDef, WorkflowDef, WorkflowNode } from '../../shared/types.js'

export function parseManifest(content: unknown): SkillManifest {
  const m = content as SkillManifest
  if (!m?.id || !m?.name || !m?.version || !Array.isArray(m.actions)) {
    throw new Error('manifest.json 格式无效：缺少 id/name/version/actions')
  }
  return m
}

export async function loadManifestFromDir(skillDir: string): Promise<SkillManifest> {
  const manifestPath = path.join(skillDir, 'manifest.json')
  if (!(await fs.pathExists(manifestPath))) {
    throw new Error(`未找到 manifest.json: ${manifestPath}`)
  }
  const raw = await fs.readJson(manifestPath)
  return parseManifest(raw)
}

export async function loadWorkflow(skillDir: string, action: SkillActionDef): Promise<WorkflowDef> {
  const workflowPath = path.join(skillDir, action.workflow)
  if (!(await fs.pathExists(workflowPath))) {
    throw new Error(`未找到 workflow: ${workflowPath}`)
  }
  const raw = (await fs.readJson(workflowPath)) as WorkflowDef
  if (!raw?.nodes || !Array.isArray(raw.nodes)) {
    throw new Error(`workflow 格式无效: ${workflowPath}`)
  }
  return raw
}

export function getSkillIcon(skillDir: string, manifest: SkillManifest): string {
  if (manifest.icon) {
    const iconPath = path.join(skillDir, manifest.icon)
    if (fs.existsSync(iconPath)) {
      return `file://${iconPath.replace(/\\/g, '/')}`
    }
  }
  const platformIcons: Record<string, string> = {
    Temu: '🛒',
    SHEIN: '👗',
    TikTok: '🎵',
    Shopee: '🏪',
    京东: '📦',
    Lazada: '🎫',
    Demo: '🦆',
  }
  return platformIcons[manifest.platform] || '🎣'
}

export function validateWorkflowNodes(nodes: WorkflowNode[]) {
  const ids = new Set<string>()
  for (const node of nodes) {
    if (!node.id || !node.type) {
      throw new Error('workflow 节点缺少 id 或 type')
    }
    if (ids.has(node.id)) {
      throw new Error(`workflow 节点 id 重复: ${node.id}`)
    }
    ids.add(node.id)
  }
}
