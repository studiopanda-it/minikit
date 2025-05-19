#!/usr/bin/env node
import path from 'path';
import { runWatcher } from '../src/index.js';

const args = process.argv.slice(2);
const srcDir = path.resolve(process.cwd(), args[0] || './src');
const outDir = path.resolve(process.cwd(), args[1] || './dist');

console.log(`📡 Watching: ${srcDir}`);
console.log(`📦 Output to: ${outDir}`);

runWatcher(srcDir, outDir);
