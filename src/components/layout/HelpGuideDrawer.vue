<script setup lang="ts">
import { NDrawer, NDrawerContent, NButton, NTag } from 'naive-ui'
import { useRouter } from 'vue-router'

defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [value: boolean] }>()
const router = useRouter()

const steps = [
  {
    title: '1. 安装 Chrome 插件',
    tag: '首次必做',
    items: [
      '打开「浏览器管理」→ 点击「打开插件目录」',
      'Chrome 访问 chrome://extensions，开启「开发者模式」',
      '点击「加载已解压的扩展程序」，选择刚打开的插件文件夹',
      '复制应用中的配对码，粘贴到插件「选项 / 配对设置」并保存',
      '正常打开 Chrome（无需调试模式），插件显示在线即完成',
    ],
  },
  {
    title: '2. 选择操作 Tab',
    tag: '运行前必做',
    items: [
      '在 Chrome 中打开你要自动化的网页（如百度首页）',
      '回到「浏览器管理」，在 Tab 列表中选择目标页面',
      '状态显示「插件已连接」后，才能启动任务',
    ],
  },
  {
    title: '3. 创建并运行任务',
    tag: '核心流程',
    items: [
      '进入「新建任务」，选择技能包并填写任务名称即可运行',
      '同一技能包可创建多个不同名称的任务',
      '「调度中心」查看正在运行与报错的执行',
      '「任务中心」管理全部任务方案及每次运行历史',
      '导出文件可在「导出中心」查看',
    ],
  },
  {
    title: '4. 通知与日志',
    tag: '排错参考',
    items: [
      '顶部铃铛：查看失败、排队、浏览器连接等提醒',
      '「调度中心」：暂停/继续运行中任务，重试报错任务',
      '「日志中心」：查看每个节点的详细执行记录',
    ],
  },
]

const faqs = [
  {
    q: '为什么任务一直失败？',
    a: '先确认浏览器插件已连接且选中了正确的 Tab，再查看任务日志中的具体报错。',
  },
  {
    q: '插件显示在线但应用显示未连接？',
    a: '在浏览器管理中刷新连接状态，并确保已在 Tab 列表中选中目标页面。',
  },
  {
    q: '需要每次都用调试模式打开 Chrome 吗？',
    a: '不需要。安装插件后正常打开 Chrome 即可，登录态会完整保留。',
  },
]

function goBrowser() {
  emit('update:show', false)
  router.push('/browser')
}

function goFishpond() {
  emit('update:show', false)
  router.push('/fishpond')
}
</script>

<template>
  <NDrawer
    :show="show"
    :width="420"
    placement="right"
    @update:show="emit('update:show', $event)"
  >
    <NDrawerContent title="使用引导" closable>
      <p class="guide-intro">
        垂钓鸭通过 Chrome 插件控制浏览器完成自动化。按以下步骤配置一次，之后即可反复使用。
      </p>

      <div v-for="section in steps" :key="section.title" class="guide-section">
        <div class="section-head">
          <h4>{{ section.title }}</h4>
          <NTag size="small" round>{{ section.tag }}</NTag>
        </div>
        <ol class="guide-list">
          <li v-for="(item, i) in section.items" :key="i">{{ item }}</li>
        </ol>
      </div>

      <div class="guide-section">
        <h4>常见问题</h4>
        <div v-for="faq in faqs" :key="faq.q" class="faq-item">
          <div class="faq-q">{{ faq.q }}</div>
          <div class="faq-a">{{ faq.a }}</div>
        </div>
      </div>

      <div class="guide-actions">
        <NButton type="primary" block @click="goBrowser">前往浏览器管理</NButton>
        <NButton block @click="goFishpond">浏览技能鱼塘</NButton>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.guide-intro {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0 0 20px;
}

.guide-section {
  margin-bottom: 24px;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.section-head h4,
.guide-section > h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.guide-list {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.8;
}

.faq-item {
  margin-top: 12px;
  padding: 12px;
  background: var(--bg-elevated);
  border-radius: 8px;
}

.faq-q {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.faq-a {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.guide-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}
</style>
