const path = require('node:path');
const outdir = process.argv[2];
if (!outdir) throw new Error('Usage: node scripts/build-native-tests.cjs <scratch-output-directory>');
require('esbuild').buildSync({ entryPoints: ['test/native/index.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['vscode'], outfile: path.join(outdir, 'index.cjs') });
