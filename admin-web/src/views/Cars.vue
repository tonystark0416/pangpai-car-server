<template>
  <div>
    <el-card>
      <div class="toolbar">
        <el-input v-model="query.keyword" placeholder="车名 / 描述" clearable style="width: 220px" @keyup.enter="load" />
        <el-select v-model="query.status" clearable placeholder="全部状态" style="width: 120px">
          <el-option label="上架" :value="1" />
          <el-option label="下架" :value="0" />
        </el-select>
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
        <el-table-column label="整备费" width="100">
          <template #default="{ row }">￥{{ row.clean_price ?? 0 }}</template>
        </el-table-column>
        <el-table-column label="保险费/天" width="130">
          <template #default="{ row }">
            低 ￥{{ row.insurance_price_l1 ?? 0 }}<br />
            <span class="sub-fee">高 ￥{{ row.insurance_price_l2 ?? 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="排序" width="130">
          <template #default="{ row }">
            <el-input-number v-model="row.sort" :min="1" :max="10000" :step="1" size="small" controls-position="right"
              style="width: 110px" @change="saveSort(row)" />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-switch v-model="row.status" :active-value="1" :inactive-value="0" active-text="上架" inactive-text="下架"
              inline-prompt @change="toggleStatus(row)" />
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.update_time) }}</template>
        </el-table-column>
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

    <el-dialog v-model="formVisible" :title="form.id ? '编辑车辆' : '新增车辆'" width="560px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="车名" required>
          <el-input v-model="form.car_name" maxlength="50" />
        </el-form-item>
        <el-form-item label="车辆图片" required>
          <div class="upload-row">
            <el-upload :show-file-list="false" multiple :http-request="uploadImage" :before-upload="beforeUpload"
              accept="image/jpeg,image/png,image/webp">
              <el-button type="primary" :loading="uploading">选择图片上传</el-button>
            </el-upload>
            <span class="sub-fee">支持 jpg / png / webp，单张 ≤ 5MB，最多 8 张</span>
          </div>
          <!-- v1.7.6：轮播图列表，第 1 张为主图（列表页与详情页封面都取它） -->
          <div v-if="form.images.length" class="img-list">
            <div v-for="(url, i) in form.images" :key="url + i" class="img-item">
              <el-image :src="url" :preview-src-list="form.images" preview-teleported fit="cover" class="thumb" />
              <div class="img-mask">
                <el-button link type="primary" size="small" @click="setMainImage(i)">设为主图</el-button>
                <el-button link type="danger" size="small" @click="removeImage(i)">删除</el-button>
              </div>
              <div v-if="i === 0" class="main-badge">主图</div>
            </div>
          </div>
          <div v-else class="sub-fee">暂无图片（可上传，也可在下方直接填写地址）</div>
          <el-input v-model="form.image_url" placeholder="主图地址：上传后自动同步为轮播第 1 张" clearable />
        </el-form-item>
        <el-form-item label="车辆标签">
          <div class="tag-row">
            <el-tag v-for="(t, i) in form.tags" :key="t" closable size="small" @close="removeTag(i)">{{ t }}</el-tag>
            <el-input v-model="tagInput" size="small" placeholder="输入后回车添加" style="width: 140px"
              :maxlength="10" @keyup.enter="addTag" @blur="addTag" />
          </div>
          <div class="tip">最多 6 个，单个 ≤ 10 字；展示在详情页车辆名称下方（如 自动挡 / 5座 / 豪华型）</div>
        </el-form-item>
        <el-form-item label="配置参数">
          <div class="config-list">
            <div v-for="(item, i) in configList" :key="i" class="config-row">
              <el-input v-model="item.key" placeholder="名称，如 座位" size="small" maxlength="20"
                style="width: 140px" />
              <el-input v-model="item.value" placeholder="值，如 5座" size="small" maxlength="50"
                style="width: 180px" />
              <el-button link type="danger" size="small" @click="removeConfig(i)">删除</el-button>
            </div>
          </div>
          <el-button link type="primary" size="small" @click="addConfig">+ 添加配置项</el-button>
          <div class="tip">最多 20 项，按添加顺序展示在详情页「车辆配置」区</div>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.des" maxlength="100" />
          <div class="tip">一句话卖点，展示在详情页标签下方</div>
        </el-form-item>
        <el-form-item label="日租金" required>
          <el-input-number v-model="form.day_price" :min="0" :precision="2" :step="10" style="width: 100%" />
        </el-form-item>
        <el-form-item label="促销价">
          <el-input-number v-model="form.promotion_day_price" :min="0" :precision="2" :step="10" style="width: 100%" />
        </el-form-item>
        <el-form-item label="整备费">
          <el-input-number v-model="form.clean_price" :min="0" :precision="2" :step="10" style="width: 100%" />
          <div class="tip">按订单一次性收取，<b>不乘天数</b></div>
        </el-form-item>
        <el-form-item label="低档保险">
          <el-input-number v-model="form.insurance_price_l1" :min="0" :precision="2" :step="10" style="width: 100%" />
          <div class="tip">日单价，<b>会乘天数</b>；用户不可不买保险，二选一</div>
        </el-form-item>
        <el-form-item label="高档保险">
          <el-input-number v-model="form.insurance_price_l2" :min="0" :precision="2" :step="10" style="width: 100%" />
          <div class="tip">日单价，<b>会乘天数</b>，供用户在结算页切换</div>
        </el-form-item>
        <el-form-item label="排序值">
          <el-input-number v-model="form.sort" :min="1" :max="10000" :step="1" style="width: 100%" />
          <div class="tip">1~10000 的整数，越小越靠前</div>
        </el-form-item>
        <el-form-item label="上架状态">
          <el-radio-group v-model="form.status">
            <el-radio :value="1">上架</el-radio>
            <el-radio :value="0">下架</el-radio>
          </el-radio-group>
          <div class="tip">下架后小程序端车辆列表不再展示</div>
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
import { formatDateTime } from '../utils/format';

