import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const sharedOptions = {
  bundle: true,
  minify: production,
  sourcemap: !production,
};

async function build() {
  const extensionCtx = await esbuild.context({
    ...sharedOptions,
    entryPoints: ['src/extension.ts'],
    outfile: 'out/extension.js',
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
  });

  const webviewCtx = await esbuild.context({
    ...sharedOptions,
    entryPoints: ['webview-src/main.ts'],
    outfile: 'out/webview.js',
    platform: 'browser',
    format: 'iife',
  });

  const workerCtx = await esbuild.context({
    ...sharedOptions,
    entryPoints: ['webview-src/dsp/worker.ts'],
    outfile: 'out/worker.js',
    platform: 'browser',
    format: 'iife',
  });

  if (watch) {
    await extensionCtx.watch();
    await webviewCtx.watch();
    await workerCtx.watch();
    console.log('Watching for changes...');
  } else {
    await extensionCtx.rebuild();
    await webviewCtx.rebuild();
    await workerCtx.rebuild();
    await extensionCtx.dispose();
    await webviewCtx.dispose();
    await workerCtx.dispose();
    console.log('Build complete.');
  }
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
