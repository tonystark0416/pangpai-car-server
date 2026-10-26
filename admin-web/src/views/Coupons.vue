<template>
  <div>
    <el-card>
      <div class="toolbar">
        <el-input v-model="query.name" placeholder="券名称 / 批次号" clearable style="width: 220px" @keyup.enter="load" />
        <el-select v-model="query.status" clearable placeholder="全部状态" style="width: 120px">
          <el-option label="未开始" :value="0" />
          <el-option label="活动中" :value="1" />
          <el-option label="已废弃" :value="2" />
        </el-select>
        <el-button type="primary" @click="load">查询</el-button>
        <el-button type="success" @click="openForm()">新建优惠券</el-button>
      </div>

      <el-table :data="rows" v-loading="loading" stripe>
        <el-table-column prop="coupon_id" label="批次号" width="180" />
        <el-table-column prop="name" label="券名称" min-width="120" />
        <el-table-column label="面额" width="100">
          <template #default="{ row }"><b>￥{{ row.amount }}</b></template>
        </el-table-column>
        <el-table-column label="库存" width="120">
          <template #default="{ row }">
            {{ row.remain_stock }} / {{ row.total_stock }}
          </template>
        </el-table-column>
        <el-table-column label="领取/使用" width="150">
          <template #default="{ row }">
            <span class="sub-fee">已领 {{ row.received_count }} 张</span><br />
            <span class="sub-fee">已用 {{ row.used_count }} 张</span>
          </template>
        </el-table-column>
        <el-table-column label="领取时间" width="200">
          <template #default="{ row }">
            <span class="sub-fee">{{ row.receive_start_time }} ~<br />{{ row.receive_end_time }}</span>
          </template>
        </el-table-column>
        <el-table-column label="使用时间" width="200">
          <template #default="{ row }">
            <span class="sub-fee">{{ row.use_start_time }} ~<br />{{ row.use_end_time }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="scope_text" label="适用范围" width="110" />
        <el-table-column label="限领/限用" width="110">
          <template #default="{ row }">{{ row.per_limit }} / {{ row.use_per_limit }}</template>
        </el-table-column>
        <el-table-column prop="bear_text" label="承担方" width="100" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)">{{ row.status_text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openForm(row)">编辑</el-button>
            <el-button link type="primary" @click="openRecords(row)">领券记录</el-button>
            <el-button v-if="row.status === 0" link type="success" @click="changeStatus(row, 1)">开始活动</el-button>
            <el-button v-if="row.status === 1" link type="danger" @click="changeStatus(row, 2)">废弃</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination class="pager" layout="total, prev, pager, next, sizes" :total="total"
        v-model:current-page="query.page" v-model:page-size="query.pageSize"
        @current-change="load" @size-change="load" />
    </el-card>

    <el-dialog v-model="formVisible" :title="form.id ? '编辑优惠券' : '新建优惠券'" width="560px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="券名称" required>
          <el-input v-model="form.name" maxlength="50" placeholder="如：新用户立减50" />
        </el-form-item>
        <el-form-item label="面额" required>
          <el-input-number v-model="form.amount" :min="0.01" :precision="2" :step="10" style="width: 100%" />
          <div class="tip">抵扣上限为订单金额，不会抵扣成负数</div>
        </el-form-item>
        <el-form-item label="库存" required>
          <el-input-number v-model="form.total_stock" :min="1" :step="10" :disabled="isActive"
            style="width: 100%" />
          <div class="tip" v-if="isActive">活动中的券只能<b>追加</b>库存，不能改其他规则</div>
        </el-form-item>
        <el-form-item label="每人限领" required>
          <el-input-number v-model="form.per_limit" :min="1" :step="1" :disabled="isActive" style="width: 100%" />
        </el-form-item>
        <el-form-item label="每人可用" required>
          <el-input-number v-model="form.use_per_limit" :min="1" :step="1" :disabled="isActive" style="width: 100%" />
          <div class="tip">每单最多使用一张券</div>
        </el-form-item>
        <el-form-item label="领取时间" required>
          <el-date-picker v-model="receiveRange" type="datetimerange" value-format="YYYY-MM-DD HH:mm:ss"
            start-placeholder="开始" end-placeholder="结束" :disabled="isActive" style="width: 100%" />
        </el-form-item>
        <el-form-item label="使用时间" required>
          <el-date-picker v-model="useRange" type="datetimerange" value-format="YYYY-MM-DD HH:mm:ss"
            start-placeholder="开始" end-placeholder="结束" :disabled="isActive" style="width: 100%" />
        </el-form-item>
        <el-form-item label="使用范围" required>
          <el-radio-group v-model="form.scope_type" :disabled="isActive">
            <el-radio :value="1">全场通用</el-radio>
            <el-radio :value="2">指定车辆</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.scope_type === 2" label="适用车辆" required>
          <el-select v-model="scopeCarIds" multiple filterable placeholder="选择可用车辆" :disabled="isActive"
            style="width: 100%">
            <el-option v-for="c in carOptions" :key="c.id" :label="c.car_name" :value="c.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import api from '../api';
