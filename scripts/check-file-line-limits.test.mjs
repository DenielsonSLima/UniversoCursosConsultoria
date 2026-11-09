import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
  const check = () => {
    const result = spawnSync(process.execPath, [checker], { cwd: directory, encoding: 'utf8' });
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
