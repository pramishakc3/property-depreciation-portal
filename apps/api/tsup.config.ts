import { defineConfig } from 'tsup';

// Bundles the API and the shared package into one file for production.
export default defineConfig({
  entry: ['src/index.ts', 'src/cli/migrate.ts', 'src/cli/seed.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  noExternal: ['@pdp/shared'],
  clean: true,
});
