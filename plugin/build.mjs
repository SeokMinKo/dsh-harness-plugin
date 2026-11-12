import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const directory = fileURLToPath(new URL('.', import.meta.url))
await build({
  absWorkingDir: directory,
  entryPoints: ['src/client.jsx'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: ['react', 'zod'],
  loader: { '.css': 'text' },
  banner: { js: 'window.__ModuleLoader__.load({ id: "dsh-team-chat", factory: (require) => { const module = { exports: {} }; const exports = module.exports;' },
  footer: { js: 'return module.exports; } });' },
})
