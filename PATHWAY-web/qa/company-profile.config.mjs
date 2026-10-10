import { defineConfig, transformWithEsbuild } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  optimizeDeps: { entries: ['qa/company-profile.html'], esbuildOptions: { loader: { '.js': 'jsx' } } },
  resolve: { alias: [{ find: /^\.\.\/adminApi$/, replacement: fileURLToPath(new URL('./company-profile-api.js', import.meta.url)) }] },
  plugins: [{ name: 'qa-jsx', async transform(code, id) {
    if (/\/src\/.*\.js$/.test(id.replaceAll('\\', '/'))) return transformWithEsbuild(code, id, { loader: 'jsx', jsx: 'automatic' });
  } }],
  server: { host: '127.0.0.1', port: 3094, strictPort: true },
});
