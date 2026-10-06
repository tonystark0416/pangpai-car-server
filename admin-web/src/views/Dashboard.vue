<template>
  <div>
    <el-row :gutter="16">
      <el-col :span="6" v-for="card in cards" :key="card.label">
        <el-card>
          <div class="stat-label">{{ card.label }}</div>
          <div class="stat-value">{{ card.value }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="tip-card">
      <template #header>今日概览</template>
      <el-descriptions :column="3" border>
        <el-descriptions-item label="今日新增订单">{{ stats.orderToday }}</el-descriptions-item>
        <el-descriptions-item label="今日已支付">{{ stats.paidToday }}</el-descriptions-item>
        <el-descriptions-item label="今日支付金额（已支付订单合计）">￥{{ stats.paidTodayAmount }}</el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../api';

const stats = ref({});

onMounted(async () => {
  stats.value = await api.get('/dashboard/stats');
});

const cards = computed(() => [
  { label: '用户总数', value: stats.value.userTotal ?? '-' },
  { label: '车辆总数', value: stats.value.carTotal ?? '-' },
  { label: '订单总数', value: stats.value.orderTotal ?? '-' },
  { label: '已支付订单', value: stats.value.orderPaid ?? '-' },
]);
</script>

<style scoped>
.stat-label {
  color: #909399;
  font-size: 13px;
}
.stat-value {
  font-size: 28px;
  font-weight: 600;
  margin-top: 8px;
}
.tip-card {
  margin-top: 16px;
}
</style>
