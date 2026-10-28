import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api/v1/ai': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/api/v1/auth': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/api/v1/gateway': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/api/v1/scan': {
        target: 'http://localhost:8081',
        changeOrigin: true
      },
      '/api/v1/risk': {
        target: 'http://localhost:8082',
        changeOrigin: true
      },
      '/api/v1/audit': {
        target: 'http://localhost:8083',
        changeOrigin: true
      },
      '/api/v1/dashboard': {
        target: 'http://localhost:8083',
        changeOrigin: true
      },
      '/api/v1/quality': {
        target: 'http://localhost:8084',
        changeOrigin: true
      },
      '/api/v1/governance': {
        target: 'http://localhost:8085',
        changeOrigin: true
      }
    }
  }
});
