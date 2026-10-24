import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isSupportedNodeVersion } from './check-node-security.mjs';

test('security floor accepts patched stable Node 24 only', () => {
  for (const version of ['24.22.1', 'v24.22.1', '24.22.2', '24.23.0']) {
    assert.equal(isSupportedNodeVersion(version), true, version);
  }
  for (const version of ['24.22.0', '24.21.9', '24.19.0', '22.23.4', '26.12.1',
    '24.22.1-rc.1', '24.22', 'invalid', '24.22.1+custom']) {
    assert.equal(isSupportedNodeVersion(version), false, version);
  }
});

test('CLI checks the actual process version and exits safely', () => {
  const result = spawnSync(process.execPath, ['scripts/check-node-security.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, isSupportedNodeVersion(process.version) ? 0 : 1);
  assert.equal(result.stdout.trim(), `[node-security-build] ${process.version}`);
});

test('runtime evidence is checked independently from the local build version', () => {
  for (const [version, expectedStatus] of [['v24.21.0', 1], ['v24.22.1', 0],
    ['v24.22.1-rc.1', 1], ['v26.12.1', 1], ['24.x', 1]]) {
    const result = spawnSync(process.execPath,
      ['scripts/check-node-security.mjs', '--runtime-version', version], { encoding: 'utf8' });
    assert.equal(result.status, expectedStatus, version);
    assert.match(result.stdout, /\[node-security-runtime-check\]/);
    assert.ok(!result.stdout.includes('[node-security-build]'));
    if (expectedStatus === 1) assert.match(result.stderr, /Runtime não validado/);
  }
});

test('runtime CLI rejects missing or unknown arguments', () => {
  for (const args of [['--runtime-version'], ['--skip'], ['--runtime-version', 'v24.22.1', '--extra']]) {
    const result = spawnSync(process.execPath, ['scripts/check-node-security.mjs', ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Uso:/);
  }
});

test('build gate precedes existing build pipeline', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.engines.node, '24.x');
  assert.equal(pkg.scripts.build,
    'node scripts/check-node-security.mjs && npm run check:version && vite build && node scripts/generate-social-share-pages.mjs');
});

test('social preview preserves responses and logs version only once', async () => {
  const root = await mkdtemp(join(tmpdir(), 'universo-social-security-'));
  const oldCwd = process.cwd();
  const originalInfo = console.info;
  const logs = [];
  console.info = (...values) => logs.push(values);
  try {
    await mkdir(join(root, 'dist/_social-share'), { recursive: true });
    await writeFile(join(root, 'dist/_social-share/ead-detail.html'), '<html><head></head><body>Curso</body></html>');
    process.chdir(root);
    const { default: handler } = await import('../api/social-preview.js');
    const invoke = async query => {
      const response = { headers: {}, status(code) { this.code = code; return this; },
        send(body) { this.body = body; return this; },
        setHeader(key, value) { this.headers[key] = value; } };
      await handler({ query }, response);
      return response;
    };
    const ok = await invoke({ template: 'ead-detail', path: '/ead/curso-teste' });
    assert.equal(ok.code, 200);
    assert.match(ok.body, /rel="canonical"/);
    assert.match(ok.body, /\/ead\/curso-teste/);
    assert.equal(ok.headers['Content-Type'], 'text/html; charset=utf-8');
    assert.equal((await invoke({ template: 'ead-detail', path: '/ead/../secret' })).code, 400);
    assert.equal((await invoke({ template: 'unknown', path: '/ead/test' })).code, 400);
    assert.equal((await invoke({ template: 'ead-detail', path: '/ead/another' })).code, 200);
    assert.deepEqual(logs, [[`[node-security-runtime] ${process.version}`]]);
    assert.ok(!ok.body.includes(process.version));
    assert.ok(!Object.values(ok.headers).some(value => value.includes(process.version)));
  } finally {
    console.info = originalInfo;
    process.chdir(oldCwd);
    await rm(root, { recursive: true, force: true });
  }
});
