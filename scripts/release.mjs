#!/usr/bin/env bun
/**
 * Cuts a release: bumps the version everywhere it lives, commits, tags vX.Y.Z and pushes both.
 * The tag push triggers `.github/workflows/firebase-hosting-release.yml`, which checks, builds,
 * deploys to the live Firebase Hosting channel and publishes a GitHub Release.
 *
 *   bun run release                 # patch bump (0.1.0 → 0.1.1), asks for confirmation
 *   bun run release minor|major     # or an explicit version: bun run release 1.2.0
 *   bun run release patch --yes     # no prompt (agents: only after the user confirmed)
 *   bun run release --dry-run       # print the plan, change nothing
 *   bun run release --skip-check    # skip the local `bun run check` (CI still runs it)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const bump = args.find((a) => !a.startsWith('--')) ?? 'patch';
const dry = flags.has('--dry-run');
const BRANCH = 'main';
const WORKFLOW = 'firebase-hosting-release.yml';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const run = (cmd, ...a) => execFileSync(cmd, a, { stdio: 'inherit' });
const fail = (msg) => {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  process.exit(1);
};
const step = (msg) => console.log(`\x1b[36m›\x1b[0m ${msg}`);

// Files that carry the app version (web, desktop shell, Rust crate and its lockfile entry).
const VERSION_FILES = [
  { path: 'package.json', re: /("version":\s*")[^"]+(")/ },
  { path: 'src-tauri/tauri.conf.json', re: /("version":\s*")[^"]+(")/ },
  { path: 'src-tauri/Cargo.toml', re: /(\[package\][^[]*?\nversion = ")[^"]+(")/ },
  { path: 'src-tauri/Cargo.lock', re: /(name = "bloomgrid"\nversion = ")[^"]+(")/ },
];

function nextVersion(current, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const [maj, min, pat] = current.split('.').map(Number);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  if (kind === 'patch') return `${maj}.${min}.${pat + 1}`;
  fail(`unknown bump "${kind}" (use patch, minor, major or X.Y.Z)`);
}

const cmp = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

// Preconditions: on main, clean tracked tree, in sync with origin, tag unused.
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== BRANCH) fail(`releases are cut from ${BRANCH} (on ${branch})`);
if (git('status', '--porcelain', '--untracked-files=no')) fail('commit or stash tracked changes first');
step('fetching origin');
git('fetch', '--quiet', '--tags', 'origin', BRANCH);
const behind = Number(git('rev-list', '--count', `HEAD..origin/${BRANCH}`));
if (behind > 0) fail(`${BRANCH} is ${behind} commit(s) behind origin/${BRANCH}: pull first`);

const current = JSON.parse(readFileSync('package.json', 'utf8')).version;
const version = nextVersion(current, bump);
const tag = `v${version}`;
if (cmp(version, current) <= 0) fail(`${version} is not newer than ${current}`);
if (git('tag', '--list', tag)) fail(`tag ${tag} already exists`);
const ahead = Number(git('rev-list', '--count', `origin/${BRANCH}..HEAD`));

console.log(`\nRelease \x1b[1m${current} → ${version}\x1b[0m (${tag})`);
console.log(`  ${ahead} unpushed commit(s) on ${BRANCH} will be pushed with it`);
console.log(`  pushing ${tag} deploys to the live Firebase site via ${WORKFLOW}\n`);
if (dry) {
  console.log('Dry run: would run `bun run check`, bump', VERSION_FILES.map((f) => f.path).join(', '));
  console.log(`then commit "Release ${tag}", tag ${tag} and push ${BRANCH} + ${tag} atomically.`);
  process.exit(0);
}
if (!flags.has('--yes')) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question('Proceed? [y/N] ')).trim().toLowerCase();
  rl.close();
  if (answer !== 'y' && answer !== 'yes') fail('aborted');
}

if (!flags.has('--skip-check')) {
  step('bun run check');
  run('bun', 'run', 'check');
}

step(`bumping version in ${VERSION_FILES.length} files`);
for (const { path, re } of VERSION_FILES) {
  const src = readFileSync(path, 'utf8');
  if (!re.test(src)) fail(`no version field found in ${path}`);
  writeFileSync(path, src.replace(re, `$1${version}$2`));
}

step(`committing and tagging ${tag}`);
git('add', ...VERSION_FILES.map((f) => f.path));
git('commit', '--quiet', '-m', `Release ${tag}`);
git('tag', '-a', tag, '-m', `Release ${tag}`);

step(`pushing ${BRANCH} and ${tag}`);
run('git', 'push', '--atomic', 'origin', BRANCH, tag);

const repo = git('remote', 'get-url', 'origin')
  .replace(/\.git$/, '')
  .replace(/^git@github\.com:/, 'https://github.com/');
console.log(`\n\x1b[32m✓ ${tag} pushed.\x1b[0m Deploy: ${repo}/actions/workflows/${WORKFLOW}`);
console.log(
  `  Watch it: gh run watch $(gh run list --workflow=${WORKFLOW} --limit 1 --json databaseId -q '.[0].databaseId')`,
);
