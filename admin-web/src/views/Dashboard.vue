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

    <el-card class="tip-card">
      <template #header>
        <div class="card-header">
          <span>近 7 日订单数据</span>
          <span class="sub-tip">按订单创建时间统计</span>
        </div>
      </template>
      <el-table :data="recentList" v-loading="loading" size="small" border show-summary :summary-method="summaryMethod">
        <el-table-column prop="date" label="日期" min-width="120">
          <template #default="{ row }">
            {{ row.date }} <span class="weekday">{{ row.weekday }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="orderTotal" label="订单数（单）" min-width="110" />
        <el-table-column prop="paidCount" label="已支付（单）" min-width="110" />
        <el-table-column label="支付金额（元）" min-width="130">
          <template #default="{ row }">￥{{ row.paidAmount }}</template>
        </el-table-column>
        <el-table-column label="支付率" min-width="110">
          <template #default="{ row }">
            {{ row.orderTotal ? Math.round((row.paidCount / row.orderTotal) * 100) + '%' : '-' }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../api';

const stats = ref({});
const loading = ref(false);

// 近 7 日趋势（后端 /dashboard/stats 一并返回 recent7Days）
const recentList = computed(() => (stats.value.recent7Days && stats.value.recent7Days.list) || []);

onMounted(async () => {
  loading.value = true;
  try {
    stats.value = await api.get('/dashboard/stats');
  } finally {
    loading.value = false;
  }
});

/** 表尾合计：订单数、已支付、支付金额 */
function summaryMethod({ columns }) {
  const s = stats.value.recent7Days && stats.value.recent7Days.summary;
  const vals = {
    orderTotal: s ? s.orderTotal : 0,
    paidCount: s ? s.paidCount : 0,
    paidAmount: s ? s.paidAmount : 0,
  };
  return columns.map((c, index) => {
    if (index === 0) return '近 7 日合计';
    if (c.property === 'orderTotal') return vals.orderTotal;
    if (c.property === 'paidCount') return vals.paidCount;
    if (c.label === '支付金额（元）') return `￥${vals.paidAmount}`;
    return '';
  });
}

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
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sub-tip {
  font-size: 12px;
  color: #909399;
  font-weight: 400;
}
.weekday {
  color: #909399;
  font-size: 12px;
  margin-left: 4px;
}
</style>
