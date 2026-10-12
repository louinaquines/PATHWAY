import { defineConfig, transformWithEsbuild } from '../../../PATHWAY-web/node_modules/vite/dist/node/index.js';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
const web = fileURLToPath(new URL('../../../PATHWAY-web/', import.meta.url));
export default defineConfig({ root: here, optimizeDeps: { esbuildOptions: { loader: { '.js': 'jsx' } } }, resolve: { alias: [
  { find: /^\.\.\/adminApi$/, replacement: `${here}mock-api.js` },
  { find: /^react$/, replacement: `${web}node_modules/react/index.js` },
  { find: /^react\/jsx-runtime$/, replacement: `${web}node_modules/react/jsx-runtime.js` },
  { find: /^react-dom\/client$/, replacement: `${web}node_modules/react-dom/client.js` },
] }, plugins: [{ name: 'qa-jsx', enforce: 'pre', transform(code, id) { if (id.endsWith('.js') && !id.includes('node_modules')) return transformWithEsbuild(code, id, { loader: 'jsx', jsx: 'automatic' }); } }], server: { host: '127.0.0.1', port: 3017, strictPort: true, fs: { allow: [here, web] } } });
