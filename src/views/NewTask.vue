<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useMessage, NSelect, NForm, NFormItem, NInput, NButton, NCard } from 'naive-ui'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const message = useMessage()

const submitting = ref(false)
const selectedSkill = ref((route.query.skill as string) || null)
const taskName = ref('')

const skillOptions = computed(() =>
  appStore.skillPacks.filter((s) => s.isInstalled).map((s) => ({ label: s.name, value: s.id }))
)

const currentSkill = computed(() => appStore.skillPacks.find((s) => s.id === selectedSkill.value))

watch(
  [selectedSkill, () => appStore.skillPacks.length],
  () => {
    if (currentSkill.value && !taskName.value.trim()) {
      taskName.value = currentSkill.value.name
    }
  },
  { immediate: true }
)

async function handleStart() {
  if (!selectedSkill.value) {
    message.warning('请选择技能包')
    return
  }
  const name = taskName.value.trim()
  if (!name) {
    message.warning('请输入任务名称')
    return
  }

  submitting.value = true
  try {
    const task = await appStore.startTask({
      skillId: selectedSkill.value,
      name,
    })
    message.success(`任务「${task.name}」已启动`)
    router.push('/dispatch')
  } catch (err) {
    message.error(err instanceof Error ? err.message : '启动失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="new-task">
    <h2 class="page-title">新建任务</h2>
    <p class="page-desc">选择技能包并命名即可运行，参数已内置在技能包中</p>

    <NCard size="small" class="form-card">
      <NForm label-placement="left" label-width="88" style="max-width: 520px">
        <NFormItem label="技能包" required>
          <NSelect
            v-model:value="selectedSkill"
            :options="skillOptions"
            placeholder="从鱼塘选择技能包..."
            filterable
          />
        </NFormItem>

        <NFormItem v-if="currentSkill" label="技能说明">
          <p class="skill-desc">{{ currentSkill.description }}</p>
        </NFormItem>

        <NFormItem label="任务名称" required>
          <NInput
            v-model:value="taskName"
            placeholder="同一技能包可创建多个不同名称的任务"
            maxlength="64"
            show-count
          />
        </NFormItem>
      </NForm>
    </NCard>

    <div class="form-actions">
      <NButton @click="router.back()">取消</NButton>
      <NButton
        type="primary"
        size="large"
        :loading="submitting"
        :disabled="!selectedSkill || !taskName.trim()"
        @click="handleStart"
      >
        立即运行
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.page-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 4px 0 20px;
}

.form-card {
  max-width: 560px;
}

.skill-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}
</style>
