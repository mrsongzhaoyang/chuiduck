<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()

const installedSkills = computed(() =>
  appStore.skillPacks.filter((s) => s.isInstalled).slice(0, 3)
)

function openSkill(skillId: string) {
  router.push(`/fishpond/${skillId}`)
}
</script>

<template>
  <div class="skill-updates card fill-card">
    <div class="widget-header">
      <h3 class="section-title">🎣 鱼塘技能包</h3>
    </div>

    <div class="update-list">
      <div
        v-for="skill in installedSkills"
        :key="skill.id"
        class="update-item"
        @click="openSkill(skill.id)"
      >
        <div class="update-icon">🦆</div>
        <div class="update-info">
          <span class="update-name">{{ skill.name }}</span>
          <span class="update-version">v{{ skill.version }} · {{ skill.actions.length }} 个动作</span>
        </div>
      </div>
      <div v-if="installedSkills.length === 0" class="empty">暂无技能包</div>
    </div>

    <button class="manage-link" @click="router.push('/fishpond')">
      管理所有技能插件 →
    </button>
  </div>
</template>

<style scoped>
.skill-updates {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.widget-header {
  margin-bottom: 8px;
}

.section-title {
  margin-bottom: 0;
  font-size: 13px;
}

.update-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.update-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--bg-elevated);
  cursor: pointer;
  transition: background 0.15s;
}

.update-item:hover {
  background: rgba(255, 217, 61, 0.08);
}

.update-icon {
  font-size: 20px;
}

.update-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.update-name {
  font-size: 13px;
  font-weight: 500;
}

.update-version {
  font-size: 11px;
  color: var(--text-muted);
}

.empty {
  font-size: 12px;
  color: var(--text-muted);
  padding: 8px;
}

.manage-link {
  margin-top: auto;
  padding-top: 8px;
  padding: 0;
  border: none;
  background: none;
  color: var(--duck-yellow);
  font-size: 12px;
  cursor: pointer;
}
</style>
