/** 浏览器页面抽象，供工作流引擎调用（插件 CDP 驱动实现） */
export interface BrowserPage {
  bringToFront(): Promise<void>
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<void>
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<void>
  waitForFunction(
    pageFunction: (...args: unknown[]) => unknown,
    options?: { timeout?: number },
    ...args: unknown[]
  ): Promise<void>
  evaluate<T>(pageFunction: (...args: unknown[]) => T, ...args: unknown[]): Promise<T>
  click(selector: string, options?: { clickCount?: number }): Promise<void>
  type(selector: string, text: string, options?: { delay?: number }): Promise<void>
  $$eval<R>(selector: string, pageFunction: (elements: Element[]) => R): Promise<R>
  title(): Promise<string>
  url(): Promise<string>
  screenshot(options?: { path?: string; fullPage?: boolean }): Promise<Buffer>
}
