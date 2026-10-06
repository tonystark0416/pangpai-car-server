<template>
  <div>
    <el-card>
      <div class="toolbar">
        <el-input v-model="query.keyword" placeholder="手机号 / 昵称 / openid" clearable style="width: 240px" @keyup.enter="load" />
        <el-button type="primary" @click="load">查询</el-button>
      </div>

      <el-table :data="rows" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="nickname" label="昵称" min-width="120">
          <template #default="{ row }">{{ row.nickname || '-' }}</template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="130">
          <template #default="{ row }">{{ row.phone || '-' }}</template>
        </el-table-column>
        <el-table-column label="授权业务" width="110">
          <template #default="{ row }">
            <el-tag v-for="b in bizList(row)" :key="b" size="small" class="biz-tag">{{ bizName(b) }}</el-tag>
            <span v-if="!row.auth_count">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="order_count" label="订单数" width="90" />
        <el-table-column prop="create_time" label="注册时间" width="170" />
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination class="pager" layout="total, prev, pager, next, sizes" :total="total"
        v-model:current-page="query.page" v-model:page-size="query.pageSize"
        @current-change="load" @size-change="load" />
    </el-card>

    <el-drawer v-model="detailVisible" title="用户详情" size="520px">
      <template v-if="detail">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="用户ID">{{ detail.user.id }}</el-descriptions-item>
          <el-descriptions-item label="昵称">{{ detail.user.nickname || '-' }}</el-descriptions-item>
          <el-descriptions-item label="手机号">{{ detail.user.phone || '-' }}</el-descriptions-item>
          <el-descriptions-item label="注册时间">{{ detail.user.create_time }}</el-descriptions-item>
          <el-descriptions-item label="驾驶证">
            <template v-if="detail.driver">
              {{ detail.driver.driver_idcard_name }} / {{ detail.driver.driver_idcard_number }}
            </template>
            <span v-else>未登记</span>
          </el-descriptions-item>
        </el-descriptions>

        <h4>授权记录（跨小程序）</h4>
        <el-table :data="detail.auths" size="small" border>
          <el-table-column label="业务" width="110">
            <template #default="{ row }">{{ bizName(row.biz_code) }}</template>
          </el-table-column>
          <el-table-column prop="openid" label="openid" min-width="180" show-overflow-tooltip />
          <el-table-column prop="create_time" label="授权时间" width="170" />
        </el-table>

        <h4>最近订单</h4>
        <el-table :data="detail.orders" size="small" border>
          <el-table-column prop="order_sn" label="订单号" min-width="170" show-overflow-tooltip />
          <el-table-column label="总价" width="90">
            <template #default="{ row }">￥{{ row.total_price }}</template>
          </el-table-column>
          <el-table-column label="支付" width="80">
            <template #default="{ row }">
              <el-tag :type="payStatusType(row.pay_status)" size="small">{{ payStatusText(row.pay_status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="履约" width="80">
            <template #default="{ row }">{{ orderStatusText(row.order_status) }}</template>
          </el-table-column>
        </el-table>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import api from '../api';
import { BIZ_NAMES, payStatusText, payStatusType, orderStatusText } from '../constants';

const loading = ref(false);
const rows = ref([]);
const total = ref(0);
const query = reactive({ page: 1, pageSize: 10, keyword: '' });

const detailVisible = ref(false);
const detail = ref(null);

function bizName(code) {
  return BIZ_NAMES[code] || code;
}

function bizList(row) {
  // 后端列表仅返回数量，详情里有完整记录
  return row.biz_code ? [row.biz_code] : [];
}

async function load() {
  loading.value = true;
  try {
    const data = await api.get('/users', { params: query });
    rows.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

async function openDetail(row) {
  detail.value = await api.get(`/users/${row.id}`);
  detailVisible.value = true;
}

onMounted(load);
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
.biz-tag {
  margin-right: 4px;
}
h4 {
  margin: 20px 0 10px;
}
</style>
