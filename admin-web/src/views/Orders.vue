<template>
  <div>
    <!-- 筛选栏 -->
    <el-card class="filter-card">
      <el-form inline @submit.prevent>
        <el-form-item label="关键词">
          <el-input v-model="query.keyword" placeholder="订单号 / 手机号" clearable style="width: 200px" @keyup.enter="load" />
        </el-form-item>
        <el-form-item label="支付状态">
          <el-select v-model="query.pay_status" clearable placeholder="全部" style="width: 120px">
            <el-option v-for="(v, k) in PAY_STATUS" :key="k" :label="v.text" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item label="履约状态">
          <el-select v-model="query.order_status" clearable placeholder="全部" style="width: 120px">
            <el-option v-for="(v, k) in ORDER_STATUS" :key="k" :label="v.text" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="load">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 订单表格 -->
    <el-card>
      <el-table :data="rows" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="order_sn" label="订单号" width="190" />
        <el-table-column label="车辆" min-width="140">
          <template #default="{ row }">{{ row.car_name || `#${row.car_id}` }}</template>
        </el-table-column>
        <el-table-column prop="contact_phone" label="联系电话" width="120" />
        <el-table-column label="总价" width="100">
          <template #default="{ row }">￥{{ row.total_price }}</template>
        </el-table-column>
        <el-table-column label="支付状态" width="100">
          <template #default="{ row }">
            <el-tag :type="payStatusType(row.pay_status)" size="small">{{ payStatusText(row.pay_status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="履约状态" width="100">
          <template #default="{ row }">
            <el-tag :type="orderStatusType(row.order_status)" size="small" effect="plain">
              {{ orderStatusText(row.order_status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="create_time" label="创建时间" width="170" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button link type="warning" @click="openStatus(row)">流转</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        class="pager"
        layout="total, prev, pager, next, sizes"
        :total="total"
        v-model:current-page="query.page"
        v-model:page-size="query.pageSize"
        @current-change="load"
        @size-change="load"
      />
    </el-card>

    <!-- 详情抽屉 -->
    <el-drawer v-model="detailVisible" title="订单详情" size="480px">
      <el-descriptions :column="1" border v-if="detail">
        <el-descriptions-item label="订单号">{{ detail.order_sn }}</el-descriptions-item>
        <el-descriptions-item label="车辆">{{ detail.car_name }}</el-descriptions-item>
        <el-descriptions-item label="下单用户">
          {{ detail.userInfo ? `${detail.userInfo.nickname || detail.userInfo.username || ''} (#${detail.uid})` : `#${detail.uid}` }}
        </el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ detail.contact_phone }}</el-descriptions-item>
        <el-descriptions-item label="租车天数">{{ detail.rent_day }} 天</el-descriptions-item>
        <el-descriptions-item label="日租金">￥{{ detail.rent_day_price }}</el-descriptions-item>
        <el-descriptions-item label="车辆租金">￥{{ detail.rent_total_price }}</el-descriptions-item>
        <el-descriptions-item label="保险费">￥{{ detail.server_total_price }}</el-descriptions-item>
        <el-descriptions-item label="司机费">￥{{ detail.driver_total_price }}</el-descriptions-item>
        <el-descriptions-item label="总价">￥{{ detail.total_price }}</el-descriptions-item>
        <el-descriptions-item label="支付状态">
          <el-tag :type="payStatusType(detail.pay_status)" size="small">{{ payStatusText(detail.pay_status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="微信支付单号">{{ detail.transaction_id || '-' }}</el-descriptions-item>
        <el-descriptions-item label="支付时间">{{ detail.pay_time || '-' }}</el-descriptions-item>
        <el-descriptions-item label="履约状态">
          <el-tag :type="orderStatusType(detail.order_status)" size="small">{{ orderStatusText(detail.order_status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="取车">{{ detail.pickup_address }}（{{ formatTs(detail.pickup_time) }}）</el-descriptions-item>
        <el-descriptions-item label="还车">{{ detail.return_address }}（{{ formatTs(detail.return_time) }}）</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ detail.create_time }}</el-descriptions-item>
      </el-descriptions>
    </el-drawer>

    <!-- 状态流转 -->
    <el-dialog v-model="statusVisible" title="订单状态流转" width="360px">
      <el-select v-model="statusForm.order_status" style="width: 100%">
        <el-option v-for="(v, k) in ORDER_STATUS" :key="k" :label="v.text" :value="Number(k)" />
      </el-select>
      <template #footer>
        <el-button @click="statusVisible = false">取消</el-button>
        <el-button type="primary" @click="submitStatus">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import api from '../api';
import { PAY_STATUS, ORDER_STATUS, payStatusText, payStatusType, orderStatusText, orderStatusType } from '../constants';

const loading = ref(false);
const rows = ref([]);
const total = ref(0);
const query = reactive({ page: 1, pageSize: 10, keyword: '', pay_status: '', order_status: '' });

const detailVisible = ref(false);
const detail = ref(null);

const statusVisible = ref(false);
const statusForm = reactive({ id: null, order_status: 0 });

function formatTs(ts) {
  if (!ts) return '-';
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString('zh-CN', { hour12: false });
}

async function load() {
  loading.value = true;
  try {
    const data = await api.get('/orders', { params: query });
    rows.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

async function openDetail(row) {
  detail.value = await api.get(`/orders/${row.id}`);
  detailVisible.value = true;
}

function openStatus(row) {
  statusForm.id = row.id;
  statusForm.order_status = row.order_status;
  statusVisible.value = true;
}

async function submitStatus() {
  await api.put(`/orders/${statusForm.id}/status`, { order_status: statusForm.order_status });
  ElMessage.success('状态已更新');
  statusVisible.value = false;
  load();
}

onMounted(load);
</script>

<style scoped>
.filter-card {
  margin-bottom: 16px;
}
.filter-card :deep(.el-form-item) {
  margin-bottom: 0;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
