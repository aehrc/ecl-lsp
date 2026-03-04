#!/usr/bin/env node
/**
 * Bundle the ECL LSP server into a single JS file using esbuild.
 *
 * Layout produced:
 *   server/
 *     server.js            — single bundled file (server + ecl-core + all deps)
 *     LICENSE
 *     THIRD-PARTY-LICENSES.txt
 *
 * Extension runtime deps (vscode-languageclient) are bundled separately
 * by the extension's own esbuild step.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(__dirname, '..', 'server');

// Clean previous bundle
if (fs.existsSync(OUT)) {
  fs.rmSync(OUT, { recursive: true, force: true });
}
fs.mkdirSync(OUT, { recursive: true });

// Bundle server + all dependencies into a single file
const entryPoint = path.join(ROOT, 'packages', 'ecl-lsp-server', 'dist', 'server.js');
const outFile = path.join(OUT, 'server.js');

execFileSync(
  'npx',
  [
    'esbuild',
    entryPoint,
    '--bundle',
    '--outfile=' + outFile,
    '--format=cjs',
    '--platform=node',
    '--target=node20',
    '--sourcemap',
  ],
  { stdio: 'inherit' },
);

// License files
fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(OUT, 'LICENSE'));
fs.copyFileSync(path.join(ROOT, 'THIRD-PARTY-LICENSES.txt'), path.join(OUT, 'THIRD-PARTY-LICENSES.txt'));

// Summary
let fileCount = 0;
for (const entry of fs.readdirSync(OUT)) {
  if (fs.statSync(path.join(OUT, entry)).isFile()) fileCount++;
}
console.log(`Bundled server: ${fileCount} files into server/`);
