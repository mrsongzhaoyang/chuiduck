import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron/simple'
import { resolve } from 'path'

const nativeExternal = [
  'electron',
  'better-sqlite3',
  'bindings',
  'fs-extra',
  'exceljs',
  'uuid',
  'ws',
]

function externalNativeModules(): Plugin {
  return {
    name: 'external-native-modules',
    resolveId(source) {
      if (nativeExternal.includes(source)) {
        return { id: source, external: true }
      }
    },
  }
}

/** Electron 桌面模式（需先安装 Electron 二进制） */
export default defineConfig({
  plugins: [
    vue(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          plugins: [externalNativeModules()],
          build: {
            rollupOptions: { external: nativeExternal },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
