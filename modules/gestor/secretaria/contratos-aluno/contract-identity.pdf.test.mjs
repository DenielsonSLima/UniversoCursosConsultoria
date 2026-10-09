import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import { createContractIdentityFixtures } from '../../../../supabase/tests/fixtures/contract-identity-harness.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));
const requireTool = createRequire(process.env.CONTRACT_UI_NODE_MODULES
  ? pathToFileURL(resolve(process.env.CONTRACT_UI_NODE_MODULES, '../contract-identity-runner.mjs'))
  : import.meta.url);
const { build } = requireTool('esbuild');
const { getDocument } = await import(pathToFileURL(requireTool.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
const temporary = await mkdtemp(join(dirname(requireTool.resolve('jspdf/package.json')), '.contract-test-'));
after(() => rm(temporary, { recursive: true, force: true }));

await build({
  stdin: {
    contents: `
      export { contratosAlunoService } from './services/contratos-aluno.service';
      export { createContratosAlunoPdf } from './contratos-aluno.pdf';
      export { createContractHistoryPdf } from '../historico-emissoes/contract-history-pdf';
      export { normalizeCanonicalPdfText } from '../shared/canonical-document-vector-pdf';
    `,
    resolveDir: directory,
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  jsx: 'automatic',
  outfile: join(temporary, 'product.mjs'),
  plugins: [{
    name: 'canonical-contract-rpc-boundary',
    setup(plugin) {
      plugin.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'rpc', namespace: 'test-io' }));
      plugin.onLoad({ filter: /.*/, namespace: 'test-io' }, () => ({
        contents: 'export const supabase={rpc:(name,args)=>globalThis.__contractIdentityRpc(name,args)};',
        loader: 'js',
      }));
    },
  }],
});
const { contratosAlunoService, createContratosAlunoPdf, createContractHistoryPdf, normalizeCanonicalPdfText } =
  await import(pathToFileURL(join(temporary, 'product.mjs')).href);

const expectedInput = {
  poloId: 'POLO-SYNTHETIC', mode: 'INDIVIDUAL', enrollmentIds: ['ENROLLMENT-SYNTHETIC'],
  customMessage: '', idempotencyKey: 'REQUEST-SYNTHETIC',
};
const normalizedText = value => normalizeCanonicalPdfText(value).replace(/\s+/g, ' ').trim();
const template = process.env.CONTRACT_IDENTITY_TEMPLATE
  ? JSON.parse(await readFile(process.env.CONTRACT_IDENTITY_TEMPLATE, 'utf8')) : undefined;
const contractFixtures = await createContractIdentityFixtures({ template });

const extract = async blob => {
  const pdf = await getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    standardFontDataUrl: `${dirname(requireTool.resolve('pdfjs-dist/package.json'))}/standard_fonts/`,
    useSystemFonts: true,
  }).promise;
  const pages = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    pages.push(normalizedText(content.items.map(item => item.str ?? '').join(' ')));
  }
  await pdf.destroy();
  return pages;
};

for (const source of contractFixtures) {
  test(`canonical ${source.name} identity survives preparation and historical native PDFs`, async () => {
    const before = globalThis.structuredClone(source);
    const code = source.rendered.qr.code;
    const canonical = {
      template: source.template, template_revision: 1,
      snapshot: source.snapshot, rendered: source.rendered,
    };
    globalThis.__contractIdentityRpc = async (name, args) => {
      assert.equal(name, 'preparar_emissao_contrato_aluno_secure');
      assert.deepEqual(args, {
        p_polo_id: expectedInput.poloId, p_modo: expectedInput.mode,
        p_matricula_ids: expectedInput.enrollmentIds, p_mensagem_personalizada: null,
        p_idempotency_key: expectedInput.idempotencyKey,
      });
      return {
        data: { documents: [{
          emission_id: code, document_id: 'DOCUMENT-SYNTHETIC', validation_code: code,
          title: source.template.tituloDocumento, render_payload: canonical,
        }] }, error: null,
      };
    };
    const prepared = await contratosAlunoService.prepararEmissao(expectedInput);
    const result = await createContratosAlunoPdf(prepared.documents);
    const history = await createContractHistoryPdf({
      id: 'DOCUMENT-SYNTHETIC', codigo: code, documento: 'contrato_aluno', status: 'ATIVO',
      validade_ate: null,
      dados_emissao: {
        templateSnapshot: source.template, templateRevision: 1,
        contractSnapshot: source.snapshot, renderedDocument: source.rendered,
      },
    });
    const [preparedPages, historicalPages] = await Promise.all([extract(result.blob), extract(history.blob)]);
    assert.equal(preparedPages.length, source.rendered.pages.length);
    assert.deepEqual(historicalPages, preparedPages);
    const text = preparedPages.join(' ');
    for (const identity of source.identity) {
      if (identity.startsWith('UF de emissão:') && !source.template.corpo.includes('{{aluno.rgUfEmissao}}')) continue;
      if (identity.startsWith('Data de emissão:') && !source.template.corpo.includes('{{aluno.rgDataEmissao}}')) continue;
      assert.ok(text.includes(normalizedText(identity)), identity);
    }
    const canonicalBody = source.rendered.pages.map(page => page.body).join('\n');
    for (const excluded of source.absent) assert.ok(!canonicalBody.includes(excluded), excluded);
    for (const page of source.rendered.pages) {
      assert.ok(text.includes(normalizedText(page.body)), `Canonical body changed: ${page.body}`);
    }
    assert.deepEqual(source, before);
    if (process.env.CONTRACT_PDF_ARTIFACTS) {
      await mkdir(process.env.CONTRACT_PDF_ARTIFACTS, { recursive: true });
      await writeFile(join(process.env.CONTRACT_PDF_ARTIFACTS, `contract-${source.name}.pdf`),
        new Uint8Array(await result.blob.arrayBuffer()));
    }
  });
}
