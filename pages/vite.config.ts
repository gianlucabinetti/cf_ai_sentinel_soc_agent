import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      '/v1': {
        target: 'https://sentinel-agent.gbinetti2020.workers.dev',
        changeOrigin: true,
      }
    }
  }
})