const loading = ref(false);
const saving = ref(false);
const uploading = ref(false);
const rows = ref([]);
const total = ref(0);
const query = reactive({ page: 1, pageSize: 10, keyword: '', status: '' });

const formVisible = ref(false);
const form = reactive({
  id: null,
  car_name: '',
  image_url: '',
  des: '',
  day_price: 0,
  promotion_day_price: 0,
  clean_price: 50,
  insurance_price_l1: 100,
  insurance_price_l2: 200,
  sort: 100,
  status: 1,
  // v1.7.6：详情页字段（images 第 1 张即主图，与 image_url 保持一致）
  images: [],
  tags: [],
});

/** 标签输入框（回车或失焦即添加） */
const tagInput = ref('');
/** 配置参数用数组驱动表单行，保存时再转成对象（对象无法保证 v-for 顺序与可编辑性） */
const configList = ref([]);
const MAX_IMAGES = 8;
const MAX_TAGS = 6;
const MAX_CONFIG = 20;

/** 费用字段的默认值（新增车辆 / 老数据缺失时兜底） */
const DEFAULT_FEE = { clean_price: 50, insurance_price_l1: 100, insurance_price_l2: 200 };

/** 车辆图片上传限制：与后端 src/middlewares/carUpload.js 保持一致 */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_MAX_SIZE = 5 * 1024 * 1024;

function beforeUpload(file) {
  if (!IMAGE_TYPES.includes(file.type)) {
    ElMessage.error('仅支持 jpg / png / webp 格式的图片');
    return false;
  }
  if (file.size > IMAGE_MAX_SIZE) {
    ElMessage.error('图片大小不能超过 5MB');
    return false;
  }
  return true;
}

/**
 * 自定义上传：走统一 api 实例以带上 JWT
 * v1.7.6：支持多张——每张成功后追加进 form.images，并把第 1 张同步为 image_url（主图）
 */
async function uploadImage({ file }) {
  const formData = new FormData();
  formData.append('file', file);
  uploading.value = true;
  try {
    const data = await api.post('/upload/car-image', formData, { timeout: 30000 });
    if (form.images.length >= MAX_IMAGES) {
      ElMessage.warning(`最多上传 ${MAX_IMAGES} 张轮播图`);
      return;
    }
    form.images.push(data.url);
    form.image_url = form.images[0];
    ElMessage.success('图片上传成功');
  } catch (e) {
    /* 失败提示由 api 拦截器统一处理 */
  } finally {
    uploading.value = false;
  }
}

/** 删除轮播图；删空后主图地址保留（后端要求 image_url 必填） */
function removeImage(index) {
  form.images.splice(index, 1);
  form.image_url = form.images[0] || form.image_url;
}

/** 设为首图：挪到数组第 1 位 */
function setMainImage(index) {
  if (index === 0) return;
  const [url] = form.images.splice(index, 1);
  form.images.unshift(url);
  form.image_url = url;
}

function addTag() {
  const v = String(tagInput.value || '').trim();
  tagInput.value = '';
  if (!v) return;
  if (form.tags.includes(v)) {
    ElMessage.warning('标签重复');
    return;
  }
  if (form.tags.length >= MAX_TAGS) {
    ElMessage.warning(`最多 ${MAX_TAGS} 个标签`);
    return;
  }
  form.tags.push(v.slice(0, 10));
}

function removeTag(index) {
  form.tags.splice(index, 1);
}

