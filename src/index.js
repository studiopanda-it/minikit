import path from 'path';
import fs from 'fs-extra';
import chokidar from 'chokidar';
import { transformAsync } from '@babel/core';
import { minify } from 'terser';
import * as sass from 'sass';
import postcss from 'postcss';
import autoprefixer from 'autoprefixer';
import { glob } from 'glob';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export function runWatcher(SRC_DIR, OUT_DIR) {
  const dependencyGraph = new Map();

  const watcher = chokidar.watch(SRC_DIR, {
    ignored: /(^|[/\\])\../,
    persistent: true,
    ignoreInitial: true
  });

  function isProcessable(filePath) {
    const ext = path.extname(filePath);
    if (!['.js'].includes(ext)) return false;
    const parts = path.relative(SRC_DIR, filePath).split(path.sep);
    return parts.every(part => !part.startsWith('_'));
  }

  function isScssProcessable(filePath) {
    const ext = path.extname(filePath);
    if (!['.scss', '.sass'].includes(ext)) return false;
    const parts = path.relative(SRC_DIR, filePath).split(path.sep);
    return parts.every(part => !part.startsWith('_'));
  }

  async function resolveImports(filePath, visited = new Set()) {
    const realPath = path.resolve(filePath);
    if (visited.has(realPath)) return '';
    visited.add(realPath);

    let content = await fs.readFile(realPath, 'utf8');
    dependencyGraph.set(realPath, []);

    const importRegex = /^\s*\/\/\s*@(?:import|codekit-prepend|prepros-prepend)\s+['"]?([^'"\n\r]+)['"]?\s*;?\s*$/gm;
    let match;
    let resolvedContent = '';

    let lastIndex = 0;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      const importFullPath = path.resolve(path.dirname(realPath), importPath);
      dependencyGraph.get(realPath).push(importFullPath);

      resolvedContent += content.slice(lastIndex, match.index);
      resolvedContent += await resolveImports(importFullPath, visited);
      lastIndex = importRegex.lastIndex;
    }

    resolvedContent += content.slice(lastIndex);
    return resolvedContent + ";";
  }

  async function recompile(filePath) {
    try {
      const code = await resolveImports(filePath);
      const babelResult = await transformAsync(code, {
        filename: path.basename(filePath),
				presets: [
					[require.resolve('@babel/preset-env'), {
						targets: {
							browsers: ['last 2 Chrome versions', 'last 2 Firefox versions', 'Safari >= 13']
						},
						useBuiltIns: false,
						modules: false,
						bugfixes: true,
						shippedProposals: true
					}]
				],
        sourceMaps: true
      });

      const minified = await minify(babelResult.code, {
        sourceMap: {
          content: babelResult.map,
          filename: path.basename(filePath),
          url: path.basename(filePath) + '.map'
        }
      });

      const relPath = path.relative(SRC_DIR, filePath);
      const outPath = path.join(OUT_DIR, relPath);

      await fs.ensureDir(path.dirname(outPath));
      fs.writeFile(outPath, minified.code);
      fs.writeFile(outPath + '.map', minified.map);

      console.log(`✅ Built JS: ${relPath}`);
    } catch (err) {
      console.error(`❌ Failed to compile JS: ${filePath}`, err);
    }
  }

  async function compileScss(filePath) {
    try {
      const relPath = path.relative(SRC_DIR, filePath);
      const outPath = path.join(OUT_DIR, relPath).replace(/\.(scss|sass)$/, '.css');

      const result = sass.compile(filePath, {
        style: 'compressed',
        sourceMap: true,
        charset: true,
      });

      const postCssResult = await postcss([autoprefixer]).process(result.css, {
        from: filePath,
        to: outPath,
        map: {
          inline: false,
          prev: result.sourceMap,
        },
      });

      const finalCss = `@charset "UTF-8";\n${postCssResult.css}`;

      await fs.ensureDir(path.dirname(outPath));
      await fs.writeFile(outPath, finalCss, 'utf8');
      if (postCssResult.map) {
        await fs.writeFile(outPath + '.map', postCssResult.map.toString());
      }

      console.log(`✅ Built SCSS: ${relPath}`);
    } catch (err) {
      console.error(`❌ Error compiling SCSS: ${filePath}`, err);
    }
  }

  async function compileAllScss() {
    const scssFiles = await glob('**/*.{scss,sass}', { cwd: SRC_DIR });
    for (const file of scssFiles) {
      const filePath = path.join(SRC_DIR, file);
      if (isScssProcessable(filePath)) {
        await compileScss(filePath);
      }
    }
  }

  async function compileAllJs() {
    const jsFiles = await glob('**/*.js', { cwd: SRC_DIR });
    for (const file of jsFiles) {
      const filePath = path.join(SRC_DIR, file);
      if (isProcessable(filePath)) {
        await recompile(filePath);
      }
    }
  }

  async function rebuildDependents(changedPath) {
    for (const [target, deps] of dependencyGraph.entries()) {
      if (deps.includes(changedPath)) {
        await recompile(target);
      }
    }
  }

  watcher.on('add', async (filePath) => {
    switch(path.extname(filePath)) {
      case '.js':
        if (path.basename(filePath).startsWith('_')) await rebuildDependents(path.resolve(filePath));
        else if (isProcessable(filePath)) await recompile(filePath);
        break;
      case '.scss':
      case '.sass':
        await compileAllScss();
    }
  });

  watcher.on('change', async (filePath) => {
    switch(path.extname(filePath)) {
      case '.js':
        if (path.basename(filePath).startsWith('_')) await rebuildDependents(path.resolve(filePath));
        else if (isProcessable(filePath)) await recompile(filePath);
        break;
      case '.scss':
      case '.sass':
        await compileAllScss();
    }
  });

  watcher.on('unlink', async (filePath) => {
    switch(path.extname(filePath)) {
      case '.js':
        if(path.basename(filePath).startsWith('_')) await rebuildDependents(path.resolve(filePath));
        else if(isProcessable(filePath)) {
          const outPath = path.join(OUT_DIR, path.relative(SRC_DIR, filePath));
          await fs.remove(outPath);
          await fs.remove(outPath + '.map');
          dependencyGraph.delete(filePath);
        }
        break;
      case '.scss':
      case '.sass':
        if(path.basename(filePath).startsWith('_')) await compileAllScss();
        else if(isScssProcessable(filePath)) {
          const outPath = path.join(OUT_DIR, path.relative(SRC_DIR, filePath)).replace(/\.(scss|sass)$/, '.css');
          await fs.remove(outPath);
          await fs.remove(outPath + '.map');
        }
    }
  });

  compileAllJs();
  compileAllScss();

  return () => {
    watcher.close();
  };

}