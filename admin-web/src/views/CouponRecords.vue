<template>
  <div>
    <el-page-header @back="$router.push('/coupons')" class="page-header">
      <template #content>
        <span class="header-title">领券记录</span>
        <span v-if="coupon.name" class="header-sub">「{{ coupon.name }}」￥{{ coupon.amount }}</span>
      </template>
      <template #extra>
        <el-button @click="$router.push('/coupons')">返回列表</el-button>
      </template>
    </el-page-header>

    <!-- 批次信息 -->
    <el-card v-loading="loading" class="info-card">
      <el-descriptions :column="4" border size="small" title="批次信息">
        <el-descriptions-item label="批次号">{{ coupon.coupon_id || '-' }}</el-descriptions-item>
        <el-descriptions-item label="券名称">{{ coupon.name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="面额">￥{{ coupon.amount }}</el-descriptions-item>
        <el-descriptions-item label="批次状态">
          <el-tag :type="couponStatusType(coupon.status)" size="small">{{ coupon.status_text || '-' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="领取时间">
          {{ coupon.receive_start_time }} ~ {{ coupon.receive_end_time }}
        </el-descriptions-item>
        <el-descriptions-item label="使用时间">
          {{ coupon.use_start_time }} ~ {{ coupon.use_end_time }}
        </el-descriptions-item>
        <el-descriptions-item label="库存">
          剩余 {{ coupon.remain_stock }} / 总量 {{ coupon.total_stock }}
        </el-descriptions-item>
        <el-descriptions-item label="领取进度">
          已领 {{ total }} 张
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 统计 -->
    <el-row :gutter="12" class="stat-row">
      <el-col :span="4">
        <el-card shadow="never">
          <div class="stat-label">累计领取</div>
          <div class="stat-value">{{ total }}</div>
        </el-card>
      </el-col>
      <el-col :span="5">
        <el-card shadow="never">
          <div class="stat-label">未使用</div>
          <div class="stat-value">{{ summary.unused }}</div>
        </el-card>
      </el-col>
      <el-col :span="5">
        <el-card shadow="never">
          <div class="stat-label">已使用</div>
          <div class="stat-value">{{ summary.used }}</div>
        </el-card>
      </el-col>
      <el-col :span="5">
        <el-card shadow="never">
          <div class="stat-label">已作废</div>
          <div class="stat-value">{{ summary.invalid }}</div>
        </el-card>
      </el-col>
      <el-col :span="5">
        <el-card shadow="never">
          <div class="stat-label">已核销金额</div>
          <div class="stat-value amount-discount">￥{{ summary.usedAmount }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 筛选 -->
    <el-card>
      <div class="toolbar">
        <el-input v-model="query.keyword" placeholder="手机号 / 昵称 / 账号名 / 券码" clearable
          style="width: 260px" @keyup.enter="load" />
        <el-select v-model="query.status" clearable placeholder="全部状态" style="width: 130px">
          <el-option label="未使用" :value="0" />
          <el-option label="已使用" :value="1" />
          <el-option label="已作废" :value="2" />
        </el-select>
        <el-button type="primary" @click="load">查询</el-button>
        <el-button @click="resetQuery">重置</el-button>
      </div>

      <el-table :data="rows" v-loading="loading" stripe>
        <el-table-column prop="coupon_sn" label="券码" min-width="200" />
        <el-table-column label="领取用户" min-width="180">
          <template #default="{ row }">
            <div>{{ row.nickname || row.username || `用户${row.uid}` }}</div>
            <div class="sub-fee">{{ row.phone || '（未绑定手机号）' }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="uid" label="用户ID" width="90" />
        <el-table-column label="第几张" width="90">
          <template #default="{ row }">第 {{ row.receive_seq }} 张</template>
        </el-table-column>
        <el-table-column label="面额" width="90">
          <template #default="{ row }"><b>￥{{ row.amount }}</b></template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ row.status_text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="领取时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.receive_time) }}</template>
        </el-table-column>
        <el-table-column label="使用时间" width="170">
          <template #default="{ row }">{{ row.use_time ? formatDateTime(row.use_time) : '-' }}</template>
        </el-table-column>
        <el-table-column label="关联订单" min-width="190">
          <template #default="{ row }">
            <span v-if="row.order_sn">{{ row.order_sn }}</span>
            <span v-else class="sub-fee">-</span>
          </template>
        </el-table-column>
        <el-table-column label="有效期" width="200">
          <template #default="{ row }">
            <span class="sub-fee">{{ formatDateTime(row.use_start_time) }} ~<br />{{ formatDateTime(row.use_end_time) }}</span>
          </template>
        </el-table-column>
        <el-empty v-if="!loading && rows.length === 0" description="该批次暂无领券记录" />
      </el-table>

      <el-pagination class="pager" background layout="total, sizes, prev, pager, next"
        :total="total" v-model:current-page="query.page" v-model:page-size="query.pageSize"
        :page-sizes="[10, 20, 50]" @size-change="load" @current-change="load" />
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../api';
import { formatDateTime } from '../utils/format';

const route = useRoute();
// 路由参数是 pp_coupon 的**数字主键**，不是批次号
const couponId = route.params.id;

const loading = ref(false);
const rows = ref([]);
const total = ref(0);
const coupon = ref({});
const summary = reactive({ unused: 0, used: 0, invalid: 0, usedAmount: 0 });
const query = reactive({ page: 1, pageSize: 10, keyword: '', status: '' });

/** 用户券状态：0未使用 1已使用 2已作废 */
function statusType(status) {
  return { 0: 'warning', 1: 'success', 2: 'info' }[status] || 'info';
}

function couponStatusType(status) {
  return { 0: 'info', 1: 'success', 2: 'danger' }[status] || 'info';
}

async function load() {
  loading.value = true;
  try {
    const params = { page: query.page, pageSize: query.pageSize };
    if (query.keyword) params.keyword = query.keyword;
    if (query.status !== '') params.status = query.status;
    const data = await api.get(`/coupons/${couponId}/records`, { params });
    coupon.value = data.coupon || {};
    rows.value = data.list;
    total.value = data.total;
    Object.assign(summary, data.summary || {});
  } finally {
    loading.value = false;
  }
}

function resetQuery() {
  query.keyword = '';
  query.status = '';
  query.page = 1;
  load();
}

onMounted(load);
</script>

<style scoped>
.page-header {
  margin-bottom: 16px;
}
.header-title {
  font-size: 16px;
  font-weight: 600;
}
.header-sub {
  margin-left: 8px;
  font-size: 13px;
  color: #909399;
}
.info-card {
  margin-bottom: 16px;
}
.stat-row {
  margin-bottom: 16px;
}
.stat-label {
  color: #909399;
  font-size: 13px;
}
.stat-value {
  font-size: 24px;
  font-weight: 600;
  margin-top: 6px;
}
.toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}
.sub-fee {
  font-size: 12px;
  color: #909399;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
.amount-discount {
  color: #e6a23c;
}
</style>
