<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import type { TaskScheduleInput } from '../../shared/types'
import { DEFAULT_TIMEZONE } from '../../shared/cron-presets'
import { getElectronAPI } from '@/api/electron'
import { NForm, NFormItem, NSwitch, NSelect, NInput, NText, NTimePicker } from 'naive-ui'

const model = defineModel<TaskScheduleInput>({ required: true })

type PresetKind = 'every30m' | 'hourly' | 'daily' | 'weekday' | 'custom'

const presetKind = ref<PresetKind>('daily')
const customCron = ref('0 9 * * *')
const timeString = ref('09:00')
const nextRunPreview = ref<string | null>(null)
const cronValid = ref(true)
let previewSeq = 0

const presetOptions = [
  { label: '每 30 分钟', value: 'every30m' },
  { label: '每小时', value: 'hourly' },
  { label: '每天固定时间', value: 'daily' },
  { label: '工作日固定时间', value: 'weekday' },
  { label: '自定义 Cron', value: 'custom' },
]

const timezone = computed(() => model.value?.timezone || DEFAULT_TIMEZONE)

const enabled = computed({
  get: () => !!model.value?.enabled,
  set: (value: boolean) => {
    model.value = {
      enabled: value,
      cron: value ? buildCron() : model.value?.cron || customCron.value || '0 9 * * *',
      timezone: timezone.value,
    }
  },
})

const showTimePicker = computed(
  () => enabled.value && (presetKind.value === 'daily' || presetKind.value === 'weekday')
)
const showCustomCron = computed(() => enabled.value && presetKind.value === 'custom')

function cronFromTimeString(time: string, dayPart: string) {
  const [hourStr, minuteStr] = time.split(':')
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return `0 9 ${dayPart}`
  return `${minute} ${hour} ${dayPart}`
}

function buildCron() {
  switch (presetKind.value) {
    case 'every30m':
      return '*/30 * * * *'
    case 'hourly':
      return '0 * * * *'
    case 'daily':
      return cronFromTimeString(timeString.value, '* * *')
    case 'weekday':
      return cronFromTimeString(timeString.value, '* * 1-5')
    case 'custom':
      return customCron.value.trim() || '0 9 * * *'
    default:
      return '0 9 * * *'
  }
}

function applyCronToModel() {
  if (!enabled.value) return
  const cron = buildCron()
  model.value = {
    enabled: true,
    cron,
    timezone: timezone.value,
  }
}

function parseTimeFromCron(cron: string) {
  const parts = cron.trim().split(/\s+/)
  if (parts.length < 2) return
  const minute = Number(parts[0])
  const hour = Number(parts[1])
  if (Number.isNaN(minute) || Number.isNaN(hour)) return
  timeString.value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function initFromCron(cron: string) {
  const value = (cron || '').trim()
  if (!value) return
  if (value === '*/30 * * * *') {
    presetKind.value = 'every30m'
    return
  }
  if (value === '0 * * * *') {
    presetKind.value = 'hourly'
    return
  }
  if (/^\d+ \d+ \* \* \*$/.test(value)) {
    presetKind.value = 'daily'
    parseTimeFromCron(value)
    return
  }
  if (/^\d+ \d+ \* \* 1-5$/.test(value)) {
    presetKind.value = 'weekday'
    parseTimeFromCron(value)
    return
  }
  presetKind.value = 'custom'
  customCron.value = value
}

function formatNextRun(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', {
    timeZone: timezone.value,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

async function refreshPreview() {
  await nextTick()
  const api = getElectronAPI()
  const cron = model.value?.cron || ''
  const seq = ++previewSeq

  if (!api || !enabled.value || !cron) {
    nextRunPreview.value = null
    cronValid.value = true
    return
  }

  try {
    const result = await api.tasksValidateCron(cron, timezone.value)
    if (seq !== previewSeq) return
    cronValid.value = result.valid
    nextRunPreview.value = result.nextRunAt
  } catch {
    if (seq !== previewSeq) return
    cronValid.value = false
    nextRunPreview.value = null
  }
}

watch([presetKind, timeString, customCron], () => {
  applyCronToModel()
  void refreshPreview()
})

watch(
  () => model.value?.cron,
  (cron) => initFromCron(cron || ''),
  { immediate: true }
)

watch(
  () => model.value?.enabled,
  () => {
    void refreshPreview()
  }
)
</script>

<template>
  <div class="schedule-form">
    <NForm label-placement="left" label-width="96">
      <NFormItem label="启用定时">
        <NSwitch v-model:value="enabled" />
      </NFormItem>

      <template v-if="enabled">
        <NFormItem label="执行频率">
          <NSelect v-model:value="presetKind" :options="presetOptions" />
        </NFormItem>

        <NFormItem v-if="showTimePicker" label="执行时间">
          <NTimePicker
            v-model:formatted-value="timeString"
            value-format="HH:mm"
            format="HH:mm"
            placeholder="选择时间"
            style="width: 100%"
          />
        </NFormItem>

        <NFormItem v-if="showCustomCron" label="Cron 表达式">
          <NInput
            v-model:value="customCron"
            placeholder="例如 0 9 * * *（分 时 日 月 周）"
          />
        </NFormItem>

        <NFormItem v-else-if="model?.cron" label="当前规则">
          <NText depth="3">{{ model.cron }}</NText>
        </NFormItem>

        <NFormItem v-if="nextRunPreview" label="下次执行">
          <NText :type="cronValid ? 'success' : 'error'">
            {{ cronValid ? formatNextRun(nextRunPreview) : '表达式无效' }}
          </NText>
        </NFormItem>
      </template>
    </NForm>
  </div>
</template>

<style scoped>
.schedule-form {
  width: 100%;
}
</style>
