<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { getElectronAPI } from '@/api/electron'

const appStore = useAppStore()
let unsubProgress: (() => void) | undefined
let unsubBrowser: (() => void) | undefined
let refreshTimer: ReturnType<typeof setInterval> | undefined

onMounted(async () => {
  await appStore.loadInitData()

  const api = getElectronAPI()
  if (api) {
    unsubBrowser = appStore.subscribeBrowserStatus()
    unsubProgress = api.onTaskProgress(() => {
      appStore.refresh()
    })
    refreshTimer = setInterval(() => {
      appStore.refresh()
    }, 5000)
  }
})

onUnmounted(() => {
  unsubProgress?.()
  unsubBrowser?.()
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <RouterView />
</template>
