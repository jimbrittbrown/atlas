import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { atlasApiGatewayPlugin } from './dev/atlasApiGateway.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), atlasApiGatewayPlugin()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test.setup.ts',
    globals: true,
  },
})
