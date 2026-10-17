import { defineConfig, loadEnv, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Keep existing public CRA variable names while migrating. Never expose the
  // entire process environment (SMTP/provider secrets belong on the backend).
  const env = loadEnv(mode, process.cwd(), 'REACT_APP_');
  if (mode === 'production') {
    let backend;
    try { backend = new URL(env.REACT_APP_BACKEND_URL); } catch { throw new Error('Production requires a valid REACT_APP_BACKEND_URL.'); }
    if (backend.protocol !== 'https:' || backend.username || backend.password || backend.port || backend.pathname !== '/' || backend.search || backend.hash
      || ['localhost', '127.0.0.1', '[::1]'].includes(backend.hostname)) {
      throw new Error('Production backend must be an HTTPS origin, not localhost or a malformed URL.');
    }
  }
  const publicKeys = ['REACT_APP_BACKEND_URL', 'REACT_APP_LOCAL_EMULATOR',
    'REACT_APP_FIREBASE_API_KEY', 'REACT_APP_FIREBASE_AUTH_DOMAIN',
    'REACT_APP_FIREBASE_PROJECT_ID', 'REACT_APP_FIREBASE_STORAGE_BUCKET',
    'REACT_APP_FIREBASE_MESSAGING_SENDER_ID', 'REACT_APP_FIREBASE_APP_ID'];
  const define = Object.fromEntries(publicKeys.map(key => [
    `process.env.${key}`, env[key] === undefined ? 'undefined' : JSON.stringify(env[key]),
  ]));
  return {
    define,
    plugins: [
      {
        name: 'pathway-existing-jsx-files', enforce: 'pre',
        async transform(code, id) {
          if (/\/src\/.*\.js$/.test(id.replaceAll('\\', '/'))) {
            return transformWithEsbuild(code, id, { loader: 'jsx', jsx: 'automatic' });
          }
        },
      },
      react(),
    ],
    optimizeDeps: { esbuildOptions: { loader: { '.js': 'jsx' } } },
    server: { host: '127.0.0.1', port: 3002, strictPort: true },
    preview: { host: '127.0.0.1', port: 3002, strictPort: true },
    // Keep the accepted CRA build intact until browser and launcher cutover QA.
    build: { outDir: 'build-vite', sourcemap: false },
  };
});
