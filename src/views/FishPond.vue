<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { NButton, NTag, useMessage } from 'naive-ui'
import { GridOutline, ListOutline } from '@vicons/ionicons5'
import { NIcon } from 'naive-ui'

const router = useRouter()
const appStore = useAppStore()
const message = useMessage()

const filter = ref<'all' | 'installed' | 'local'>('all')
const category = ref('all')
const viewMode = ref<'grid' | 'list'>('grid')
const installing = ref(false)

const filters = [
  { key: 'all' as const, label: '全部' },
  { key: 'installed' as const, label: '已安装' },
  { key: 'local' as const, label: '本地导入' },
]

const categories = [
  { key: 'all', label: '全部分类' },
  { key: 'ecommerce', label: '电商采集' },
  { key: 'social', label: '社媒互动' },
  { key: 'system', label: '系统自动化' },
]

const filteredSkills = computed(() => {
  let list = appStore.skillPacks
  if (filter.value === 'installed') list = list.filter((s) => s.isInstalled)
  if (filter.value === 'local') list = list.filter((s) => s.source === 'installed')
  if (category.value !== 'all') list = list.filter((s) => s.category === category.value)
  if (appStore.searchQuery) {
    const q = appStore.searchQuery.toLowerCase()
    list = list.filter(
      (s) => {
        const actionText = s.actions.map((a) => `${a.name} ${a.description}`).join(' ')
        return (
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.platform.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          actionText.toLowerCase().includes(q)
        )
      }
    )
  }
  return list
})

function platformIcon(skill: { platform: string; icon: string }) {
  if (skill.icon && !skill.icon.startsWith('file://')) return skill.icon
  const icons: Record<string, string> = {
    Temu: '🛒', SHEIN: '👗', TikTok: '🎵', Shopee: '🏪', 京东: '📦', Lazada: '🎫', Demo: '🦆',
  }
  return icons[skill.platform] || '🎣'
}

async function handleImportSkill() {
  installing.value = true
  try {
    const skill = await appStore.installSkillDialog()
    if (skill) message.success(`已安装：${skill.name}`)
    else message.info('已取消安装')
  } catch (err) {
    message.error(err instanceof Error ? err.message : '安装失败')
  } finally {
    installing.value = false
  }
}
</script>

<template>
  <div class="fishpond page-fill">
    <aside class="filter-sidebar">
      <div class="filter-section">
        <h4 class="filter-title">筛选导航</h4>
        <button
          v-for="f in filters"
          :key="f.key"
          class="filter-item"
          :class="{ active: filter === f.key }"
          @click="filter = f.key"
        >
          {{ f.label }}
        </button>
      </div>

      <div class="filter-section">
        <h4 class="filter-title">分类检索</h4>
        <button
          v-for="cat in categories"
          :key="cat.key"
          class="filter-item"
          :class="{ active: category === cat.key }"
          @click="category = cat.key"
        >
          {{ cat.label }}
        </button>
      </div>
    </aside>

    <div class="fishpond-content">
      <div class="content-header">
        <div>
          <h2 class="page-title">🐟 精选技能包</h2>
          <p class="page-desc">在网页世界垂钓数据，每个平台都是一个技能包</p>
        </div>
        <div class="header-actions">
          <NButton type="primary" :loading="installing" @click="handleImportSkill">
            📁 导入本地技能包
          </NButton>
          <div class="view-toggle">
          <button
            class="toggle-btn"
            :class="{ active: viewMode === 'grid' }"
            @click="viewMode = 'grid'"
          >
            <NIcon :size="18"><GridOutline /></NIcon>
          </button>
          <button
            class="toggle-btn"
            :class="{ active: viewMode === 'list' }"
            @click="viewMode = 'list'"
          >
            <NIcon :size="18"><ListOutline /></NIcon>
          </button>
          </div>
        </div>
      </div>

      <div v-if="filteredSkills.length === 0" class="empty-tip">
        暂无技能包，请导入本地技能包文件夹（需包含 manifest.json）
      </div>

      <div class="skill-grid" :class="{ list: viewMode === 'list' }">
        <div
          v-for="skill in filteredSkills"
          :key="`${skill.id}@${skill.version}`"
          class="skill-card"
          @click="router.push(`/fishpond/${skill.id}`)"
        >
          <div v-if="skill.source === 'bundled'" class="ribbon new">内置</div>

          <div class="skill-icon">{{ platformIcon(skill) }}</div>
          <div class="skill-info">
            <h3 class="skill-name">{{ skill.name }}</h3>
            <p class="skill-desc">{{ skill.description }}</p>
            <div class="skill-meta">
              <NTag size="small" round>{{ skill.platform }}</NTag>
              <span class="skill-version">v{{ skill.version }}</span>
              <span class="skill-actions-count">{{ skill.actions.length }} 个动作</span>
            </div>
          </div>
          <div class="skill-actions">
            <NTag v-if="skill.isInstalled" type="success" size="small" round>
              {{ skill.source === 'installed' ? '本地安装' : '已就绪' }}
            </NTag>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fishpond {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  align-items: stretch;
  min-width: 0;
  overflow: hidden;
}

