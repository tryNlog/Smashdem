import { execFileSync } from 'node:child_process';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outputDirectory = 'dist-relay-build';
const relayUrl = 'wss://relay.example';
const viteCli = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));

async function main() {
  await rm(outputDirectory, { force: true, recursive: true });

  try {
    execFileSync(process.execPath, [viteCli, 'build', '--outDir', outputDirectory, '--logLevel', 'warn'], {
      env: { ...process.env, VITE_RELAY_URL: relayUrl },
      stdio: 'inherit',
    });

    const assetsDirectory = join(outputDirectory, 'assets');
    const assetNames = await readdir(assetsDirectory);
    const scripts = await Promise.all(
      assetNames
        .filter((name) => name.endsWith('.js'))
        .map((name) => readFile(join(assetsDirectory, name), 'utf8')),
    );

    const bundle = scripts.join('\n');
    if (!bundle.includes(relayUrl)) {
      throw new Error('VITE_RELAY_URL was not embedded in the production bundle');
    }

    console.log('Relay build configuration cases: 1/1 observed');
  } finally {
    await rm(outputDirectory, { force: true, recursive: true });
  }
}

await main();
