// Opt-in: this harness calls a real provider and edits disposable Flask checkouts.
const path = require('node:path');
const outdir = process.argv[2];
if (!outdir) throw new Error('Usage: node scripts/build-live-tests.cjs <scratch-output-directory>');
require('esbuild').buildSync({entryPoints:['test/native/live.ts'],bundle:true,platform:'node',format:'cjs',external:['vscode'],outfile:path.join(outdir,'index.cjs')});
