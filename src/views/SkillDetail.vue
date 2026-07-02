<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { NButton, NTag } from 'naive-ui'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()

const skill = computed(() => appStore.skillPacks.find((s) => s.id === route.params.id))
</script>

<template>
  <div v-if="skill" class="skill-detail">
    <button class="back-btn" @click="router.back()">← 返回鱼塘</button>

    <div class="detail-header card">
      <div class="detail-icon">{{ skill.platform === 'Demo' ? '🦆' : '🎣' }}</div>
      <div class="detail-info">
        <h1 class="detail-name">{{ skill.name }}</h1>
        <p class="detail-desc">{{ skill.description }}</p>
        <div class="detail-meta">
          <NTag size="small">{{ skill.platform }}</NTag>
          <NTag size="small">v{{ skill.version }}</NTag>
          <NTag v-if="skill.isInstalled" type="success" size="small">
            {{ skill.source === 'installed' ? '本地安装' : '内置就绪' }}
          </NTag>
        </div>
      </div>
    </div>

    <div class="actions-section card">
      <h3 class="section-title">创建任务</h3>
      <p class="section-desc">
        技能包已内置全部操作与参数，选择后可自定义任务名称并立即运行。同一技能包可创建多个不同名称的任务。
      </p>
      <NButton
        type="primary"
        size="large"
        @click="router.push({ path: '/new-task', query: { skill: skill.id } })"
      >
        用此技能包新建任务
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.skill-detail {
  max-width: 800px;
}

.back-btn {
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  margin-bottom: 16px;
  padding: 0;
}

.back-btn:hover {
  color: var(--duck-yellow);
}

.detail-header {
  display: flex;
  gap: 20px;
  padding: 24px;
  margin-bottom: 16px;
}

.detail-icon {
  font-size: 48px;
  flex-shrink: 0;
}

.detail-name {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 8px;
}

.detail-desc {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 12px;
  line-height: 1.6;
}

.detail-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.actions-section {
  padding: 24px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px;
}

.section-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0 0 20px;
}
</style>
