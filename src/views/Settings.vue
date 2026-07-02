<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSwitch,
  NButton,
  NDivider,
  useMessage,
} from 'naive-ui'
import { getElectronAPI } from '@/api/electron'
import { useAppStore } from '@/stores/app'

const message = useMessage()
const appStore = useAppStore()
const saving = ref(false)

const settings = ref({
  bridgePort: 37892,
  bridgeToken: '',
  extensionPath: '',
  autoConnect: true,
  exportDir: '',
  maxConcurrent: 3,
  retryCount: 3,
  browserAccount: '',
  operatorName: '',
})

async function loadSettings() {
  const api = getElectronAPI()
  if (!api) return
  const data = await api.settingsGet()
  settings.value = { ...settings.value, ...data } as typeof settings.value
}

onMounted(loadSettings)

async function browseExportDir() {
  const api = getElectronAPI()
  if (!api) {
    message.warning('请在 Electron 桌面版中选择目录')
    return
  }
  const path = await api.settingsBrowseExportDir()
  if (path) settings.value.exportDir = path
}

async function saveSettings() {
  const api = getElectronAPI()
  if (!api) {
    message.warning('请在 Electron 桌面版中保存设置')
    return
  }

  saving.value = true
  try {
    const result = await api.settingsSave({ ...settings.value })
    if (result?.settings) {
      settings.value = { ...settings.value, ...result.settings } as typeof settings.value
    }
    await appStore.refresh()
    await appStore.loadOperatorName()
    message.success('设置已保存')
  } catch (err) {
    message.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="settings">
    <h2 class="page-title">设置</h2>

    <div class="settings-grid">
      <div class="settings-section card">
        <h3 class="section-title">🧩 Chrome 插件</h3>
        <p class="section-hint">
          浏览器连接已改为 Chrome 插件方式。请在「浏览器管理」中安装插件并填写配对码。
        </p>
        <NForm label-placement="left" label-width="140">
          <NFormItem label="桥接端口">
            <div class="form-field-block">
              <NInputNumber
                v-model:value="settings.bridgePort"
                :min="1024"
                :max="65535"
                class="port-input"
              />
              <p class="field-hint">修改后保存即可生效；若插件连不上，请同步更新插件中的端口并重新连接。</p>
            </div>
          </NFormItem>
          <NFormItem label="浏览器账号">
            <NInput v-model:value="settings.browserAccount" placeholder="用于显示，如 xxxxx@qq.com" />
          </NFormItem>
          <NFormItem label="自动检测插件">
            <NSwitch v-model:value="settings.autoConnect" />
          </NFormItem>
        </NForm>
        <p v-if="settings.extensionPath" class="field-hint">插件目录：{{ settings.extensionPath }}</p>
      </div>

      <div class="settings-section card">
        <h3 class="section-title">🎣 运行配置</h3>
        <NForm label-placement="left" label-width="140">
          <NFormItem label="操作员名称">
            <NInput v-model:value="settings.operatorName" placeholder="显示在侧边栏" />
          </NFormItem>
          <NFormItem label="最大并发">
            <NInputNumber v-model:value="settings.maxConcurrent" :min="1" :max="10" style="width: 100%" />
          </NFormItem>
          <NFormItem label="失败重试">
            <NInputNumber v-model:value="settings.retryCount" :min="0" :max="10" style="width: 100%" />
          </NFormItem>
          <NFormItem label="导出目录">
            <div class="path-row">
              <NInput v-model:value="settings.exportDir" placeholder="默认使用应用目录下的 export" />
              <NButton secondary @click="browseExportDir">浏览</NButton>
            </div>
          </NFormItem>
        </NForm>
      </div>
    </div>

    <NDivider />

    <NButton type="primary" :loading="saving" @click="saveSettings">保存设置</NButton>
  </div>
</template>

<style scoped>
.settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  max-width: 960px;
}

@media (max-width: 900px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
}

.section-hint,
.field-hint {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
  margin: -8px 0 16px;
}

.form-field-block {
  width: 100%;
}

.form-field-block .field-hint {
  margin: 8px 0 0;
}

.port-input {
  width: 200px;
  max-width: 100%;
}

.port-input:deep(.n-input) {
  width: 100%;
}

.path-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
</style>
