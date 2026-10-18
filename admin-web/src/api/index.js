import axios from 'axios';
import { ElMessage } from 'element-plus';
import router from '../router';

const api = axios.create({
  baseURL: '/admin-api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    // 文件下载类请求（responseType=blob）直接返回原始响应，由业务侧处理二进制流
    if (response.config.responseType === 'blob') {
      return response;
    }
    const data = response.data;
    if (data.code === 0) {
      return data.data;
    }
    if (data.code === 401) {
      localStorage.removeItem('admin_token');
      router.push('/login');
    }
    ElMessage.error(data.msg || '请求失败');
    return Promise.reject(new Error(data.msg));
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('admin_token');
      router.push('/login');
      ElMessage.error('登录已过期，请重新登录');
    } else {
      ElMessage.error(error.message || '网络异常');
    }
    return Promise.reject(error);
  }
);

export default api;
