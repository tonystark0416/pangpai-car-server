<template>
  <div>
    <el-card>
      <div class="toolbar">
        <el-input v-model="query.keyword" placeholder="车名 / 描述" clearable style="width: 220px" @keyup.enter="load" />
        <el-button type="primary" @click="load">查询</el-button>
        <el-button type="success" @click="openForm()">新增车辆</el-button>
      </div>

      <el-table :data="rows" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="图片" width="110">
          <template #default="{ row }">
            <el-image :src="row.image_url" :preview-src-list="[row.image_url]" preview-teleported fit="cover"
              style="width: 80px; height: 50px" />
          </template>
        </el-table-column>
        <el-table-column prop="car_name" label="车名" min-width="140" />
        <el-table-column prop="des" label="描述" min-width="140" />
        <el-table-column label="日租金" width="100">
          <template #default="{ row }">￥{{ row.day_price }}</template>
        </el-table-column>
        <el-table-column label="促销价" width="100">
          <template #default="{ row }">
            <span :class="{ promo: row.promotion_day_price }">￥{{ row.promotion_day_price ?? '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="update_time" label="更新时间" width="170" />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openForm(row)">编辑</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination class="pager" layout="total, prev, pager, next, sizes" :total="total"
        v-model:current-page="query.page" v-model:page-size="query.pageSize"
        @current-change="load" @size-change="load" />
    </el-card>

    <el-dialog v-model="formVisible" :title="form.id ? '编辑车辆' : '新增车辆'" width="480px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="车名" required>
          <el-input v-model="form.car_name" maxlength="50" />
        </el-form-item>
        <el-form-item label="图片URL" required>
          <el-input v-model="form.image_url" placeholder="https://... 或 /images/xxx.png" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.des" maxlength="100" />
        </el-form-item>
        <el-form-item label="日租金" required>
          <el-input-number v-model="form.day_price" :min="0" :precision="2" :step="10" style="width: 100%" />
        </el-form-item>
        <el-form-item label="促销价">
          <el-input-number v-model="form.promotion_day_price" :min="0" :precision="2" :step="10" style="width: 100%" />
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
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import api from '../api';

const loading = ref(false);
const saving = ref(false);
const rows = ref([]);
const total = ref(0);
const query = reactive({ page: 1, pageSize: 10, keyword: '' });

const formVisible = ref(false);
const form = reactive({ id: null, car_name: '', image_url: '', des: '', day_price: 0, promotion_day_price: 0 });

async function load() {
  loading.value = true;
  try {
    const data = await api.get('/cars', { params: query });
    rows.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function openForm(row) {
  if (row) {
    Object.assign(form, {
      id: row.id,
      car_name: row.car_name,
      image_url: row.image_url,
      des: row.des || '',
      day_price: Number(row.day_price),
      promotion_day_price: row.promotion_day_price ? Number(row.promotion_day_price) : 0,
    });
  } else {
    Object.assign(form, { id: null, car_name: '', image_url: '', des: '', day_price: 0, promotion_day_price: 0 });
  }
  formVisible.value = true;
}

async function save() {
  if (!form.car_name || !form.image_url) {
    ElMessage.warning('请填写车名和图片URL');
    return;
  }
  saving.value = true;
  try {
    if (form.id) {
      await api.put(`/cars/${form.id}`, form);
    } else {
      await api.post('/cars', form);
    }
    ElMessage.success('保存成功');
    formVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function remove(row) {
  await ElMessageBox.confirm(`确定删除车辆「${row.car_name}」？`, '删除确认', { type: 'warning' });
  await api.delete(`/cars/${row.id}`);
  ElMessage.success('已删除');
  load();
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
.promo {
  color: #f56c6c;
  font-weight: 600;
}
</style>
