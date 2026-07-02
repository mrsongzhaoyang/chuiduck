<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { NButton, NTag, NIcon } from 'naive-ui'
import { FolderOpenOutline, DownloadOutline } from '@vicons/ionicons5'
import { getElectronAPI } from '@/api/electron'

const appStore = useAppStore()

const exports = computed(() => {
  const q = appStore.searchQuery.trim().toLowerCase()
  if (!q) return appStore.exports
  return appStore.exports.filter(
    (item) =>
      item.filename.toLowerCase().includes(q) ||
      item.taskName.toLowerCase().includes(q) ||
      item.type.toLowerCase().includes(q)
  )
})

const typeIcons: Record<string, string> = {
  excel: '📊',
  json: '📋',
  csv: '📄',
  image: '🖼️',
  zip: '📦',
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN')
}

async function openFolder(path: string) {
  await getElectronAPI()?.exportsOpenFolder(path)
}

async function openFile(path: string) {
  await getElectronAPI()?.exportsOpenFile(path)
}
</script>

<template>
  <div class="export-center">
    <h2 class="page-title">导出中心</h2>
    <p class="page-desc">所有任务的导出文件统一管理 · 共 {{ exports.length }} 个文件</p>

    <div v-if="exports.length === 0" class="empty">暂无导出文件，运行任务后会出现在这里</div>

    <div class="export-list">
      <div v-for="item in exports" :key="item.id" class="export-item card">
        <span class="export-icon">{{ typeIcons[item.type] || '📁' }}</span>
        <div class="export-info">
          <span class="export-file">{{ item.filename }}</span>
          <span class="export-meta">{{ item.taskName }} · {{ formatSize(item.size) }} · {{ formatTime(item.createdAt) }}</span>
        </div>
        <NTag size="small" round>{{ item.type.toUpperCase() }}</NTag>
        <div class="export-actions">
          <NButton quaternary circle size="small" title="打开文件" @click="openFile(item.path)">
            <template #icon><NIcon><DownloadOutline /></NIcon></template>
          </NButton>
          <NButton quaternary circle size="small" title="打开目录" @click="openFolder(item.path)">
            <template #icon><NIcon><FolderOpenOutline /></NIcon></template>
          </NButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: -12px;
  margin-bottom: 20px;
}

.empty {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
}

.export-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.export-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  padding: 14px 18px;
}

@media (max-width: 700px) {
  .export-actions {
    width: 100%;
    justify-content: flex-end;
  }
}

.export-icon {
  font-size: 24px;
}

.export-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.export-file {
  font-size: 14px;
  font-weight: 500;
}

.export-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.export-actions {
  display: flex;
  gap: 4px;
}
</style>
