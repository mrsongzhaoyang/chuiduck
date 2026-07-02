# 垂钓鸭 ChuiDuck

在网页世界垂钓数据的本地化自动化平台。

垂钓鸭是一款面向网页数据采集与自动化的桌面应用，将「选技能包 → 建任务 → 自动执行 → 导出结果」串成完整链路，让非技术人员也能在熟悉的 Chrome 浏览器里完成重复性网页操作。

## 特性

- **Chrome 插件驱动**：正常打开 Chrome 即可，无需调试模式，登录态完整保留
- **技能包架构**：内置操作流程与默认参数，选技能包 + 命名即可运行
- **任务与调度**：任务中心管理方案与历史，调度中心聚焦运行中与报错任务
- **本地数据**：SQLite 存储任务记录，执行过程可追踪、可回溯
- **多格式导出**：支持 Excel、JSON、CSV 等

## 技术栈

- Electron + Vue 3 + TypeScript
- Naive UI
- SQLite (better-sqlite3)
- Chrome Extension + WebSocket 桥接

## 开发

```bash
npm install
npm run dev:electron
```

## 构建

```bash
npm run build:electron
npm run pack:win
```

## 许可证

[MIT](LICENSE)
