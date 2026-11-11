import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { NFSE_THIRD_PARTY_REGISTRY } from './file-line-third-party-sources.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checker = join(root, 'scripts/check-file-line-limits.mjs');
const canonical = JSON.parse(readFileSync(join(root, NFSE_THIRD_PARTY_REGISTRY), 'utf8'));
const source = canonical.sources.find(entry => entry.path.endsWith('/1.01/tiposComplexos_v1.01.xsd'));
const upstreamBytes = readFileSync(join(root, source.path));

function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(), 'nfse-line-checker-'));
  const write = (path, content) => {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), content);
  };
  const manifest = paths => write('manifest.md', `## Manifesto explícito\n${paths.map(path => `- \`${path}\``).join('\n')}\nTotal: ${paths.length} arquivos\n`);
  const registry = sources => write(NFSE_THIRD_PARTY_REGISTRY, JSON.stringify({ version: 1, sources }));
  const config = changes => write('ai/operacao/qualidade/limite-linhas.json', JSON.stringify({
    version: 1, maxLines: 500, manifests: ['manifest.md'], thirdPartyRegistry: NFSE_THIRD_PARTY_REGISTRY, ...changes,
  }));
  const check = (args = [], env = {}) => {
    const result = spawnSync(process.execPath, [checker, ...args], { cwd: directory, encoding: 'utf8', env: { ...process.env, ...env } });
    return { status: result.status, output: result.stdout + result.stderr };
  };
  try {
    config({});
    write('ai/operacao/LOTE_ATIVO.md', 'Manifesto explícito: `manifest.md`\n');
    write(source.path, upstreamBytes); registry([source]); manifest([source.path]);
    run({ directory, write, registry, manifest, config, check });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('exact official XSD above 500 lines is checked by raw-byte digest and exempted', () => fixture(({ check }) => {
  const result = check(); assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Exceções\/artefatos ignorados: 1/);
}));

test('changed source bytes are refused, including CRLF normalization', () => fixture(({ write, check }) => {
  assert.ok(upstreamBytes.includes(Buffer.from('\r\n')));
  write(source.path, upstreamBytes.toString('utf8').replaceAll('\r\n', '\n'));
  const result = check(); assert.equal(result.status, 1);
  assert.match(result.output, /Fonte de terceiros foi alterada/);
}));

test('a manual implementation cannot enter the third-party registry', () => fixture(({ write, registry, manifest, check }) => {
  const path = 'modules/gestor/emissor-nfse/manual.ts';
  write(path, 'manual\n'.repeat(501)); registry([{ ...source, path }]); manifest([path]);
  const result = check(); assert.equal(result.status, 1);
  assert.match(result.output, /fora da allowlist/); assert.match(result.output, /501 linhas; teto 500/);
}));

test('the xsd extension is not globally ignored', () => fixture(({ write, manifest, check }) => {
  const path = 'modules/gestor/emissor-nfse/manual.xsd';
  write(path, 'manual\n'.repeat(501)); manifest([source.path, path]);
  const result = check(); assert.equal(result.status, 1);
  assert.match(result.output, /manual\.xsd: 501 linhas; teto 500/);
}));

test('wrong checksum or unofficial provenance cannot exempt an official path', () => fixture(({ registry, check }) => {
  for (const change of [{ sha256: '0'.repeat(64) }, { officialUrl: 'https://example.invalid/schema.zip' },
    { archiveSha256: '0'.repeat(64) }, { archiveMember: '../tiposComplexos_v1.01.xsd' }, { reason: '' }]) {
    registry([{ ...source, ...change }]); const result = check(); assert.equal(result.status, 1);
    assert.match(result.output, /Fonte de terceiros (foi alterada|sem SHA-256)/);
  }
}));

test('registry indirection and duplicate entries fail closed', () => fixture(({ registry, config, check }) => {
  registry([source, source]); assert.match(check().output, /Fonte de terceiros duplicada/);
  config({ thirdPartyRegistry: 'unreviewed.json' });
  const result = check(); assert.equal(result.status, 1); assert.match(result.output, /caminho autorizado/);
}));

test('a symlink cannot replace the registered upstream file', () => fixture(({ directory, write, check }) => {
  write('manual-source.xsd', upstreamBytes); rmSync(join(directory, source.path));
  symlinkSync(join(directory, 'manual-source.xsd'), join(directory, source.path));
  const result = check(); assert.equal(result.status, 1);
  assert.match(result.output, /Fonte de terceiros ausente ou não regular/);
}));

const retiredRegistryPath = 'ai/operacao/qualidade/limite-linhas-retired-paths.json';
const retired = { path: 'retired.ts', retiredInManifest: 'manifest.md', reason: 'Substituído por implementação com histórico preservado.' };

test('retired paths registry preserves inline compatibility and rejects missing, invalid, duplicate or still-existing entries', () => fixture(({ write, manifest, config, check }) => {
  manifest([source.path, retired.path]);
  config({ retiredPathsRegistry: retiredRegistryPath });
  assert.match(check().output, /Registro de paths retirados não encontrado/);
  write(retiredRegistryPath, JSON.stringify({ version: 2, retiredPaths: [retired] }));
  assert.match(check().output, /exige version 1/);
  write(retiredRegistryPath, JSON.stringify({ version: 1, retiredPaths: [retired] }));
  assert.equal(check().status, 0);
  config({ retiredPaths: [retired], retiredPathsRegistry: retiredRegistryPath });
  assert.match(check().output, /Registro de path retirado duplicado/);
  config({ retiredPaths: [retired] });
  assert.equal(check().status, 0, 'Historic inline registries remain supported');
  write(retired.path, 'still present\n');
  assert.match(check().output, /path marcado como retirado ainda existe/);
}));

// A synthetic read-only git executable supplies base file bytes without creating
// repositories, commits, branches or relying on the checkout's unrelated history.
function baseReader(directory, write, files) {
  write('bin/git', '#!/usr/bin/env node\nconst fs=require("node:fs");const files=JSON.parse(fs.readFileSync(process.env.NFSE_TEST_BASE_FILES,"utf8"));'
    + 'const value=files[process.argv[3]];if(process.argv[2]!=="show"||typeof value!=="string")process.exit(1);process.stdout.write(value);\n');
  chmodSync(join(directory, 'bin/git'), 0o755);
  write('base-files.json', JSON.stringify(files));
  return { PATH: `${join(directory, 'bin')}:${process.env.PATH}`, NFSE_TEST_BASE_FILES: join(directory, 'base-files.json') };
}

test('diff guard preserves inline base entries when moved into the new registry and refuses mutation', () => fixture(({ directory, write, manifest, config, check }) => {
  manifest([source.path, retired.path]);
  config({ retiredPathsRegistry: retiredRegistryPath });
  write(retiredRegistryPath, JSON.stringify({ version: 1, retiredPaths: [retired] }));
  const env = baseReader(directory, write, { 'base:ai/operacao/qualidade/limite-linhas.json': JSON.stringify({ manifests: ['manifest.md'], retiredPaths: [retired] }) });
  assert.equal(check(['--check-diff', 'base', 'head'], env).status, 0);
  write(retiredRegistryPath, JSON.stringify({ version: 1, retiredPaths: [{ ...retired, reason: 'Changed history' }] }));
  assert.match(check(['--check-diff', 'base', 'head'], env).output, /Registro de path retirado foi removido ou alterado/);
}));

test('diff guard reads the registry from the base and refuses missing registry or removed entries', () => fixture(({ directory, write, manifest, config, check }) => {
  manifest([source.path, retired.path]);
  config({ retiredPathsRegistry: retiredRegistryPath });
  write(retiredRegistryPath, JSON.stringify({ version: 1, retiredPaths: [retired] }));
  const baseFiles = { 'base:ai/operacao/qualidade/limite-linhas.json': JSON.stringify({ manifests: ['manifest.md'], retiredPathsRegistry: retiredRegistryPath }),
    [`base:${retiredRegistryPath}`]: JSON.stringify({ version: 1, retiredPaths: [retired] }) };
  const env = baseReader(directory, write, baseFiles);
  assert.equal(check(['--check-diff', 'base', 'head'], env).status, 0);
  write(retiredRegistryPath, JSON.stringify({ version: 1, retiredPaths: [] }));
  assert.match(check(['--check-diff', 'base', 'head'], env).output, /Registro de path retirado foi removido ou alterado/);
  delete baseFiles[`base:${retiredRegistryPath}`]; write('base-files.json', JSON.stringify(baseFiles));
  assert.match(check(['--check-diff', 'base', 'head'], env).output, /Registro de paths retirados não encontrado na base/);
}));
