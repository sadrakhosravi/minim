import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIER0_CAP } from '../../core/src/budget.ts';

const CLI = fileURLToPath(new URL('../bin/minim.js', import.meta.url));

function cli(args: string[], cwd: string): string {
  return execFileSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'minim-'));
}

test('budget reports no instruction files in a bare repo', () => {
  assert.match(cli(['budget'], tmpRepo()), /no instruction files found/);
});

test('budget exits 1 and prints OVER for an oversized tier 0', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, '.github'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.github', 'copilot-instructions.md'),
    'x'.repeat((TIER0_CAP + 1) * 4)
  );
  assert.throws(
    () => cli(['budget'], root),
    (e: unknown) => {
      const err = e as { status: number; stdout: string };
      assert.equal(err.status, 1);
      assert.match(err.stdout, /OVER/);
      return true;
    }
  );
});

test('mem add then list round-trips, and a repeat is reported as duplicate', () => {
  const root = tmpRepo();
  assert.match(cli(['mem', 'add', 'payments', 'API', 'is', 'v2'], root), /saved/);
  assert.match(cli(['mem', 'list'], root), /payments API is v2/);
  assert.match(cli(['mem', 'add', 'payments', 'API', 'is', 'v2'], root), /duplicate/);
});

test('mem list on an empty repo says so', () => {
  assert.match(cli(['mem', 'list'], tmpRepo()), /no memory yet/);
});

test('mem compact archives nothing when everything is recent', () => {
  const root = tmpRepo();
  cli(['mem', 'add', 'recent thing'], root);
  assert.match(cli(['mem', 'compact'], root), /kept 1, archived 0/);
});

test('stats on an empty repo prints zeros', () => {
  assert.match(cli(['stats'], tmpRepo()), /sessions:\s+0/);
});

test('pack writes a prompt file and reports its token count', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'auth.js'), 'export function login() {}\n');
  const out = cli(['pack', '--task', 'fix login', 'src/auth.js'], root);
  assert.match(out, /wrote \.github\/prompts\/minim-pack\.prompt\.md/);
  assert.match(out, /~\d+ tokens/);
  const md = fs.readFileSync(path.join(root, '.github', 'prompts', 'minim-pack.prompt.md'), 'utf8');
  assert.match(md, /mode: agent/);
  assert.match(md, /fix login/);
});

test('pack honors --out', () => {
  const root = tmpRepo();
  fs.writeFileSync(path.join(root, 'a.js'), 'let a = 1;\n');
  cli(['pack', '--task', 'tweak a', '--out', 'custom.md', 'a.js'], root);
  assert.ok(fs.existsSync(path.join(root, 'custom.md')));
});

test('pack refuses to exceed the token cap without --force', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, '.minim'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.minim', 'config.json'),
    JSON.stringify({ pack: { maxTokens: 10 } })
  );
  fs.writeFileSync(path.join(root, 'big.js'), 'x'.repeat(4000));
  assert.throws(
    () => cli(['pack', '--task', 'trim this file down', 'big.js'], root),
    (e: unknown) => {
      const err = e as { status: number; stderr: string };
      assert.equal(err.status, 1);
      assert.match(err.stderr, /exceeds cap/);
      return true;
    }
  );
  cli(['pack', '--task', 'trim this file down', '--force', 'big.js'], root);
  assert.ok(fs.existsSync(path.join(root, '.github', 'prompts', 'minim-pack.prompt.md')));
});

test('pack without a task exits 1 with usage', () => {
  assert.throws(
    () => cli(['pack', 'a.js'], tmpRepo()),
    (e: unknown) => {
      assert.match((e as { stderr: string }).stderr, /usage: minim pack/);
      return true;
    }
  );
});

test('mem with no subcommand exits 1', () => {
  assert.throws(() => cli(['mem'], tmpRepo()));
});
