#!/usr/bin/env node
// Copies the app template into a new folder.   node create.mjs <target-folder>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2];
if (!target) { console.error('Usage: node create.mjs <target-folder>'); process.exit(1); }
const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'kernel');
const dest = path.resolve(target);
if (fs.existsSync(dest) && fs.readdirSync(dest).length) { console.error(`${dest} already exists and is not empty.`); process.exit(1); }
const skip = new Set(['node_modules', 'dist', 'data', '.DS_Store']);
fs.cpSync(src, dest, { recursive: true, filter: (p) => !skip.has(path.basename(p)) });
console.log(`Created ${dest}\nNext: cd there, run "npm install", then write system.config.ts.`);
