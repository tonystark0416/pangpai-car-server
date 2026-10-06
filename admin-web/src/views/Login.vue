<template>
  <div class="login-page">
    <el-card class="login-card">
      <h2 class="title">庞派汽车 · 管理后台</h2>
      <el-form :model="form" @keyup.enter="submit">
        <el-form-item>
          <el-input v-model="form.username" placeholder="账号" size="large" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.password" type="password" placeholder="密码" size="large" show-password />
        </el-form-item>
        <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="submit">
          登 录
        </el-button>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import api from '../api';

const router = useRouter();
const route = useRoute();
const loading = ref(false);
const form = reactive({ username: '', password: '' });

async function submit() {
  if (!form.username || !form.password) {
    ElMessage.warning('请输入账号和密码');
    return;
  }
  loading.value = true;
  try {
    const data = await api.post('/auth/login', form);
    localStorage.setItem('admin_token', data.token);
    localStorage.setItem('admin_nickname', data.admin.nickname || data.admin.username);
    ElMessage.success('登录成功');
    router.push(route.query.redirect || '/');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1f2d3d 0%, #2b4162 100%);
}
.login-card {
  width: 360px;
  padding: 12px 8px;
}
.title {
  text-align: center;
  margin: 8px 0 24px;
  color: #303133;
}
</style>
