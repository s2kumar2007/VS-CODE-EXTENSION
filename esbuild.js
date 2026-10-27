// Bundles the extension host code into dist/extension.js. `vscode` is provided by the host.
const esbuild = require('esbuild');
const watch = process.argv.includes('--watch');
const opts = {
  entryPoints: ['src/extension.ts'], bundle: true, outfile: 'dist/extension.js',
  platform: 'node', format: 'cjs', target: 'node20', external: ['vscode'], sourcemap: true,
};
(async () => {
  if (watch) { const ctx = await esbuild.context(opts); await ctx.watch(); }
  else { await esbuild.build(opts); }
})().catch(() => process.exit(1));
