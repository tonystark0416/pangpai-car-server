<template>
  <div>
    <el-card>
      <template #header>
        <span>用户 CRM — 订阅消息推送</span>
      </template>

      <el-alert type="info" :closable="false" class="tip-alert"
        title="仅收到「已授权该模板」用户的消息；未授权或额度用完会推送失败并提示原因。" />

      <el-form label-width="110px" style="max-width: 640px; margin-top: 16px">
        <!-- 选用户：远程搜索 -->
        <el-form-item label="目标用户" required>
          <el-select v-model="form.uid" filterable remote :remote-method="searchUsers" :loading="searching"
            placeholder="输入手机号 / 昵称搜索" style="width: 100%">
            <el-option v-for="u in userOptions" :key="u.id" :value="u.id"
              :label="`${u.id} - ${u.nickname || '未命名'} ${u.phone || ''}`" />
          </el-select>
        </el-form-item>

        <!-- 选模板 -->
        <el-form-item label="消息模板" required>
          <el-radio-group v-model="form.template_key" @change="onTemplateChange">
            <el-radio v-for="t in templates" :key="t.key" :value="t.key" :disabled="!t.enabled">
              {{ t.name }}{{ t.enabled ? '' : '（未配置）' }}
            </el-radio>
          </el-radio-group>
        </el-form-item>

        <!-- 动态字段（字段定义由后端下发，与公众平台模板一致） -->
        <template v-if="currentTpl">
          <el-form-item v-for="f in currentTpl.fields" :key="f.key"
            :label="f.label" :required="f.required">
            <el-input v-model="form.data[f.key]" :placeholder="typeHint(f.type)" maxlength="60" show-word-limit />
          </el-form-item>
        </template>

        <el-form-item>
          <el-button type="primary" :loading="sending" @click="send">发送</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import api from '../api';

const templates = ref([]);
const userOptions = ref([]);
const searching = ref(false);
const sending = ref(false);

const form = reactive({
  uid: null,
  template_key: null,
  data: {},
});

const currentTpl = computed(() => templates.value.find((t) => t.key === form.template_key));

const TYPE_HINTS = {
  thing: '20 字以内',
  phrase: '5 字以内（如：已取车）',
  character_string: '32 字符以内（如订单号）',
  time: '时间，如 2026-11-08 17:30',
  amount: '数字金额',
};
const typeHint = (t) => TYPE_HINTS[t] || '';

function onTemplateChange() {
  form.data = {};
}

async function searchUsers(keyword) {
  if (!keyword) return;
  searching.value = true;
  try {
    const data = await api.get('/users', { params: { keyword, page: 1, pageSize: 20 } });
    userOptions.value = data.list || [];
  } finally {
    searching.value = false;
  }
}

async function loadTemplates() {
  const data = await api.get('/crm/templates');
  templates.value = data;
  // 默认选中第一个可用模板
  const first = data.find((t) => t.enabled);
  if (first) form.template_key = first.key;
}

async function send() {
  if (!form.uid) return ElMessage.warning('请选择目标用户');
  if (!form.template_key) return ElMessage.warning('请选择消息模板');
  const tpl = currentTpl.value;
  if (!tpl) return;
  for (const f of tpl.fields) {
    if (f.required && !(form.data[f.key] || '').trim()) {
      return ElMessage.warning(`请填写「${f.label}」`);
    }
  }
  const confirmMsg = `确认向用户 #${form.uid} 推送「${tpl.name}」？`;
  try {
    await ElMessageBox.confirm(confirmMsg, '推送确认', { type: 'warning' });
  } catch {
    return;
  }
  sending.value = true;
  try {
    const data = await api.post('/crm/push', {
      uid: form.uid,
      template_key: form.template_key,
      data: form.data,
    });
    if (data.ok) {
      ElMessage.success('发送成功');
      form.data = {};
    } else {
      ElMessage.error(`发送失败：${data.msg}`);
    }
  } finally {
    sending.value = false;
  }
}

onMounted(loadTemplates);
</script>

<style scoped>
.tip-alert {
  margin-bottom: 4px;
}
</style>
