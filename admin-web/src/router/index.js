import { createRouter, createWebHistory } from 'vue-router';
import AdminLayout from '../layout/AdminLayout.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('../views/Login.vue'), meta: { public: true } },
    {
      path: '/',
      component: AdminLayout,
      redirect: '/dashboard',
      children: [
        { path: 'dashboard', component: () => import('../views/Dashboard.vue'), meta: { title: '概览' } },
        { path: 'orders', component: () => import('../views/Orders.vue'), meta: { title: '订单管理' } },
        { path: 'cars', component: () => import('../views/Cars.vue'), meta: { title: '车辆管理' } },
        { path: 'users', component: () => import('../views/Users.vue'), meta: { title: '用户管理' } },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

// 路由守卫：未登录跳转 login
router.beforeEach((to) => {
  const token = localStorage.getItem('admin_token');
  if (!to.meta.public && !token) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
});

export default router;
