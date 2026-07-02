<script setup lang="ts">
defineProps<{
  label: string
  value: string | number
  change?: number
  icon?: string
  progress?: number
  progressColor?: string
  subText?: string
  compact?: boolean
}>()
</script>

<template>
  <div class="stat-card" :class="{ compact }">
    <div class="stat-header">
      <span class="stat-label">{{ label }}</span>
      <span v-if="icon" class="stat-icon">{{ icon }}</span>
    </div>
    <div class="stat-value">{{ value }}</div>
    <div v-if="change !== undefined" class="stat-footer">
      <span :class="change >= 0 ? 'stat-change-up' : 'stat-change-down'">
        {{ change >= 0 ? '+' : '' }}{{ change }}% 较昨日
      </span>
    </div>
    <div v-if="subText" class="stat-sub">{{ subText }}</div>
    <div v-if="progress !== undefined" class="stat-progress">
      <div
        class="stat-progress-bar"
        :style="{
          width: progress + '%',
          background: progressColor || 'var(--duck-yellow)',
        }"
      />
    </div>
  </div>
</template>

<style scoped>
.stat-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 14px 16px;
  min-width: 0;
}

.stat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.stat-icon {
  font-size: 16px;
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.stat-footer {
  margin-top: 6px;
}

.stat-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.stat-progress {
  margin-top: 8px;
  height: 4px;
  background: var(--bg-elevated);
  border-radius: 2px;
  overflow: hidden;
}

.stat-progress-bar {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.stat-card.compact {
  padding: 10px 12px;
}

.stat-card.compact .stat-header {
  margin-bottom: 4px;
}

.stat-card.compact .stat-label {
  font-size: 11px;
}

.stat-card.compact .stat-icon {
  font-size: 14px;
}

.stat-card.compact .stat-value {
  font-size: 22px;
}

.stat-card.compact .stat-footer {
  margin-top: 4px;
}

.stat-card.compact .stat-progress {
  margin-top: 4px;
}
</style>
