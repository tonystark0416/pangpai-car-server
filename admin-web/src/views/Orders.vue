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
        <el-form-item>
          <el-dropdown trigger="click" @command="handleExport">
            <el-button type="success" :loading="exporting">导出 Excel</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="filtered">按当前筛选条件导出</el-dropdown-item>
                <el-dropdown-item command="all">导出全部订单</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
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
        <el-table-column prop="uid" label="用户ID" width="90" />
        <el-table-column prop="contact_phone" label="联系电话" width="120" />
        <el-table-column label="租车天数" width="90">
          <template #default="{ row }">{{ row.rent_day }} 天</template>
        </el-table-column>
        <el-table-column label="日租金单价" width="100">
          <template #default="{ row }">￥{{ row.rent_day_price }}</template>
        </el-table-column>
        <el-table-column label="车辆租金合计" width="110">
          <template #default="{ row }">￥{{ row.rent_total_price }}</template>
        </el-table-column>
        <el-table-column label="保险费单价" width="100">
          <template #default="{ row }">￥{{ row.server_day_price }}</template>
        </el-table-column>
        <el-table-column label="保险费合计" width="100">
          <template #default="{ row }">￥{{ row.server_total_price }}</template>
        </el-table-column>
        <el-table-column label="司机单价" width="100">
          <template #default="{ row }">￥{{ row.driver_price || 0 }}</template>
        </el-table-column>
        <el-table-column label="司机合计" width="100">
          <template #default="{ row }">￥{{ row.driver_total_price || 0 }}</template>
        </el-table-column>
        <el-table-column label="整备费" width="100">
          <template #default="{ row }">￥{{ row.clean_price || 0 }}</template>
        </el-table-column>
        <el-table-column label="订单原价" width="100">
          <template #default="{ row }">￥{{ row.total_price }}</template>
        </el-table-column>
        <el-table-column label="优惠券" min-width="130">
          <template #default="{ row }">
            <span v-if="row.coupon_sn">
              <el-tooltip :content="`券码 ${row.coupon_sn}`" placement="top">
                <el-tag size="small" type="warning">{{ row.coupon_name || '优惠券' }}</el-tag>
              </el-tooltip>
            </span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="优惠金额" width="100">
          <template #default="{ row }">
            <span v-if="Number(row.discount_price) > 0" class="amount-discount">
              -￥{{ Number(row.discount_price).toFixed(2) }}
            </span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="实付金额" width="110">
          <template #default="{ row }">
            <span class="amount-real">￥{{ realAmount(row) }}</span>
          </template>
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
        <el-table-column label="微信支付单号" width="220">
          <template #default="{ row }">{{ row.transaction_id || '-' }}</template>
        </el-table-column>
        <el-table-column label="支付时间" width="170">
          <template #default="{ row }">{{ row.pay_time ? formatDateTime(row.pay_time) : '-' }}</template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.create_time) }}</template>
        </el-table-column>
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
    <el-drawer v-model="detailVisible" title="订单详情" size="520px">
      <div v-if="detail">
        <!-- 车辆图片（点击可放大预览） -->
        <div v-if="detail.image_url" class="detail-car">
          <el-image
            :src="detail.image_url"
            :preview-src-list="[detail.image_url]"
            preview-teleported
            fit="cover"
            class="detail-car-img"
          />
          <div class="detail-car-name">{{ detail.car_name }}</div>
        </div>
        <el-empty v-else :image-size="60" description="该订单车辆暂无图片" />
        <el-descriptions :column="1" border class="detail-desc">
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
        <el-descriptions-item label="订单原价">￥{{ Number(detail.total_price).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="优惠券">
          <span v-if="detail.coupon_sn">
            <el-tag size="small" type="warning">{{ detail.coupon_name || '优惠券' }}</el-tag>
            <span class="coupon-code">券码 {{ detail.coupon_sn }}</span>
          </span>
          <span v-else>未使用</span>
        </el-descriptions-item>
        <el-descriptions-item label="优惠金额">
          <span v-if="Number(detail.discount_price) > 0" class="amount-discount">
            -￥{{ Number(detail.discount_price).toFixed(2) }}
          </span>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="实付金额">
          <span class="amount-real">￥{{ realAmount(detail) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="支付状态">
          <el-tag :type="payStatusType(detail.pay_status)" size="small">{{ payStatusText(detail.pay_status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="微信支付单号">{{ detail.transaction_id || '-' }}</el-descriptions-item>
        <el-descriptions-item label="支付时间">{{ formatDateTime(detail.pay_time) }}</el-descriptions-item>
        <el-descriptions-item label="履约状态">
          <el-tag :type="orderStatusType(detail.order_status)" size="small">{{ orderStatusText(detail.order_status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="取车">
          {{ detail.pickup_address }}（{{ formatDateTime(detail.pickup_time) }}）
        </el-descriptions-item>
        <el-descriptions-item label="还车">
          {{ detail.return_address }}（{{ formatDateTime(detail.return_time) }}）
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDateTime(detail.create_time) }}</el-descriptions-item>
      </el-descriptions>
        <div class="detail-actions">
          <el-button type="primary" plain @click="openAddress(detail)">修改取车/还车地址</el-button>
          <el-button type="danger" plain :disabled="detail.pay_status != 1" @click="openRefund(detail)">
            退款
          </el-button>
        </div>
      </div>
    </el-drawer>

    <!-- 修改取车/还车地址 -->
    <el-dialog v-model="addressVisible" title="修改取车 / 还车地址" width="420px">
      <el-form :model="addressForm" label-width="80px">
        <el-form-item label="取车地址" required>
          <el-input v-model="addressForm.pickup_address" maxlength="100" show-word-limit placeholder="请输入取车地址" />
        </el-form-item>
        <el-form-item label="还车地址" required>
          <el-input v-model="addressForm.return_address" maxlength="100" show-word-limit placeholder="请输入还车地址" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addressVisible = false">取消</el-button>
        <el-button type="primary" :loading="addressSaving" @click="submitAddress">保存</el-button>
      </template>
    </el-dialog>

    <!-- 退款 -->
    <el-dialog v-model="refundVisible" title="订单退款" width="420px">
      <el-alert type="warning" :closable="false" show-icon
        title="退款成功后订单将变为「已退款 / 已取消」，不可撤销" style="margin-bottom: 16px" />
      <el-form label-width="90px">
        <el-form-item label="订单号">{{ refundForm.order_sn }}</el-form-item>
        <el-form-item label="订单原价">￥{{ Number(refundForm.total_price).toFixed(2) }}</el-form-item>
        <el-form-item v-if="Number(refundForm.discount_price) > 0" label="优惠券抵扣">
          <span class="amount-discount">-￥{{ Number(refundForm.discount_price).toFixed(2) }}</span>
          <span class="coupon-code">{{ refundForm.coupon_name || '优惠券' }}（{{ refundForm.coupon_sn }}）</span>
        </el-form-item>
        <el-form-item label="实付金额">
          <span class="amount-real">￥{{ Number(refundForm.pay_amount).toFixed(2) }}</span>
        </el-form-item>
        <el-alert v-if="Number(refundForm.discount_price) > 0" type="info" :closable="false" show-icon
          title="该订单使用了优惠券，微信侧最多只能退用户的实付金额；优惠券将在退款成功后退回用户账户"
          style="margin-bottom: 16px" />
        <el-form-item label="退款金额">
          <el-input-number v-model="refundForm.refund_fee" :min="0.01" :max="Number(refundForm.pay_amount)"
            :precision="2" :step="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="退款原因">
          <el-input v-model="refundForm.refund_desc" maxlength="50" placeholder="选填，如：用户取消订单" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="refundVisible = false">取消</el-button>
        <el-button type="danger" :loading="refundSaving" @click="submitRefund">确认退款</el-button>
      </template>
    </el-dialog>

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
import { formatDateTime } from '../utils/format';

const loading = ref(false);
const rows = ref([]);
const total = ref(0);
const query = reactive({ page: 1, pageSize: 10, keyword: '', pay_status: '', order_status: '' });

const detailVisible = ref(false);
const detail = ref(null);

const statusVisible = ref(false);
const statusForm = reactive({ id: null, order_status: 0 });

const addressVisible = ref(false);
const addressSaving = ref(false);
const addressForm = reactive({ id: null, pickup_address: '', return_address: '' });

const refundVisible = ref(false);
const refundSaving = ref(false);
/**
 * v1.7.3：退款以**实付金额**为准。
 * total_price 是订单原价，用券后 ≠ 用户实际支付，拿它当退款上限会导致微信侧退款失败
 * （退款金额不能超过原支付金额），所以这里单独保存 pay_amount 并作为默认值与最大值。
 */
const refundForm = reactive({
  id: null,
  order_sn: '',
  total_price: 0,
  discount_price: 0,
  pay_amount: 0, // 用户实付，退款的默认金额与上限
  coupon_sn: '',
  coupon_name: '',
  refund_fee: 0,
  refund_desc: '',
});

/** 实付金额展示（历史订单 pay_amount 可能为空，兜底取原价） */
function realAmount(row) {
  const v = Number(row && row.pay_amount);
  const fallback = Number(row && row.total_price) || 0;
  return (v > 0 ? v : fallback).toFixed(2);
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

const exporting = ref(false);

/**
 * 导出 Excel（v1.6.13）
 * filtered=按当前筛选条件；all=忽略条件导出全部
 */
async function handleExport(scope) {
  const params = { scope };
  if (scope === 'filtered') {
    // 与列表加载同源，保证导出内容和页面上看到的筛选结果一致
    if (query.keyword) params.keyword = query.keyword;
    if (query.pay_status !== '') params.pay_status = query.pay_status;
    if (query.order_status !== '') params.order_status = query.order_status;
  }
  exporting.value = true;
  try {
    const res = await api.get('/orders/export', { params, responseType: 'blob', timeout: 60000 });
    const blob = res.data;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    // 从响应头取文件名，取不到则本地生成
    const disposition = res.headers['content-disposition'] || '';
    const match = /filename\*=UTF-8''(.+)/.exec(disposition);
    a.href = url;
    a.download = match ? decodeURIComponent(match[1]) : `订单导出_${new Date().getTime()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    ElMessage.success('导出成功');
  } catch (e) {
    // 拦截器已对非 blob 错误做提示，这里仅处理 blob 类型的解析失败
    ElMessage.error('导出失败，请稍后重试');
  } finally {
    exporting.value = false;
  }
}

function openStatus(row) {
  statusForm.id = row.id;
  statusForm.order_status = row.order_status;
  statusVisible.value = true;
}

function openAddress(row) {
  addressForm.id = row.id;
  addressForm.pickup_address = row.pickup_address || '';
  addressForm.return_address = row.return_address || '';
  addressVisible.value = true;
}

function openRefund(row) {
  refundForm.id = row.id;
  refundForm.order_sn = row.order_sn;
  refundForm.total_price = Number(row.total_price) || 0;
  refundForm.discount_price = Number(row.discount_price) || 0;
  refundForm.coupon_sn = row.coupon_sn || '';
  refundForm.coupon_name = row.coupon_name || '';
  // v1.7.3：默认退「实付金额」而非原价（历史订单 pay_amount 为空时兜底原价）
  const paid = Number(row.pay_amount);
  refundForm.pay_amount = paid > 0 ? paid : Number(row.total_price) || 0;
  refundForm.refund_fee = refundForm.pay_amount;
  refundForm.refund_desc = '';
  refundVisible.value = true;
}

async function submitRefund() {
  // v1.7.3：前端再拦一道——退款超过实付金额时微信侧必定失败，与其报错不如提前提示
  if (!refundForm.refund_fee || Number(refundForm.refund_fee) <= 0) {
    ElMessage.warning('请填写退款金额');
    return;
  }
  if (Number(refundForm.refund_fee) > Number(refundForm.pay_amount)) {
    ElMessage.error(
      `退款金额不能超过实付金额 ￥${Number(refundForm.pay_amount).toFixed(2)}` +
        (Number(refundForm.discount_price) > 0 ? '（订单原价未全部实付，优惠券部分不可退）' : '')
    );
    return;
  }
  refundSaving.value = true;
  try {
    const data = await api.post(`/orders/${refundForm.id}/refund`, {
      refund_fee: refundForm.refund_fee,
      refund_desc: refundForm.refund_desc || '后台操作退款',
    });
    // 响应拦截器已返回 data 部分（含 refund_fee、wx_refund_id）
    ElMessage.success(`退款成功，已退 ￥${data.refund_fee}`);
    refundVisible.value = false;
    if (detail.value) detail.value = { ...detail.value, pay_status: 2, order_status: 4 };
    load();
  } finally {
    refundSaving.value = false;
  }
}

async function submitAddress() {
  if (!addressForm.pickup_address.trim() || !addressForm.return_address.trim()) {
    ElMessage.warning('取车地址和还车地址均不能为空');
    return;
  }
  addressSaving.value = true;
  try {
    await api.put(`/orders/${addressForm.id}/address`, {
      pickup_address: addressForm.pickup_address.trim(),
      return_address: addressForm.return_address.trim(),
    });
    ElMessage.success('地址已更新');
    addressVisible.value = false;
    detail.value = { ...detail.value, pickup_address: addressForm.pickup_address.trim(), return_address: addressForm.return_address.trim() };
    load();
  } finally {
    addressSaving.value = false;
  }
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
/* v1.7.3：金额展示样式——实付加粗突出，优惠用红色表示抵扣 */
.amount-real {
  font-weight: 600;
}
.amount-discount {
  color: #e6a23c;
  font-weight: 600;
}
.coupon-code {
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
}
.filter-card :deep(.el-form-item) {
  margin-bottom: 0;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
.detail-car {
  margin-bottom: 16px;
  text-align: center;
}
.detail-car-img {
  width: 100%;
  max-height: 220px;
  border-radius: 8px;
  cursor: zoom-in;
}
.detail-car-name {
  margin-top: 8px;
  font-size: 14px;
  color: #606266;
}
.detail-desc {
  margin-top: 8px;
}
.detail-actions {
  margin-top: 16px;
  text-align: right;
}
</style>
