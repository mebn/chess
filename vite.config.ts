import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { coachPlugin } from './server/coach.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), coachPlugin()],
})