import { useRouter } from 'vue-router';

const router = useRouter();

const loading = ref(false);
const saving = ref(false);
const rows = ref([]);
const total = ref(0);
const carOptions = ref([]);
const query = reactive({ page: 1, pageSize: 10, name: '', status: '' });

const formVisible = ref(false);
const receiveRange = ref([]);
const useRange = ref([]);
const scopeCarIds = ref([]);
const form = reactive(blankForm());

function blankForm() {
  return {
    id: null,
    name: '',
    amount: 50,
    total_stock: 100,
    per_limit: 1,
    use_per_limit: 1,
    scope_type: 1,
    user_scope: 0,
    bear_type: 'platform',
    status: 0,
  };
}

/** 活动中的券只允许追加库存，表单其余项禁用 */
const isActive = computed(() => Number(form.status) === 1);

/** 跳转到该批次的领券记录（用 pp_coupon 的数字主键，不是批次号） */
function openRecords(row) {
  router.push(`/coupons/${row.id}/records`);
}

function statusType(status) {
  return { 0: 'info', 1: 'success', 2: 'danger' }[status] || 'info';
}

async function load() {
  loading.value = true;
  try {
    const data = await api.get('/coupons', { params: query });
    rows.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

async function loadCars() {
  try {
    const data = await api.get('/cars', { params: { page: 1, pageSize: 200, status: 1 } });
    carOptions.value = data.list.map((c) => ({ id: c.id, car_name: c.car_name }));
  } catch (e) {
    /* 车辆列表失败不影响券列表展示 */
  }
}

function openForm(row) {
  if (row) {
    Object.assign(form, {
      id: row.id,
      name: row.name,
      amount: Number(row.amount),
      total_stock: Number(row.total_stock),
      per_limit: Number(row.per_limit),
      use_per_limit: Number(row.use_per_limit),
      scope_type: Number(row.scope_type),
      user_scope: Number(row.user_scope),
      bear_type: row.bear_type,
      status: Number(row.status),
    });
    receiveRange.value = [row.receive_start_time, row.receive_end_time];
    useRange.value = [row.use_start_time, row.use_end_time];
    scopeCarIds.value = row.scope_car_ids ? String(row.scope_car_ids).split(',').map(Number) : [];
  } else {
    Object.assign(form, blankForm());
    receiveRange.value = [];
    useRange.value = [];
    scopeCarIds.value = [];
  }
  formVisible.value = true;
}

function buildPayload() {
  const payload = {
    name: form.name,
    amount: form.amount,
    total_stock: form.total_stock,
    per_limit: form.per_limit,
    use_per_limit: form.use_per_limit,
    scope_type: form.scope_type,
    user_scope: form.user_scope,
    bear_type: form.bear_type,
    scope_car_ids: form.scope_type === 2 ? scopeCarIds.value.join(',') : '',
  };
  if (!isActive.value) {
    payload.receive_start_time = receiveRange.value[0];
    payload.receive_end_time = receiveRange.value[1];
    payload.use_start_time = useRange.value[0];
    payload.use_end_time = useRange.value[1];
  }
  return payload;
}

function validateForm() {
  if (!form.name) return '请填写券名称';
  if (!(Number(form.amount) > 0)) return '面额必须大于 0';
  if (!isActive.value) {
    if (!receiveRange.value || receiveRange.value.length !== 2) return '请选择领取时间范围';
    if (!useRange.value || useRange.value.length !== 2) return '请选择使用时间范围';
    if (form.scope_type === 2 && !scopeCarIds.value.length) return '请选择适用车辆';
  }
  return null;
}

async function save() {
  const err = validateForm();
  if (err) {
    ElMessage.warning(err);
    return;
  }
  saving.value = true;
  try {
    const payload = buildPayload();
    if (form.id) {
      await api.put(`/coupons/${form.id}`, payload);
    } else {
      await api.post('/coupons', payload);
    }
    ElMessage.success(form.id ? '已保存' : '创建成功，可在列表点击「开始活动」');
    formVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

/** 状态流转：未开始 → 活动中 → 已废弃（废弃不可逆，且会作废用户已领未用的券） */
async function changeStatus(row, status) {
  if (status === 2) {
    try {
      await ElMessageBox.confirm(
        `废弃「${row.name}」后，用户已领取但未使用的券将一并作废且不可恢复，确认继续？`,
        '废弃确认',
        { type: 'warning' }
      );
    } catch (e) {
      return;
    }
  }
  try {
    await api.put(`/coupons/${row.id}/status`, { status });
    ElMessage.success(status === 1 ? '已开始活动，用户可领取' : '已废弃');
    load();
  } catch (e) {
    ElMessage.error('操作失败');
  }
}

onMounted(() => {
  load();
  loadCars();
});
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
.sub-fee {
  color: #909399;
  font-size: 12px;
}
.tip {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
}
</style>
