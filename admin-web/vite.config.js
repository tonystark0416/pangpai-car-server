import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/admin-api': 'http://127.0.0.1:3002',
      '/images': 'http://127.0.0.1:3002',
    },
  },
});
