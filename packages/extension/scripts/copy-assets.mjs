// The minim.init command runs install() from inside the extension, so the VSIX
// must carry the CLI's compiled runtime and templates. Layout must match the
// InstallAssets contract: runtimeDir contains bin/ and dist/.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '..', '..', 'cli');
const assets = path.resolve(here, '..', 'assets');

for (const required of ['bin', 'dist', 'templates']) {
  if (!existsSync(path.join(cli, required))) {
    console.error(
      `copy-assets: packages/cli/${required} is missing. Build the CLI first: npm run build -w minim-copilot`
    );
    process.exit(1);
  }
}

rmSync(assets, { recursive: true, force: true });
mkdirSync(path.join(assets, 'runtime'), { recursive: true });
cpSync(path.join(cli, 'bin'), path.join(assets, 'runtime', 'bin'), { recursive: true });
cpSync(path.join(cli, 'dist'), path.join(assets, 'runtime', 'dist'), { recursive: true });
cpSync(path.join(cli, 'templates'), path.join(assets, 'templates'), { recursive: true });
console.log('copy-assets: runtime and templates staged');
