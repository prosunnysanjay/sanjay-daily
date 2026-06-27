import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: change 'sanjay-daily' below to match your actual GitHub repo name.
// GitHub Pages serves project sites at https://<username>.github.io/<repo-name>/
// so Vite needs to know that sub-path at build time.
export default defineConfig({
  plugins: [react()],
  base: '/sanjay-daily/',
})
