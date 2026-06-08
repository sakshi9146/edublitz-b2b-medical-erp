import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const host = env.VITE_PROXY_API_HOST || '127.0.0.1'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api/user': {
          target: `http://${host}:8081`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/user/, '/api/v1'),
        },
        '/api/product': {
          target: `http://${host}:8082`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/product/, '/api/v1'),
        },
        '/api/order': {
          target: `http://${host}:8083`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/order/, '/api/v1'),
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            charts: ['recharts'],
            forms: ['react-hook-form', 'zod', '@hookform/resolvers'],
          },
        },
      },
    },
  }
})
