<script setup lang="ts">
defineProps<{
  size?: number
}>()
</script>

<template>
  <svg
    :width="size || 32"
    :height="size || 32"
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    class="duck-logo"
  >
    <!-- 水面 -->
    <ellipse cx="32" cy="54" rx="28" ry="4" fill="#3a7bd5" opacity="0.3" />
    <!-- 鸭身 -->
    <ellipse cx="32" cy="36" rx="18" ry="14" fill="#FFD93D" />
    <!-- 鸭头 -->
    <circle cx="32" cy="22" r="12" fill="#FFD93D" />
    <!-- 鸭嘴 -->
    <ellipse cx="32" cy="26" rx="8" ry="4" fill="#FF9F1C" />
    <!-- 眼睛 -->
    <circle cx="28" cy="20" r="2.5" fill="#141820" />
    <circle cx="36" cy="20" r="2.5" fill="#141820" />
    <circle cx="28.5" cy="19.5" r="0.8" fill="#fff" />
    <circle cx="36.5" cy="19.5" r="0.8" fill="#fff" />
    <!-- 鱼竿 -->
    <line x1="44" y1="10" x2="20" y2="48" stroke="#8B6914" stroke-width="2" stroke-linecap="round" />
    <!-- 鱼线 -->
    <path d="M20 48 Q 16 52 14 50" stroke="#aaa" stroke-width="0.8" fill="none" />
    <!-- 小鱼 -->
    <ellipse cx="13" cy="51" rx="3" ry="1.5" fill="#3a7bd5" opacity="0.8" />
    <!-- 翅膀 -->
    <ellipse cx="24" cy="36" rx="6" ry="4" fill="#F5C518" opacity="0.6" />
  </svg>
</template>

<style scoped>
.duck-logo {
  flex-shrink: 0;
}
</style>