function addConfig() {
  if (configList.value.length >= MAX_CONFIG) {
    ElMessage.warning(`最多 ${MAX_CONFIG} 项配置`);
    return;
  }
  configList.value.push({ key: '', value: '' });
}

function removeConfig(index) {
  configList.value.splice(index, 1);
}

/** 配置行 → 对象（过滤空行，保持添加顺序） */
function buildConfig() {
  const out = {};
  configList.value.forEach(({ key, value }) => {
    const k = String(key || '').trim();
    const v = String(value || '').trim();
    if (k && v) out[k] = v;
  });
  return out;
}

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
      // v1.6.18：费用配置，老数据缺字段时回退默认值
      clean_price: row.clean_price !== undefined && row.clean_price !== null ? Number(row.clean_price) : DEFAULT_FEE.clean_price,
      insurance_price_l1: row.insurance_price_l1 !== undefined && row.insurance_price_l1 !== null ? Number(row.insurance_price_l1) : DEFAULT_FEE.insurance_price_l1,
      insurance_price_l2: row.insurance_price_l2 !== undefined && row.insurance_price_l2 !== null ? Number(row.insurance_price_l2) : DEFAULT_FEE.insurance_price_l2,
      sort: Number(row.sort) || 100,
      status: Number(row.status),
      // v1.7.6：轮播图为空时回退为单张主图，保证编辑后不会「图越改越少」
      images: Array.isArray(row.images) ? [...row.images] : row.image_url ? [row.image_url] : [],
      tags: Array.isArray(row.tags) ? [...row.tags] : [],
    });
    configList.value = Object.entries(row.config || {}).map(([key, value]) => ({ key, value: String(value) }));
    tagInput.value = '';
  } else {
    Object.assign(form, {
      id: null,
      car_name: '',
      image_url: '',
      des: '',
      day_price: 0,
      promotion_day_price: 0,
      clean_price: DEFAULT_FEE.clean_price,
      insurance_price_l1: DEFAULT_FEE.insurance_price_l1,
      insurance_price_l2: DEFAULT_FEE.insurance_price_l2,
      sort: 100,
      status: 1,
      images: [],
      tags: [],
    });
    configList.value = [];
    tagInput.value = '';
  }
  formVisible.value = true;
}

/** 上下架快捷切换 */
async function toggleStatus(row) {
  try {
    await api.put(`/cars/${row.id}/status`, { status: row.status });
    ElMessage.success(row.status === 1 ? '已上架' : '已下架');
    load();
  } catch (e) {
    ElMessage.error('状态更新失败');
    row.status = row.status === 1 ? 0 : 1;
  }
}

/** 排序值即时保存（整行提交，后端按完整字段校验） */
async function saveSort(row) {
  try {
    await api.put(`/cars/${row.id}`, {
      car_name: row.car_name,
      image_url: row.image_url,
      des: row.des || '',
      day_price: Number(row.day_price),
      promotion_day_price: row.promotion_day_price ? Number(row.promotion_day_price) : null,
      // v1.6.18：整行提交必须带上费用字段，否则会被后端回退成默认值
      clean_price: Number(row.clean_price ?? DEFAULT_FEE.clean_price),
      insurance_price_l1: Number(row.insurance_price_l1 ?? DEFAULT_FEE.insurance_price_l1),
      insurance_price_l2: Number(row.insurance_price_l2 ?? DEFAULT_FEE.insurance_price_l2),
      status: row.status,
      sort: Number(row.sort),
    });
    ElMessage.success('排序已保存');
    load();
  } catch (e) {
    ElMessage.error('排序保存失败');
  }
}

async function save() {
  if (!form.car_name || !form.image_url) {
    ElMessage.warning('请填写车名和图片URL');
    return;
  }
  saving.value = true;
  try {
    // v1.7.6：config 由行数组转成对象后再提交；images/tags 直接随表单走
    const payload = { ...form, config: buildConfig() };
    if (form.id) {
      await api.put(`/cars/${form.id}`, payload);
    } else {
      await api.post('/cars', payload);
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
.sub-fee {
  color: #909399;
  font-size: 12px;
}
.upload-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.thumb {
  width: 120px;
  height: 70px;
  border-radius: 4px;
  background: #f5f7fa;
}
.promo {
  color: #f56c6c;
  font-weight: 600;
}
/* v1.7.6：轮播图列表 */
.img-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 8px 0;
}
.img-item {
  position: relative;
  width: 120px;
}
.img-mask {
  display: flex;
  justify-content: space-between;
  padding: 0 2px;
}
.main-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 0 6px;
  font-size: 12px;
  color: #fff;
  background: rgba(64, 158, 255, 0.9);
  border-radius: 3px;
}
.tag-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.config-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 4px;
}
.config-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tip {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
}
</style>
