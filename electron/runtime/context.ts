import type { BrowserPage } from '../browser/browser-page.js'
import type { WorkflowNode } from '../../shared/types.js'

export class RuntimeContext {
  variables: Record<string, unknown> = {}
  loopStack: unknown[] = []

  constructor(initial?: Record<string, unknown>) {
    if (initial) this.variables = { ...initial }
  }

  resolve(template: string | undefined): string {
    if (!template) return ''
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key: string) => {
      const value = this.getVar(key)
      return value == null ? '' : String(value)
    })
  }

  getVar(key: string): unknown {
    const parts = key.split('.')
    let current: unknown = this.variables
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined
      current = (current as Record<string, unknown>)[part]
    }
    return current
  }

  setVar(key: string, value: unknown) {
    this.variables[key] = value
  }
}

export async function executeNode(page: BrowserPage, ctx: RuntimeContext, node: WorkflowNode) {
  switch (node.type) {
    case 'openPage': {
      const url = ctx.resolve(node.url)
      if (!url) throw new Error('openPage 缺少 url')
      await page.goto(url, { waitUntil: 'load', timeout: 90000 })
      break
    }
    case 'wait': {
      if (node.selector) {
        await page.waitForSelector(node.selector, { timeout: node.ms || 30000 })
      } else {
        await new Promise((r) => setTimeout(r, node.ms || 1000))
      }
      break
    }
    case 'click': {
      const selector = node.selector || node.xpath
      if (!selector) throw new Error('click 缺少 selector')
      if (node.xpath) {
        await page.waitForFunction(
          (xp) => {
            const result = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
            return !!result.singleNodeValue
          },
          { timeout: 15000 },
          node.xpath
        )
        await page.evaluate((xp) => {
          const result = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
          ;(result.singleNodeValue as HTMLElement)?.click()
        }, node.xpath)
      } else {
        await page.click(selector)
      }
      break
    }
    case 'input': {
      const selector = node.selector
      if (!selector) throw new Error('input 缺少 selector')
      const value = ctx.resolve(node.value || node.text)
      await page.click(selector, { clickCount: 3 })
      await page.type(selector, value, { delay: 20 })
      break
    }
    case 'scroll': {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight))
      break
    }
    case 'extract': {
      const varName = node.var || 'data'
      if (node.mode === 'allText') {
        const payload = await page.evaluate(() => {
          const fullText = document.body?.innerText || ''
          const lines = fullText
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean)
          return {
            url: location.href,
            title: document.title,
            fullText,
            lineCount: lines.length,
            lines,
          }
        })
        ctx.setVar(varName, payload)
        break
      }
      if (node.selector) {
        const data = await page.$$eval(node.selector, (els) =>
          els.map((el) => ({
            text: el.textContent?.trim() || '',
            html: el.innerHTML,
          }))
        )
        ctx.setVar(varName, data)
      } else {
        const title = await page.title()
        const url = page.url()
        ctx.setVar(varName, { title, url })
      }
      break
    }
    case 'log':
      break
    default:
      break
  }
}

export function interpolateParams(
  params: Record<string, unknown>,
  defs: { field: string; default?: unknown }[] = []
) {
  const result: Record<string, unknown> = {}
  for (const def of defs) {
    result[def.field] = params[def.field] ?? def.default ?? ''
  }
  for (const [k, v] of Object.entries(params)) {
    if (!(k in result)) result[k] = v
  }
  return result
}
