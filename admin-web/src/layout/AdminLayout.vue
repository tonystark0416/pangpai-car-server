<template>
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="logo">庞派汽车 · 后台</div>
      <el-menu :default-active="$route.path" router background-color="#001529" text-color="#a6adb4" active-text-color="#fff">
        <el-menu-item index="/dashboard">
          <span>概览</span>
        </el-menu-item>
        <el-menu-item index="/orders">
          <span>订单管理</span>
        </el-menu-item>
        <el-menu-item index="/cars">
          <span>车辆管理</span>
        </el-menu-item>
        <el-menu-item index="/users">
          <span>用户管理</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="title">{{ $route.meta.title }}</div>
        <div class="right">
          <span class="nickname">{{ nickname }}</span>
          <el-button link type="danger" @click="logout">退出</el-button>
        </div>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const nickname = computed(() => localStorage.getItem('admin_nickname') || 'admin');

function logout() {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_nickname');
  router.push('/login');
}
</script>

<style scoped>
.layout {
  height: 100%;
}
.aside {
  background: #001529;
}
.logo {
  height: 60px;
  line-height: 60px;
  text-align: center;
  color: #fff;
  font-weight: 600;
  letter-spacing: 1px;
}
.aside :deep(.el-menu) {
  border-right: none;
}
.header {
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
}
.title {
  font-size: 16px;
  font-weight: 600;
}
.right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.nickname {
  color: #606266;
}
.main {
  padding: 16px;
}
</style>
