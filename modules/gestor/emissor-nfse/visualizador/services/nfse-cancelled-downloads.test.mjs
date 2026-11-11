import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import JSZip from 'jszip';

test('preview, PDF and ZIP share confirmed cancellation metadata, refresh captured identities and preserve original XML', async () => {
  const base = process.cwd();
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-cancelled-downloads-'));
  const bundle = resolve(temp, 'test.mjs');
  const scope = { contextKey: 'synthetic-context', poloId: '00000000-0000-0000-0000-000000000001', environment: 'PRODUCAO', month: '2026-11' };
  const selected = { id: 'synthetic-operation', status: 'EMITIDA', number: '3', accessKey: '3'.repeat(50), state: 'AUTHORIZED' };
  const cancelled = { ...selected, state: 'CANCELLED', cancelPreviewId: 'synthetic-cancel' };
  const xml = '<NFSe>XML ORIGINAL SINTÉTICO</NFSe>\r\n';
  const rendered = [], reads = [];
  globalThis.__cancelPdf = (document, _assets, _projection, options) => {
    rendered.push({ key: document.accessKey, options });
    return new Blob([`%PDF-synthetic:${options?.cancellationState || 'NONE'}`], { type: 'application/pdf' });
  };
  try {
    const result = await build({ stdin: { resolveDir: base, loader: 'ts', contents: `
      export {createNfseIssuedArtifactService,createNfseIssuedXmlService} from './modules/gestor/emissor-nfse/visualizador/services/nfse-issued-xml.service-core';
      export {prepareIssuedDanfsePdf} from './modules/gestor/emissor-nfse/visualizador/services/nfse-issued-pdf.service';
      export {createNfseDownloadFile,createNfseZip} from './modules/gestor/emissor-nfse/emitidas/nfse-download.service';` },
      bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external', outfile: bundle,
      plugins: [{ name: 'isolated-pdf-boundaries', setup(builder) {
        builder.onResolve({ filter: /nfse-issued-xml\.service$/ }, () => ({ path: 'reader', namespace: 'fixture' }));
        builder.onResolve({ filter: /danfse\.pdf$/ }, () => ({ path: 'pdf', namespace: 'fixture' }));
        builder.onResolve({ filter: /danfse\.assets$/ }, () => ({ path: 'assets', namespace: 'fixture' }));
        builder.onResolve({ filter: /danfse-projection\.service$/ }, () => ({ path: 'projection', namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents: {
          reader: 'export const readNfseIssuedArtifact=(...args)=>globalThis.__cancelRead(...args);',
          pdf: 'export const createDanfsePdf=(...args)=>globalThis.__cancelPdf(...args);',
          assets: 'export const loadDanfseAssets=async()=>({});',
          projection: 'export const getDanfseProjection=()=>{throw new Error("Unexpected projection/network")};',
        }[args.path] }));
      } }] });
    await writeFile(bundle, result.outputFiles[0].contents);
    const api = await import(pathToFileURL(bundle));
    const parse = () => ({ accessKey: selected.accessKey, number: selected.number, environment: '1', fields: {} });
    const transport = async (name, args) => {
      assert.equal(name, 'get_nfse_authorized_xml_secure'); reads.push(args);
      return { version: 1, scope, data: { documentId: selected.id, status: 'EMITIDA', number: selected.number,
        accessKey: selected.accessKey, xml, sha256: createHash('sha256').update(xml).digest('hex') } };
    };
    globalThis.__cancelRead = api.createNfseIssuedArtifactService(transport, true, parse);
    const readXml = api.createNfseIssuedXmlService(transport, true, parse);
    const signal = new AbortController().signal;
    const preview = await api.prepareIssuedDanfsePdf(scope, await readXml(scope, cancelled), signal);
    assert.equal(rendered.at(-1).options.cancellationState, 'CONFIRMED');
    const pdf = await api.createNfseDownloadFile(scope, selected, 'pdf', signal, () => cancelled);
    assert.equal(await pdf.blob.text(), await preview.text());
    assert.equal(rendered.at(-1).options.cancellationState, 'CONFIRMED');
    const zipFile = await api.createNfseZip(scope, [selected], 'pdf', signal, () => {}, () => cancelled);
    const zip = await JSZip.loadAsync(await zipFile.blob.arrayBuffer());
    assert.equal(await Object.values(zip.files)[0].async('string'), await preview.text());
    assert.equal(rendered.at(-1).options.cancellationState, 'CONFIRMED');
    const pending = await api.createNfseDownloadFile(scope, { ...selected, state: 'CANCELLATION_PENDING' }, 'pdf', signal);
    assert.equal(await pending.blob.text(), '%PDF-synthetic:NONE');
    const original = await api.createNfseDownloadFile(scope, cancelled, 'xml', signal);
    assert.equal(await original.blob.text(), xml);
    await assert.rejects(api.createNfseDownloadFile({ ...scope, month: '2026-10' }, cancelled, 'pdf', signal));
    assert(reads.every(args => args.p_document_id === selected.id));
    // A refresh arriving during the XML read must also affect the PDF composition.
    let current = selected;
    globalThis.__cancelRead = async (...args) => {
      const result = await api.createNfseIssuedArtifactService(transport, true, parse)(...args);
      current = cancelled; return result;
    };
    await api.createNfseDownloadFile(scope, selected, 'pdf', signal, () => current);
    assert.equal(rendered.at(-1).options.cancellationState, 'CONFIRMED');
  } finally {
    delete globalThis.__cancelRead; delete globalThis.__cancelPdf;
    await rm(temp, { recursive: true, force: true });
  }
});
