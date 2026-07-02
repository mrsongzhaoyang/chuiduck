import fs from 'fs-extra'
import type { BrowserPage } from './browser-page.js'
import { openExtensionTab, sendCdpCommand } from './extension-bridge.js'

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export class ExtensionPage implements BrowserPage {
  constructor(private tabId: string) {}

  setTabId(tabId: string) {
    this.tabId = tabId
  }

  private async cdp(method: string, params: Record<string, unknown> = {}) {
    if (!this.tabId) throw new Error('没有可用的标签页')
    return sendCdpCommand(this.tabId, method, params)
  }

  private async isNavigableTab() {
    if (!this.tabId) return false
    try {
      const currentUrl = await this.evaluate(() => location.href)
      return currentUrl.startsWith('http://') || currentUrl.startsWith('https://')
    } catch {
      return false
    }
  }

  async bringToFront() {
    if (!this.tabId) return
    await this.cdp('Page.bringToFront')
  }

  async goto(url: string, options?: { waitUntil?: string; timeout?: number }) {
    const timeout = options?.timeout || 90000
    const needsNewTab = !(await this.isNavigableTab())
    if (needsNewTab) {
      const newTabId = await openExtensionTab(url)
      this.tabId = newTabId
      await this.waitForLoad(timeout)
      return
    }
    await this.bringToFront()
    await this.cdp('Page.navigate', { url })
    await this.waitForLoad(timeout)
  }

  private async waitForLoad(timeoutMs: number) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const ready = await this.evaluate(() => document.readyState)
      if (ready === 'complete' || ready === 'interactive') {
        await sleep(300)
        return
      }
      await sleep(200)
    }
    throw new Error('页面加载超时')
  }

  async evaluate<T>(pageFunction: (...args: unknown[]) => T, ...args: unknown[]): Promise<T> {
    const fnSource = pageFunction.toString()
    const argList = args.map((a) => JSON.stringify(a)).join(', ')
    const expression = `(function(){ const __fn = ${fnSource}; return __fn(${argList}); })()`

    const result = (await this.cdp('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as {
      result?: { value?: T }
      exceptionDetails?: { text?: string; exception?: { description?: string } }
    }

    if (result.exceptionDetails) {
      const desc =
        result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        '页面脚本执行失败'
      throw new Error(desc)
    }

    return result.result?.value as T
  }

  async waitForSelector(selector: string, options?: { timeout?: number }) {
    const timeout = options?.timeout || 30000
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const found = await this.evaluate((sel) => !!document.querySelector(sel), selector)
      if (found) return
      await sleep(200)
    }
    throw new Error(`等待元素超时: ${selector}`)
  }

  async waitForFunction(
    pageFunction: (...args: unknown[]) => unknown,
    options?: { timeout?: number },
    ...args: unknown[]
  ) {
    const timeout = options?.timeout || 30000
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const ok = await this.evaluate(pageFunction, ...args)
      if (ok) return
      await sleep(200)
    }
    throw new Error('waitForFunction 超时')
  }

  async click(selector: string, options?: { clickCount?: number }) {
    const count = options?.clickCount || 1
    await this.waitForSelector(selector, { timeout: 15000 })
    await this.evaluate(
      (sel, clickCount) => {
        const el = document.querySelector(sel) as HTMLElement | null
        if (!el) throw new Error(`元素不存在: ${sel}`)
        el.scrollIntoView({ block: 'center', inline: 'center' })
        if (clickCount >= 3 && el instanceof HTMLInputElement) {
          el.focus()
          el.select()
        } else {
          el.click()
        }
      },
      selector,
      count
    )
  }

  async type(selector: string, text: string, _options?: { delay?: number }) {
    await this.click(selector, { clickCount: 3 })
    await this.evaluate(
      (sel, value) => {
        const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null
        if (!el) throw new Error(`输入框不存在: ${sel}`)
        el.focus()
        el.value = value
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      },
      selector,
      text
    )
  }

  async $$eval<R>(selector: string, pageFunction: (elements: Element[]) => R): Promise<R> {
    const fnSource = pageFunction.toString()
    return this.evaluate(
      (sel, src) => {
        const els = Array.from(document.querySelectorAll(sel))
        const fn = (0, eval)(`(${src})`)
        return fn(els)
      },
      selector,
      fnSource
    )
  }

  async title() {
    return this.evaluate(() => document.title)
  }

  async url() {
    return this.evaluate(() => location.href)
  }

  async screenshot(options?: { path?: string; fullPage?: boolean }) {
    const result = (await this.cdp('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: !!options?.fullPage,
    })) as { data: string }

    const buffer = Buffer.from(result.data, 'base64')
    if (options?.path) await fs.writeFile(options.path, buffer)
    return buffer
  }
}
