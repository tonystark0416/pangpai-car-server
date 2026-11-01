<template>
  <div>
    <!-- 统计卡片：一眼看清收了多少、退了多少 -->
    <el-row :gutter="12" class="stat-row">
      <el-col :span="5">
        <el-card shadow="never">
          <div class="stat-label">收款笔数</div>
          <div class="stat-value">{{ summary.payCount }}</div>
        </el-card>
      </el-col>
      <el-col :span="5">
        <el-card shadow="never">
          <div class="stat-label">收款金额</div>
          <div class="stat-value amount-pay">￥{{ fmtMoney(summary.payAmount) }}</div>
        </el-card>
      </el-col>
      <el-col :span="4">
        <el-card shadow="never">
          <div class="stat-label">退款笔数</div>
          <div class="stat-value">{{ summary.refundCount }}</div>
        </el-card>
      </el-col>
      <el-col :span="5">
        <el-card shadow="never">
          <div class="stat-label">退款金额</div>
          <div class="stat-value amount-refund">￥{{ fmtMoney(summary.refundAmount) }}</div>
        </el-card>
      </el-col>
      <el-col :span="5">
        <el-card shadow="never">
          <div class="stat-label">净收入</div>
          <div class="stat-value" :class="summary.netAmount < 0 ? 'amount-refund' : 'amount-pay'">
            ￥{{ fmtMoney(summary.netAmount) }}
          </div>
          <div v-if="summary.netAmount < 0" class="sub-fee">退得比收的多，需人工核对</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card>
      <div class="toolbar">
        <el-input v-model="query.keyword" placeholder="订单号 / 微信单号 / 退款单号 / 手机号" clearable
          style="width: 280px" @keyup.enter="load" />
        <el-select v-model="query.record_type" clearable placeholder="全部类型" style="width: 120px">
          <el-option label="支付" :value="1" />
          <el-option label="退款" :value="2" />
        </el-select>
        <el-select v-model="query.status" clearable placeholder="全部状态" style="width: 140px">
          <el-option v-for="s in filteredStatusOptions" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
        <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期"
          end-placeholder="结束日期" style="width: 240px" />
        <el-button type="primary" @click="load">查询</el-button>
        <el-button type="success" :loading="exporting" @click="exportExcel">导出 Excel</el-button>
      </div>

      <el-table :data="rows" v-loading="loading" stripe>
        <el-table-column prop="order_sn" label="订单号" width="180" />
        <el-table-column label="类型" width="80">
          <template #default="{ row }">
            <el-tag :type="row.record_type === 1 ? 'success' : 'warning'" size="small">
              {{ row.record_type_text }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="110">
          <template #default="{ row }">
            <b :class="row.record_type === 1 ? 'amount-pay' : 'amount-refund'">
              {{ row.record_type === 1 ? '+' : '-' }}￥{{ fmtMoney(row.amount) }}
            </b>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ row.status_text || row.status || '-' }}</el-tag>
            <!-- 退款到银行卡是异步的，明确提示运营「钱还在路上」 -->
            <div v-if="row.fund_change === 'N'" class="sub-fee">银行卡异步到账</div>
          </template>
        </el-table-column>
        <el-table-column label="微信支付单号" width="200">
          <template #default="{ row }">
            <span class="sub-fee">{{ row.transaction_id || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="退款单号" width="180">
          <template #default="{ row }">
            <span class="sub-fee">{{ row.refund_id || row.out_refund_no || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="bank_type" label="付款银行" width="100" />
        <el-table-column label="微信时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.trade_time) }}</template>
        </el-table-column>
        <el-table-column label="用户" width="140">
          <template #default="{ row }">
            {{ row.nickname || '-' }}
            <div class="sub-fee">{{ row.phone || '' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="100">
          <template #default="{ row }">
            <span class="sub-fee">{{ row.source_text }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button link type="warning" :loading="syncingId === row.id" @click="syncOne(row)">同步</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination class="pager" layout="total, prev, pager, next, sizes" :total="total"
        v-model:current-page="query.page" v-model:page-size="query.pageSize" @current-change="load"
        @size-change="load" />
    </el-card>

    <!-- 详情抽屉：含微信原始返回，便于逐字段核对 -->
    <el-drawer v-model="detailVisible" title="流水详情" size="600px">
      <el-descriptions :column="1" border v-if="detail.id">
        <el-descriptions-item label="订单号">{{ detail.order_sn }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ detail.record_type_text }}</el-descriptions-item>
        <el-descriptions-item label="金额">￥{{ fmtMoney(detail.amount) }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="statusType(detail.status)" size="small">{{ detail.status_text || detail.status }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="商户订单号">{{ detail.out_trade_no || '-' }}</el-descriptions-item>
        <el-descriptions-item label="微信支付单号">{{ detail.transaction_id || '-' }}</el-descriptions-item>
        <el-descriptions-item label="商户退款单号">{{ detail.out_refund_no || '-' }}</el-descriptions-item>
        <el-descriptions-item label="微信退款单号">{{ detail.refund_id || '-' }}</el-descriptions-item>
        <el-descriptions-item label="付款银行">{{ detail.bank_type || '-' }}</el-descriptions-item>
        <el-descriptions-item label="到账方式">
          {{ detail.fund_change === 'Y' ? '即时到账（零钱）' : detail.fund_change === 'N' ? '银行卡异步到账' : '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="微信时间">{{ formatDateTime(detail.trade_time) }}</el-descriptions-item>
        <el-descriptions-item label="来源">{{ detail.source_text }}</el-descriptions-item>
        <el-descriptions-item label="记录时间">{{ formatDateTime(detail.create_time) }}</el-descriptions-item>
      </el-descriptions>

      <div v-if="detail.raw" class="raw-box">
        <div class="raw-title">微信原始返回</div>
        <pre>{{ JSON.stringify(detail.raw, null, 2) }}</pre>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import api from '../api';
import { formatDateTime } from '../utils/format';

const loading = ref(false);
const exporting = ref(false);
const syncingId = ref(null);
const rows = ref([]);
const total = ref(0);
const dateRange = ref([]);
const detailVisible = ref(false);
const detail = ref({});

const query = reactive({ page: 1, pageSize: 20, record_type: '', status: '', keyword: '' });
const summary = reactive({ payCount: 0, payAmount: 0, refundCount: 0, refundAmount: 0, netAmount: 0 });

/**
 * 状态筛选项：支付与退款的状态集合不同（微信 trade_state / refund_status），
 * 这里按当前选择的类型动态切换，避免「支付」类型下出现退款状态让人困惑。
 * 注意 SUCCESS 对两者通用（支付成功 / 退款成功），故只保留一项。
 */
const PAY_STATUS_OPTIONS = [
  { label: '支付成功', value: 'SUCCESS' },
  { label: '转入退款', value: 'REFUND' },
  { label: '未支付', value: 'NOTPAY' },
  { label: '已关闭', value: 'CLOSED' },
  { label: '支付失败', value: 'PAYERROR' },
];
const REFUND_STATUS_OPTIONS = [
  { label: '退款成功', value: 'SUCCESS' },
  { label: '退款处理中', value: 'PROCESSING' },
  { label: '退款异常', value: 'CHANGE' },
  { label: '退款失败', value: 'FAIL' },
];

const filteredStatusOptions = computed(() => {
  if (Number(query.record_type) === 1) return PAY_STATUS_OPTIONS;
  if (Number(query.record_type) === 2) return REFUND_STATUS_OPTIONS;
  // 未选类型时两类合并（SUCCESS 只出现一次，避免下拉重复项）
  return [...PAY_STATUS_OPTIONS, ...REFUND_STATUS_OPTIONS.slice(1)];
});

function fmtMoney(v) {
  return Number(v || 0).toFixed(2);
}

function statusType(status) {
  return (
    {
      SUCCESS: 'success',
      REFUND: 'warning',
      NOTPAY: 'info',
      CLOSED: 'info',
      PAYERROR: 'danger',
      PROCESSING: 'warning',
      CHANGE: 'danger',
      FAIL: 'danger',
      REFUNDREC: 'warning',
    }[status] || 'info'
  );
}

function buildParams() {
  const p = { page: query.page, pageSize: query.pageSize };
  if (query.record_type !== '') p.record_type = query.record_type;
  if (query.status) p.status = query.status;
  if (query.keyword) p.keyword = query.keyword;
  if (dateRange.value && dateRange.value.length === 2) {
    // 结束日期补到当天 23:59:59，否则当天的数据会被漏掉
    p.start = `${dateRange.value[0]} 00:00:00`;
    p.end = `${dateRange.value[1]} 23:59:59`;
  }
  return p;
}

async function load() {
  loading.value = true;
  try {
    const data = await api.get('/pay-records', { params: buildParams() });
    rows.value = data.list;
    total.value = data.total;
    Object.assign(summary, data.summary);
  } finally {
    loading.value = false;
  }
}

async function openDetail(row) {
  detail.value = await api.get(`/pay-records/${row.id}`);
  detailVisible.value = true;
}

/**
 * 同步单条：调微信查单/退款查询拿最新状态写回本地
 * 列表本身不实时调微信——避免慢与被限频，由人按需触发
 */
async function syncOne(row) {
  syncingId.value = row.id;
  try {
    const data = await api.post(`/pay-records/${row.id}/sync`);
    ElMessage.success(data.msg || '已同步');
    load();
  } catch (e) {
    /* 拦截器已提示错误 */
  } finally {
    syncingId.value = null;
  }
}

async function exportExcel() {
  exporting.value = true;
  try {
    const params = {};
    if (query.record_type !== '') params.record_type = query.record_type;
    if (query.status) params.status = query.status;
    if (query.keyword) params.keyword = query.keyword;
    if (dateRange.value && dateRange.value.length === 2) {
      params.start = `${dateRange.value[0]} 00:00:00`;
      params.end = `${dateRange.value[1]} 23:59:59`;
    }
    const res = await api.get('/pay-records/export', { params, responseType: 'blob', timeout: 60000 });
    const url = window.URL.createObjectURL(res.data);
    const a = document.createElement('a');
    const disposition = res.headers['content-disposition'] || '';
    const match = /filename\*=UTF-8''(.+)/.exec(disposition);
    a.href = url;
    a.download = match ? decodeURIComponent(match[1]) : `支付流水_${new Date().getTime()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    ElMessage.success('导出成功');
  } catch (e) {
    ElMessage.error('导出失败，请稍后重试');
  } finally {
    exporting.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.stat-row {
  margin-bottom: 12px;
}
.stat-label {
  font-size: 12px;
  color: #909399;
}
.stat-value {
  font-size: 20px;
  font-weight: 600;
  margin-top: 4px;
}
.amount-pay {
  color: #67c23a;
}
.amount-refund {
  color: #e6a23c;
}
.sub-fee {
  font-size: 12px;
  color: #909399;
}
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.pager {
  margin-top: 12px;
  justify-content: flex-end;
}
.raw-box {
  margin-top: 16px;
}
.raw-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}
.raw-box pre {
  background: #f5f7fa;
  padding: 10px;
  border-radius: 4px;
  font-size: 12px;
  max-height: 320px;
  overflow: auto;
}
</style>
