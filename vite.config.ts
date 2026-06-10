import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Note: base applies to the dev server too (open http://localhost:5173/house-edge/)
  base: '/house-edge/',
  test: {
    environment: 'node',
    passWithNoTests: true,
  },
})
