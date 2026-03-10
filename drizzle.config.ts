import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  // This schema powers the legacy SQLite prototype only. Active app code lives in apps/web.
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/nyaya-mitra.db',
  },
});
