import * as esbuild from 'esbuild';
import { mkdirSync } from 'fs';

const watch = process.argv.includes('--watch');

const entries = [
  { in: 'src/background/service_worker.js', out: 'extension/background/service_worker.js' },
  { in: 'src/popup/popup.js', out: 'extension/popup/popup.js' },
  { in: 'src/permissions_ui/confirm.js', out: 'extension/permissions_ui/confirm.js' },
  { in: 'src/sidepanel/sidepanel.js', out: 'extension/sidepanel/sidepanel.js' },
];

mkdirSync('extension/background', { recursive: true });
mkdirSync('extension/popup', { recursive: true });
mkdirSync('extension/permissions_ui', { recursive: true });
mkdirSync('extension/sidepanel', { recursive: true });

const common = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome109'],
  logLevel: 'info',
};

async function buildAll() {
  await Promise.all(
    entries.map(({ in: entry, out }) =>
      esbuild.build({
        ...common,
        entryPoints: [entry],
        outfile: out,
      })
    )
  );
  console.log('Build complete.');
}

if (watch) {
  const ctxs = await Promise.all(
    entries.map(({ in: entry, out }) =>
      esbuild.context({ ...common, entryPoints: [entry], outfile: out }).then((ctx) => {
        ctx.watch();
        return ctx;
      })
    )
  );
  console.log('Watching...');
} else {
  await buildAll();
}