.filter-sidebar {
  width: 180px;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-color);
  padding: 20px 12px;
  overflow-y: auto;
}

.filter-section {
  margin-bottom: 24px;
}

.filter-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  padding: 0 8px;
}

.filter-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}

.filter-item:hover {
  background: rgba(255, 217, 61, 0.06);
  color: var(--text-primary);
}

.filter-item.active {
  background: rgba(255, 217, 61, 0.12);
  color: var(--duck-yellow);
  font-weight: 500;
}

.fishpond-content {
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding-bottom: 24px;
}

.content-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
}

.page-title {
  margin-bottom: 4px;
}

.page-desc {
  font-size: 13px;
  color: var(--text-secondary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.empty-tip {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}

.skill-actions-count {
  font-size: 11px;
  color: var(--text-muted);
}

.view-toggle {
  display: flex;
  gap: 4px;
  background: var(--bg-elevated);
  border-radius: 8px;
  padding: 3px;
}

.toggle-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.toggle-btn.active {
  background: var(--bg-surface);
  color: var(--duck-yellow);
}

.skill-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 12px;
}

@media (max-width: 900px) {
  .fishpond {
    grid-template-columns: 1fr;
  }

  .filter-sidebar {
    width: 100%;
    position: static;
    max-height: none;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    flex-wrap: wrap;
    gap: 12px 16px;
    padding: 12px 16px;
  }

  .filter-section {
    margin-bottom: 0;
    min-width: 120px;
  }
}

.skill-grid.list {
  grid-template-columns: 1fr;
  gap: 10px;
}

.skill-grid.list .skill-card {
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  transform: none;
}

.skill-grid.list .skill-card:hover {
  transform: none;
}

.skill-grid.list .skill-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  font-size: 22px;
}

.skill-grid.list .skill-info {
  flex: 1;
  min-width: 0;
}

.skill-grid.list .skill-name {
  margin-bottom: 0;
}

.skill-grid.list .skill-desc {
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-grid.list .skill-meta {
  margin-top: 6px;
}

.skill-grid.list .skill-actions {
  margin-top: 0;
  flex-shrink: 0;
}

.skill-grid.list .ribbon {
  top: 50%;
  transform: translateY(-50%);
}

.skill-card {
  position: relative;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px 14px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.skill-card:hover {
  border-color: rgba(255, 217, 61, 0.3);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  transform: translateY(-2px);
}

.ribbon {
  position: absolute;
  top: 8px;
  right: -4px;
  padding: 1px 8px;
  font-size: 9px;
  font-weight: 700;
  border-radius: 4px 0 0 4px;
  letter-spacing: 0.5px;
}

.ribbon.new {
  background: var(--duck-yellow);
  color: #141820;
}

.ribbon.update {
  background: var(--duck-orange);
  color: #fff;
}

.skill-icon {
  font-size: 26px;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-elevated);
  border-radius: 8px;
}

.skill-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}

.skill-desc {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
  line-height: 1.4;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.skill-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.skill-version {
  font-size: 11px;
  color: var(--text-muted);
}

.skill-actions {
  margin-top: auto;
}
</style>
