import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { readFileSync } from 'fs'

const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
)

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    allowedHosts: process.env.VITE_ALLOWED_HOSTS?.split(',') || true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // Auth API routes — proxied to backend.
      // /auth/callback is handled by the SPA (React Router), NOT proxied.
      '/auth': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        bypass(req) {
          // Let the SPA handle the OAuth redirect callback
          if (req.url?.startsWith('/auth/callback')) {
            return req.url
          }
        },
      },
      '/ws': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
