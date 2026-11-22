import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { firstpassCompressedBank } from './scripts/firstpassBank.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), firstpassCompressedBank()],
  server: { host: true },
})
