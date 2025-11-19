import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      vscode: fileURLToPath(
        new URL('./src/extension/__tests__/__mocks__/vscode.ts', import.meta.url)
      ),
    },
  },
});
