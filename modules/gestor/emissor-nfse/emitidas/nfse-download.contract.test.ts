import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createNfseDownloadArchive, MAX_NFSE_ZIP_DOCUMENTS, type NfseDownloadFile,
  type NfseFileReader, type NfseZipWriter, type NfseDownloadFormat } from './nfse-download.core';
import type { NfseScope } from '../types/nfse.types';
import type { IssuedNfseIdentity } from '../visualizador/services/nfse-issued-xml.service-core';

// Keep JSZip external in the isolated ESM test bundle; resolve the project's pinned dependency.
const JSZip: typeof import('jszip') = createRequire(`${process.cwd()}/package.json`)('jszip');
const scope: NfseScope = { contextKey: 'synthetic-context',
  poloId: '00000000-0000-0000-0000-000000000001', environment: 'HOMOLOGACAO', month: '2026-11' };
const documents: IssuedNfseIdentity[] = [1, 2, 3, 4].map(number => ({ id: `document-${number}`,
  status: 'EMITIDA', number: String(number), accessKey: String(number).repeat(50) }));
const source = '<?xml version="1.0" encoding="utf-8"?>\r\n<NFSe>  ç &amp; teste\n</NFSe>';
const fileFor = (document: IssuedNfseIdentity, format: NfseDownloadFormat): NfseDownloadFile => ({
  name: `NFS-e-${document.accessKey}.${format}`,
  blob: new Blob([format === 'xml' ? source : '%PDF-1.7\nsynthetic PDF bytes\n%%EOF']),
});
const create = (patch: Partial<Parameters<typeof createNfseDownloadArchive>[0]> = {}) => createNfseDownloadArchive({
  scope, documents: documents.slice(0, 2), format: 'xml', signal: new AbortController().signal,
  readFile: async (_scope, document, format) => fileFor(document, format), createZip: () => new JSZip(), ...patch,
});

test('real ZIP preserves original XML bytes, distinct filenames and progress for every selected note', async () => {
  const progress: string[] = [];
  const archive = await create({ onProgress: value => progress.push(`${value.phase}:${value.completed}/${value.total}`) });
  assert.equal(archive.name, 'NFS-e-HOMOLOGACAO-2026-11-XML.zip');
  assert.equal(archive.blob.type, 'application/zip');
  const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
  assert.deepEqual(Object.keys(zip.files).sort(), documents.slice(0, 2).map(document => fileFor(document, 'xml').name).sort());
  for (const file of Object.values(zip.files)) {
    assert.deepEqual(await file.async('uint8array'), new TextEncoder().encode(source));
  }
  assert.deepEqual(progress, ['files:1/2', 'files:2/2', 'zip:2/2']);
});

test('PDF ZIP stores each canonical PDF as its own binary file', async () => {
  const archive = await create({ format: 'pdf' });
  const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
  assert.equal(Object.keys(zip.files).length, 2);
  for (const [name, file] of Object.entries(zip.files)) {
    assert.ok(name.endsWith('.pdf'));
    assert.equal(await file.async('string'), '%PDF-1.7\nsynthetic PDF bytes\n%%EOF');
  }
});

test('invalid scope, pending notes, duplicate identities and excess selection fail before reading files', async () => {
  let reads = 0;
  const readFile: NfseFileReader = async (_scope, document, format) => { reads++; return fileFor(document, format); };
  for (const selection of [[], [documents[0], documents[0]],
    [{ ...documents[0], status: 'PENDENTE' }], [{ ...documents[0], accessKey: null }],
    [documents[0], { ...documents[1], accessKey: documents[0].accessKey }],
    Array.from({ length: MAX_NFSE_ZIP_DOCUMENTS + 1 }, () => documents[0])]) {
    await assert.rejects(create({ documents: selection as IssuedNfseIdentity[], readFile }));
  }
  await assert.rejects(create({ scope: { ...scope, poloId: 'todos' }, readFile }));
  await assert.rejects(create({ format: 'exe' as never, readFile }));
  assert.equal(reads, 0);
});

test('two parallel readers bound concurrency while exporting the complete selection', async () => {
  let active = 0;
  let maximum = 0;
  let calls = 0;
  await create({ documents, readFile: async (_scope, document, format) => {
    maximum = Math.max(maximum, ++active);
    calls++;
    await Promise.resolve();
    active--;
    return fileFor(document, format);
  } });
  assert.equal(maximum, 2);
  assert.equal(calls, documents.length);
});

test('one denied file aborts its sibling and never generates a partial archive', async () => {
  let generated = false;
  let siblingAborted = false;
  const zip = new JSZip();
  await assert.rejects(create({ createZip: () => ({
    file: (name, bytes) => zip.file(name, bytes),
    generateAsync: async () => { generated = true; return new Uint8Array(); },
  }), readFile: async (_scope, document, _format, signal) => {
    if (document.id === documents[0].id) throw new Error('Acesso negado ao documento selecionado.');
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
      siblingAborted = true;
      reject(new globalThis.DOMException('Cancelled', 'AbortError'));
    }, { once: true }));
  } }), /Acesso negado/);
  assert.equal(generated, false);
  assert.equal(siblingAborted, true);
});

test('empty or oversized files and unsafe or duplicate filenames fail without ZIP output', async () => {
  for (const name of ['../nota.xml', '/nota.xml', 'pasta\\nota.xml', 'nota.pdf', 'nota\u0000.xml']) {
    await assert.rejects(create({ readFile: async () => ({ name, blob: new Blob([source]) }) }), /Nome de arquivo inválido/);
  }
  await assert.rejects(create({ readFile: async () => ({ name: 'same.xml', blob: new Blob([source]) }) }), /Nome de arquivo inválido/);
  await assert.rejects(create({ maxBytes: 3 }), /50 MB/);
  await assert.rejects(create({ readFile: async () => ({ name: 'empty.xml', blob: new Blob([]) }) }), /vazio/);
});

test('cancellation before reading or during compression never returns a downloadable artifact', async () => {
  const before = new AbortController();
  before.abort();
  let reads = 0;
  await assert.rejects(create({ signal: before.signal, readFile: async () => { reads++; throw new Error(); } }), { name: 'AbortError' });
  assert.equal(reads, 0);
  const during = new AbortController();
  const zip: NfseZipWriter = { file: () => undefined, generateAsync: async (_options, update) => {
    during.abort();
    update({ percent: 50 });
    return new Uint8Array([1]);
  } };
  await assert.rejects(create({ signal: during.signal, createZip: () => zip }), { name: 'AbortError' });
});

test('scope and selected identities are captured before asynchronous work', async () => {
  const mutableScope = { ...scope };
  const mutableDocuments = documents.slice(0, 2).map(document => ({ ...document }));
  const seen: string[] = [];
  await create({ scope: mutableScope, documents: mutableDocuments, readFile: async (captured, document, format) => {
    seen.push(`${captured.environment}:${document.accessKey}`);
    mutableScope.environment = 'PRODUCAO';
    mutableDocuments[1].accessKey = '9'.repeat(50);
    await Promise.resolve();
    return fileFor(document, format);
  } });
  assert.deepEqual(seen, documents.slice(0, 2).map(document => `HOMOLOGACAO:${document.accessKey}`));
});
