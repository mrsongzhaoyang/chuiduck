<script setup lang="ts">

import { computed, onMounted } from 'vue'

import { useRoute, useRouter } from 'vue-router'

import { useAppStore } from '@/stores/app'

import DuckLogo from '@/components/common/DuckLogo.vue'

import {

  HomeOutline,

  AddCircleOutline,

  ListOutline,

  PulseOutline,

  ArchiveOutline,

  GlobeOutline,

  DocumentTextOutline,

  SettingsOutline,

} from '@vicons/ionicons5'

import { Fish } from '@vicons/tabler'

import { NIcon } from 'naive-ui'



const route = useRoute()

const router = useRouter()

const appStore = useAppStore()



const menuItems = [

  { path: '/dashboard', label: '首页', icon: HomeOutline },

  { path: '/fishpond', label: '鱼塘', icon: Fish },

  { path: '/new-task', label: '新建任务', icon: AddCircleOutline },

  { path: '/dispatch', label: '调度中心', icon: PulseOutline },

  { path: '/tasks', label: '任务中心', icon: ListOutline },

  { path: '/export', label: '导出中心', icon: ArchiveOutline },

  { path: '/browser', label: '浏览器管理', icon: GlobeOutline },

  { path: '/logs', label: '日志中心', icon: DocumentTextOutline },

  { path: '/settings', label: '设置', icon: SettingsOutline },

]



const activePath = computed(() => route.path)



const displayName = computed(() => appStore.operatorName || 'Operator')



const statusText = computed(() => {

  if (appStore.browserInfo.connected) {

    const account = appStore.browserInfo.account

    return account ? `Chrome 已连接 · ${account}` : 'Chrome 已连接'

  }

  if (appStore.browserInfo.extensionOnline) return '插件在线，待同步 Tab'

  return '浏览器未连接'

})



function navigate(path: string) {

  router.push(path)

}



onMounted(() => {

  appStore.loadOperatorName()

})

</script>



<template>

  <aside class="sidebar">

    <div class="sidebar-brand">

      <DuckLogo :size="36" />

      <div class="brand-text">

        <span class="brand-name">垂钓鸭</span>

        <span class="brand-version">V1.0.0 · 就绪</span>

      </div>

    </div>



    <nav class="sidebar-nav">

      <button

        v-for="item in menuItems"

        :key="item.path"

        class="nav-item"

        :class="{ active: activePath.startsWith(item.path) }"

        @click="navigate(item.path)"

      >

        <span class="nav-indicator" />

        <NIcon :size="18" class="nav-icon">

          <component :is="item.icon" />

        </NIcon>

        <span class="nav-label">{{ item.label }}</span>

      </button>

    </nav>



    <div class="sidebar-footer">

      <div class="user-card">

        <div class="user-avatar">🦆</div>

        <div class="user-info">

          <span class="user-name">{{ displayName }}</span>

          <span class="user-plan" :class="{ offline: !appStore.browserInfo.connected }">{{ statusText }}</span>

        </div>

      </div>

    </div>

  </aside>

</template>



<style scoped>

.sidebar {

  width: var(--sidebar-width);

  height: 100%;

  background: var(--bg, #111620);

  background: #111620;

  border-right: 1px solid var(--border-color);

  display: flex;

  flex-direction: column;

  flex-shrink: 0;

  user-select: none;

}



.sidebar-brand {

  display: flex;

  align-items: center;

  gap: 10px;

  padding: 20px 16px 16px;

  border-bottom: 1px solid var(--border-color);

}



.brand-text {

  display: flex;

  flex-direction: column;

  gap: 2px;

}



.brand-name {

  font-size: 16px;

  font-weight: 700;

  background: linear-gradient(135deg, var(--duck-yellow) 0%, var(--duck-orange) 100%);

  -webkit-background-clip: text;

  -webkit-text-fill-color: transparent;

  background-clip: text;

}



.brand-version {

  font-size: 11px;

  color: var(--text-muted);

  letter-spacing: 0.3px;

}



.sidebar-nav {

  flex: 1;

  padding: 12px 8px;

  display: flex;

  flex-direction: column;

  gap: 2px;

  overflow-y: auto;

}



.nav-item {

  position: relative;

  display: flex;

  align-items: center;

  gap: 10px;

  padding: 10px 12px;

  border: none;

  border-radius: 8px;

  background: transparent;

  color: var(--text-secondary);

  font-size: 13.5px;

  cursor: pointer;

  transition: all 0.15s ease;

  text-align: left;

  width: 100%;

}



.nav-item:hover {

  background: rgba(255, 217, 61, 0.06);

  color: var(--text-primary);

}



.nav-item.active {

  background: rgba(255, 217, 61, 0.12);

  color: var(--duck-yellow);

}



.nav-indicator {

  position: absolute;

  left: 0;

  top: 50%;

  transform: translateY(-50%);

  width: 3px;

  height: 0;

  background: var(--duck-yellow);

  border-radius: 0 2px 2px 0;

  transition: height 0.15s ease;

}



.nav-item.active .nav-indicator {

  height: 20px;

}



.nav-icon {

  flex-shrink: 0;

}



.nav-label {

  flex: 1;

}



.sidebar-footer {

  padding: 12px;

  border-top: 1px solid var(--border-color);

}



.user-card {

  display: flex;

  align-items: center;

  gap: 10px;

  padding: 10px;

  border-radius: 8px;

  background: var(--bg-elevated);

}



.user-avatar {

  width: 32px;

  height: 32px;

  border-radius: 50%;

  background: rgba(255, 217, 61, 0.15);

  display: flex;

  align-items: center;

  justify-content: center;

  font-size: 18px;

}



.user-info {

  display: flex;

  flex-direction: column;

  gap: 2px;

  min-width: 0;

}



.user-name {

  font-size: 13px;

  font-weight: 500;

  color: var(--text-primary);

  overflow: hidden;

  text-overflow: ellipsis;

  white-space: nowrap;

}



.user-plan {

  font-size: 11px;

  color: var(--duck-yellow);

  overflow: hidden;

  text-overflow: ellipsis;

  white-space: nowrap;

}



.user-plan.offline {

  color: var(--text-muted);

}

</style>

