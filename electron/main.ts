import './polyfill.js'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { registerIpcHandlers, unregisterIpcHandlers } from './ipc/handlers.js'
import { getBrowserStatus } from './browser/extension-manager.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 960,
    minHeight: 600,
    center: true,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#141820',
    webPreferences: {
      preload: join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    const url = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173'
    win.loadURL(url)
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  return win
}

app.whenReady().then(async () => {
  await registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  unregisterIpcHandlers()
})

ipcMain.handle('window:minimize', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.minimize()
})

ipcMain.handle('window:maximize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (win?.isMaximized()) win.unmaximize()
  else win?.maximize()
})

ipcMain.handle('window:close', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close()
})
