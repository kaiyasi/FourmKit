#!/usr/bin/env node
// Normalize comments in frontend/src: remove scattered line comments and JSX comments,
// convert leading block comments to TSDoc style. Conservative: only removes
// lines that are purely comments and JSX block comments; does not touch inline code.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'frontend', 'src');
const exts = new Set(['.ts', '.tsx', '.js', '.jsx']);

/**
 * Walk directory and return file paths that match extensions
 */
function walk(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (exts.has(path.extname(e.name))) out.push(full);
  }
  return out;
}

function normalize(content) {
  let out = content;
  // 1) Remove JSX comments {/* ... */} conservatively
  out = out.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  const lines = out.split(/\r?\n/);
  const res = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    // 2) Remove standalone line comments (prefix //)
    if (/^\s*\/\//.test(line)) {
      // keep eslint/ts directives
      if (/^\s*\/\/\s*(eslint|ts-|@jsx)/i.test(line)) {
        res.push(line);
      } else {
        continue; // drop
      }
    } else {
      res.push(line);
    }
  }
  out = res.join('\n');

  // 3) Convert leading block comments to TSDoc style: lines starting with /* but not /**
  out = out.replace(/(^|\n)(\s*)\/\*(?!\*)([\s\S]*?)\*\//g, ($0, p1, p2, p3) => {
    // keep short css-like comments in styled blocks? we can't detect reliably; proceed.
    return `${p1}${p2}/**${p3}*/`;
  });

  return out;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error('Not found:', SRC);
    process.exit(1);
  }
  const files = walk(SRC);
  let changed = 0;
  for (const f of files) {
    const before = fs.readFileSync(f, 'utf8');
    const after = normalize(before);
    if (after !== before) {
      fs.writeFileSync(f, after, 'utf8');
      changed++;
    }
  }
  console.log(`[normalize-comments] Processed ${files.length} files, changed ${changed}.`);
}

main();

