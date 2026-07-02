<script setup lang="ts">

import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'

import { NConfigProvider, NMessageProvider, NDialogProvider, darkTheme } from 'naive-ui'

import { duckThemeOverrides } from '@/styles/theme'

import AppSidebar from '@/components/layout/AppSidebar.vue'

import AppHeader from '@/components/layout/AppHeader.vue'

const route = useRoute()
const isDashboard = computed(() => route.name === 'Dashboard')
</script>



<template>

  <div class="app-layout">

    <NConfigProvider :theme="darkTheme" :theme-overrides="duckThemeOverrides" class="app-config">

      <NMessageProvider>

        <NDialogProvider>

          <div class="app-layout-body">

            <AppSidebar />

            <div class="app-main">

              <AppHeader />

              <main class="app-content">

                <div class="page-scroll" :class="{ 'page-no-scroll': isDashboard }">

                  <RouterView />

                </div>

              </main>

            </div>

          </div>

        </NDialogProvider>

      </NMessageProvider>

    </NConfigProvider>

  </div>

</template>



<style scoped>

.app-layout {

  width: 100%;

  height: 100%;

  min-height: 0;

  overflow: hidden;

}



.app-config {

  height: 100%;

  min-height: 0;

  display: flex;

  flex-direction: column;

}



.app-layout-body {

  flex: 1;

  min-height: 0;

  display: flex;

  overflow: hidden;

}



.app-main {

  flex: 1;

  display: flex;

  flex-direction: column;

  overflow: hidden;

  min-width: 0;

  min-height: 0;

}



.app-content {

  flex: 1;

  min-height: 0;

  overflow: hidden;

  background: var(--bg-dark);

}



.page-scroll {

  height: 100%;

  overflow-x: hidden;

  overflow-y: auto;

  padding: 20px;

  box-sizing: border-box;

}

.page-no-scroll {

  overflow: hidden;

  padding: 12px 16px;

}

</style>



<style>

/* Naive UI 会在 #app 下插入无高度的 config-provider 包裹层，需手动拉满高度链 */

#app,

#app > *,

.n-config-provider {

  height: 100%;

  min-height: 0;

}

</style>

