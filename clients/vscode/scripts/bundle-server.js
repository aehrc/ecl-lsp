#!/usr/bin/env node
/**
 * Bundle the ECL LSP server and all its runtime dependencies into the
 * server/ directory for inclusion in the VSIX package.
 *
 * Layout produced:
 *   server/
 *     dist/            — compiled server JS
 *     node_modules/    — server runtime deps (ecl-core, LSP protocol, antlr4ts, node-fetch)
 *     package.json     — server package manifest
 *
 * Extension runtime deps (vscode-languageclient) are resolved by vsce
 * from the npm workspace during packaging — not copied here.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SERVER_PKG = path.join(ROOT, 'packages', 'ecl-lsp-server');
const CORE_PKG = path.join(ROOT, 'packages', 'ecl-core');
const NODE_MODULES = path.join(ROOT, 'node_modules');
const OUT = path.join(__dirname, '..', 'server');

// Server runtime dependencies
const SERVER_MODULES = [
  'vscode-languageserver',
  'vscode-languageserver-protocol',
  'vscode-languageserver-textdocument',
  'vscode-languageserver-types',
  'vscode-jsonrpc',
  'antlr4ts',
  'node-fetch',
  'whatwg-url',
  'tr46',
  'webidl-conversions',
];

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'test' || entry.name === '__tests__') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      if (entry.name.endsWith('.map')) continue;
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Clean previous bundle
if (fs.existsSync(OUT)) {
  fs.rmSync(OUT, { recursive: true, force: true });
}
fs.mkdirSync(path.join(OUT, 'dist'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'node_modules'), { recursive: true });

// 1. Server compiled JS (exclude tests and source maps)
for (const file of fs.readdirSync(path.join(SERVER_PKG, 'dist'))) {
  if (file.endsWith('.js') && !file.endsWith('.test.js') && !file.endsWith('.map')) {
    fs.copyFileSync(path.join(SERVER_PKG, 'dist', file), path.join(OUT, 'dist', file));
  }
}
fs.copyFileSync(path.join(SERVER_PKG, 'package.json'), path.join(OUT, 'package.json'));

// 2. ecl-core (workspace dependency — copy dist + package.json)
const coreOut = path.join(OUT, 'node_modules', 'ecl-core');
fs.mkdirSync(path.join(coreOut, 'dist'), { recursive: true });
for (const file of fs.readdirSync(path.join(CORE_PKG, 'dist'))) {
  if (file.endsWith('.js') && !file.endsWith('.test.js') && !file.endsWith('.map')) {
    fs.copyFileSync(path.join(CORE_PKG, 'dist', file), path.join(coreOut, 'dist', file));
  }
}
fs.copyFileSync(path.join(CORE_PKG, 'package.json'), path.join(coreOut, 'package.json'));

// 3. Runtime npm modules
for (const mod of SERVER_MODULES) {
  const src = path.join(NODE_MODULES, mod);
  if (!fs.existsSync(src)) {
    console.warn(`WARNING: ${mod} not found in node_modules — skipping`);
    continue;
  }
  copyDirSync(src, path.join(OUT, 'node_modules', mod));
}

// 4. License files (project LICENSE + third-party notices)
fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(OUT, 'LICENSE'));
fs.copyFileSync(path.join(ROOT, 'THIRD-PARTY-LICENSES.txt'), path.join(OUT, 'THIRD-PARTY-LICENSES.txt'));

// Summary
let fileCount = 0;
function countFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      countFiles(path.join(dir, entry.name));
    } else {
      fileCount++;
    }
  }
}
countFiles(OUT);
console.log(`Bundled server: ${fileCount} files into server/`);
