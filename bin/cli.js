#!/usr/bin/env node
import fs from 'fs';
import chokidar from 'chokidar';
import path from 'path';
import { runWatcher } from '../src/index.js';

const CONFIG_PATH = path.resolve(process.cwd(), 'minikit.config.json');

const activeWatchers = new Map();

chokidar.watch(CONFIG_PATH).on('all', () => {
	for(const [key, closeFn] of activeWatchers) {
		console.log(`🪦 Stopping watcher for ${key}`);
		closeFn();
	}
	activeWatchers.clear();

	if(!fs.existsSync(CONFIG_PATH)) {
		console.error(`❌ config.json not found. Waiting for it to appear...`);
		return;
	}

	let config;
	try {
		config = fs.readFileSync(CONFIG_PATH, 'utf-8');
	} catch(err) {
		console.error(`❌ Error reading config.json:`, err.message);
		return;
	}

	try {
		config = JSON.parse(config);
	} catch(err) {
		console.error(`❌ Invalid JSON in config.json:`, err.message);
		return;
	}

	if(!Array.isArray(config)) {
		console.error(`❌ config.json should be an array of objects.`);
		return;
	}

	for(const entry of config) {
		let src, out;
		try {
			src = path.resolve(process.cwd(), entry.src);
			out = path.resolve(process.cwd(), entry.out);
		} catch(err) {
			console.error(`❌ Invalid path in config.json:`, err.message);
			continue;
		}
		console.log(`📡 Watching: ${srcDir}`);
		console.log(`📦 Output to: ${outDir}`);
		activeWatchers.set(`${srcDir}→${outDir}`, runWatcher(srcDir, outDir));
	}
});
