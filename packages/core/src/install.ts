import fs from 'node:fs';
import path from 'node:path';

export interface InstallAssets {
  /** Directory holding copilot-instructions.md, hooks.json, example.instructions.md, settings.json. */
  templatesDir: string;
  /** Directory containing bin/ and dist/. ONLY those two subdirectories are vendored. */
  runtimeDir: string;
}

const RUNTIME_SUBDIRS = ['bin', 'dist'];

const DEFAULT_CONFIG = {
  guard: { decision: 'ask' },
  memory: { maxAgeDays: 45 },
  pack: { maxTokens: 20000, maxLinesPerFile: 400 },
};

const GITIGNORE_ENTRIES = ['.minim/metrics/', '.minim/snapshots/', '.minim/debug/'];

function writeIfAbsent(dest: string, content: string, log: string[]): boolean {
  if (fs.existsSync(dest)) {
    log.push(`skip  ${dest} (exists)`);
    return false;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
  log.push(`write ${dest}`);
  return true;
}

export function install(targetRoot: string, assets: InstallAssets): string[] {
  const log: string[] = [];
  const tpl = (name: string): string =>
    fs.readFileSync(path.join(assets.templatesDir, name), 'utf8');

  // Tier 0: create, or append the managed block if the file exists without it.
  const tier0 = path.join(targetRoot, '.github', 'copilot-instructions.md');
  const block = tpl('copilot-instructions.md');
  if (!fs.existsSync(tier0)) {
    writeIfAbsent(tier0, block, log);
  } else if (!fs.readFileSync(tier0, 'utf8').includes('minim:begin')) {
    fs.appendFileSync(tier0, '\n' + block);
    log.push(`append ${tier0} (managed block)`);
  } else {
    log.push(`skip  ${tier0} (managed block present)`);
  }

  writeIfAbsent(path.join(targetRoot, '.github', 'hooks', 'minim.json'), tpl('hooks.json'), log);
  writeIfAbsent(
    path.join(targetRoot, '.github', 'instructions', 'example.instructions.md'),
    tpl('example.instructions.md'),
    log
  );
  writeIfAbsent(
    path.join(targetRoot, '.minim', 'config.json'),
    JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n',
    log
  );

  // Vendor the compiled runtime so teammates need no npm install. Only bin/ and
  // dist/ are copied — copying runtimeDir wholesale would drag src/, test/ and
  // node_modules into every consumer repo when run from a working tree.
  const rt = path.join(targetRoot, '.minim', 'runtime');
  fs.rmSync(rt, { recursive: true, force: true });
  fs.mkdirSync(rt, { recursive: true });
  for (const sub of RUNTIME_SUBDIRS) {
    fs.cpSync(path.join(assets.runtimeDir, sub), path.join(rt, sub), { recursive: true });
  }
  log.push(`write ${rt} (vendored runtime)`);

  // Settings: never merge, because the file may be JSONC. Suggest instead.
  const settings = path.join(targetRoot, '.vscode', 'settings.json');
  if (!writeIfAbsent(settings, tpl('settings.json'), log)) {
    writeIfAbsent(
      path.join(targetRoot, '.minim', 'suggested-settings.json'),
      tpl('settings.json'),
      log
    );
  }

  const gi = path.join(targetRoot, '.gitignore');
  const existing = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  const missing = GITIGNORE_ENTRIES.filter((e) => !existing.includes(e));
  if (missing.length) {
    const lead = existing.endsWith('\n') || !existing ? '' : '\n';
    fs.appendFileSync(gi, lead + missing.join('\n') + '\n');
    log.push(`append ${gi}`);
  }
  return log;
}
