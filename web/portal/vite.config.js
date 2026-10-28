import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '127.0.0.1', // the proxy below attaches the admin token; keep it off the LAN
    proxy: {
      '/admin': {
        target: 'http://127.0.0.1:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/admin/, ''),
        headers: {
          Authorization: `Bearer ${process.env.AEGIS_ADMIN_TOKEN}`,
        },
      },
      // Data plane: chat routes and the health probe share one target.
      '^/(v1|healthz)': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
