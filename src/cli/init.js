import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function writeIfAbsent(dest, content, written) {
  if (fs.existsSync(dest)) {
    written.push(`skip  ${dest} (exists)`);
    return false;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
  written.push(`write ${dest}`);
  return true;
}

export function install(targetRoot, pkgRoot) {
  const written = [];
  const tpl = (name) => fs.readFileSync(path.join(pkgRoot, 'templates', name), 'utf8');

  // Tier 0: create, or append managed block if file exists without it.
  const tier0 = path.join(targetRoot, '.github', 'copilot-instructions.md');
  const block = tpl('copilot-instructions.md');
  if (!fs.existsSync(tier0)) {
    writeIfAbsent(tier0, block, written);
  } else if (!fs.readFileSync(tier0, 'utf8').includes('minim:begin')) {
    fs.appendFileSync(tier0, '\n' + block);
    written.push(`append ${tier0} (managed block)`);
  } else {
    written.push(`skip  ${tier0} (managed block present)`);
  }

  writeIfAbsent(path.join(targetRoot, '.github', 'hooks', 'minim.json'), tpl('hooks.json'), written);
  writeIfAbsent(
    path.join(targetRoot, '.github', 'instructions', 'example.instructions.md'),
    tpl('example.instructions.md'),
    written
  );
  writeIfAbsent(
    path.join(targetRoot, '.minim', 'config.json'),
    JSON.stringify(
      {
        guard: { decision: 'ask' },
        memory: { maxAgeDays: 45 },
        pack: { maxTokens: 20000, maxLinesPerFile: 400 },
      },
      null,
      2
    ) + '\n',
    written
  );

  // Vendor runtime so teammates need no npm install.
  const rt = path.join(targetRoot, '.minim', 'runtime');
  fs.rmSync(rt, { recursive: true, force: true });
  fs.mkdirSync(rt, { recursive: true });
  fs.cpSync(path.join(pkgRoot, 'src'), path.join(rt, 'src'), { recursive: true });
  fs.cpSync(path.join(pkgRoot, 'bin'), path.join(rt, 'bin'), { recursive: true });
  written.push(`write ${rt} (vendored runtime)`);

  // Settings: never merge (JSONC risk) — suggest instead.
  const settings = path.join(targetRoot, '.vscode', 'settings.json');
  if (!writeIfAbsent(settings, tpl('settings.json'), written)) {
    writeIfAbsent(path.join(targetRoot, '.minim', 'suggested-settings.json'), tpl('settings.json'), written);
  }

  // .gitignore entries.
  const gi = path.join(targetRoot, '.gitignore');
  const entries = ['.minim/metrics/', '.minim/snapshots/', '.minim/debug/'];
  const existing = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  const missing = entries.filter((e) => !existing.includes(e));
  if (missing.length) {
    fs.appendFileSync(gi, (existing.endsWith('\n') || !existing ? '' : '\n') + missing.join('\n') + '\n');
    written.push(`append ${gi}`);
  }
  return written;
}

export function run() {
  const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  for (const line of install(process.cwd(), pkgRoot)) console.log(line);
  console.log('\nminim init done. Commit .github/ and .minim/ (metrics/snapshots are gitignored).');
  console.log('If .vscode/settings.json existed, merge .minim/suggested-settings.json by hand.');
}
