<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import StatCard from '@/components/dashboard/StatCard.vue'
import RecentTasks from '@/components/dashboard/RecentTasks.vue'
import BrowserWidget from '@/components/dashboard/BrowserWidget.vue'
import SkillUpdates from '@/components/dashboard/SkillUpdates.vue'

const router = useRouter()
const appStore = useAppStore()

const totalExports = computed(
  () => appStore.stats.exportExcel + appStore.stats.exportImages + appStore.stats.exportJson
)
const installedSkills = computed(() => appStore.skillPacks.filter((s) => s.isInstalled).length)
</script>

<template>
  <div class="dashboard page-fill">
    <div class="stats-row">
      <StatCard
        compact
        label="今日运行"
        :value="appStore.stats.todayRuns"
        :change="appStore.stats.todayRunsChange"
        icon="🎣"
      />
      <StatCard
        compact
        label="成功"
        :value="appStore.stats.success"
        :progress="appStore.successRate"
        progress-color="#52c41a"
      />
      <StatCard
        compact
        label="失败"
        :value="appStore.stats.failure"
        :progress="appStore.stats.failure > 0 ? Math.round((appStore.stats.failure / (appStore.stats.success + appStore.stats.failure)) * 100) : 0"
        progress-color="#ff4757"
      />
      <StatCard compact label="等待" :value="appStore.stats.waiting" icon="⏳" />
      <StatCard compact label="运行时间" :value="appStore.stats.runtime" icon="⏱️" />
      <StatCard compact label="导出文件总数" :value="totalExports" icon="📁" />
      <StatCard compact label="导出 Excel" :value="appStore.stats.exportExcel" icon="📊" />
      <StatCard compact label="导出图片" :value="appStore.stats.exportImages" icon="🖼️" />
      <StatCard compact label="导出 JSON" :value="appStore.stats.exportJson" icon="📋" />
      <StatCard compact label="已装技能包" :value="installedSkills" icon="🎣" />
    </div>

    <div class="dashboard-body">
      <div class="dashboard-main">
        <RecentTasks />
      </div>
      <div class="dashboard-side">
        <BrowserWidget />
        <SkillUpdates />
      </div>
    </div>

    <button class="fab" title="新建任务" @click="router.push('/new-task')">
      <span class="fab-icon">🦆</span>
    </button>
  </div>
</template>

<style scoped>
.dashboard {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.dashboard-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 260px);
  gap: 12px;
  align-items: stretch;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.dashboard-main {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.dashboard-side {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.dashboard-main :deep(.recent-tasks),
.dashboard-side :deep(.fill-card) {
  flex: 1;
  min-height: 0;
}

.dashboard-side :deep(.browser-widget) {
  flex-shrink: 0;
}

.dashboard-side :deep(.card) {
  padding: 12px;
}

.fab {
  position: fixed;
  right: 28px;
  bottom: 28px;
  width: 52px;
  height: 52px;
  border: none;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--duck-yellow) 0%, var(--duck-orange) 100%);
  box-shadow: 0 4px 20px rgba(255, 217, 61, 0.35);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s, box-shadow 0.2s;
  z-index: 100;
}

.fab:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 28px rgba(255, 217, 61, 0.45);
}

.fab-icon {
  font-size: 24px;
}

@media (max-width: 1100px) {
  .stats-row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .dashboard-body {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }
}
</style>
