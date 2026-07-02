import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      redirect: '/dashboard',
      children: [
        {
          path: 'dashboard',
          name: 'Dashboard',
          component: () => import('@/views/Dashboard.vue'),
          meta: { title: '首页', breadcrumb: ['首页', '实时面板'] },
        },
        {
          path: 'fishpond',
          name: 'FishPond',
          component: () => import('@/views/FishPond.vue'),
          meta: { title: '鱼塘', breadcrumb: ['鱼塘', '全部'] },
        },
        {
          path: 'fishpond/:id',
          name: 'SkillDetail',
          component: () => import('@/views/SkillDetail.vue'),
          meta: { title: '技能详情', breadcrumb: ['鱼塘', '详情'] },
        },
        {
          path: 'new-task',
          name: 'NewTask',
          component: () => import('@/views/NewTask.vue'),
          meta: { title: '新建任务', breadcrumb: ['新建任务'] },
        },
        {
          path: 'tasks',
          name: 'TaskCenter',
          component: () => import('@/views/TaskCenter.vue'),
          meta: { title: '任务中心', breadcrumb: ['任务中心'] },
        },
        {
          path: 'dispatch',
          name: 'DispatchCenter',
          component: () => import('@/views/DispatchCenter.vue'),
          meta: { title: '调度中心', breadcrumb: ['调度中心'] },
        },
        {
          path: 'tasks/:id/running',
          name: 'TaskRunning',
          component: () => import('@/views/TaskRunning.vue'),
          meta: { title: '任务运行', breadcrumb: ['任务中心', '运行中'] },
        },
        {
          path: 'export',
          name: 'ExportCenter',
          component: () => import('@/views/ExportCenter.vue'),
          meta: { title: '导出中心', breadcrumb: ['导出中心'] },
        },
        {
          path: 'browser',
          name: 'BrowserManage',
          component: () => import('@/views/BrowserManage.vue'),
          meta: { title: '浏览器管理', breadcrumb: ['浏览器管理'] },
        },
        {
          path: 'logs',
          name: 'LogCenter',
          component: () => import('@/views/LogCenter.vue'),
          meta: { title: '日志中心', breadcrumb: ['日志中心'] },
        },
        {
          path: 'settings',
          name: 'Settings',
          component: () => import('@/views/Settings.vue'),
          meta: { title: '设置', breadcrumb: ['设置'] },
        },
      ],
    },
  ],
})

export default router
