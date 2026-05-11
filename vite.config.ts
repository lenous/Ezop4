import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 8085, host: '0.0.0.0' },
  preview: { port: 8085, host: '0.0.0.0' },
});
