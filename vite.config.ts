import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { coachPlugin } from './server/coach.ts'

// `vite preview` settings come from .env: HOST (default localhost only), PORT and
// ALLOWED_HOSTS (comma separated domain names the site is served under).
const allowedHosts = process.env.ALLOWED_HOSTS?.split(',').map((h) => h.trim()).filter(Boolean)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), coachPlugin()],
  preview: {
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT) || 4173,
    ...(allowedHosts?.length ? { allowedHosts } : {}),
  },
})
