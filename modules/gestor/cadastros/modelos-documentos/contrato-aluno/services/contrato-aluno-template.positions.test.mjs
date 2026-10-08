import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const bundleDirectory = await mkdtemp(join(tmpdir(), 'contract-template-positions-'));
const bundlePath = join(bundleDirectory, 'service.mjs');
await build({
  entryPoints: [resolve('modules/gestor/cadastros/modelos-documentos/contrato-aluno/services/contrato-aluno-template.service.ts')],
  outfile: bundlePath,
  bundle: true,
  format: 'esm',
  platform: 'node',
  plugins: [{ name: 'mock-template-storage', setup(builder) {
    builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({
      contents: 'export const supabase={rpc:(...args)=>globalThis.__contractTemplatePositionsRpc(...args)};',
    }));
  } }],
});
const { contratoAlunoTemplateService: service } = await import(pathToFileURL(bundlePath).href);
after(async () => {
  delete globalThis.__contractTemplatePositionsRpc;
  await rm(bundleDirectory, { recursive: true, force: true });
});

const footer = 'Cidade de teste, 08/10/2026.\nCONTRATANTE:\nCONTRATADA:\nTESTEMUNHAS:\n1: ____\n2: ____';
const layout = () => ({ version: 1, elements: {
  qr: { x: 165.5, y: 248.25, width: 23.5 },
  contratante: { x: 20.5, y: 222.25, width: 55.5 },
  contratada: { x: 90.25, y: 222.25, width: 55.5 },
  testemunha1: { x: 20.5, y: 240.75, width: 55.5 },
  testemunha2: { x: 90.25, y: 240.75, width: 55.5 },
} });

const mockStore = (positions) => {
  const calls = [];
  let row = {
    templateKey: 'contrato_aluno', modality: 'TECNICO', revision: 7, status: 'ATIVO',
    content: {
      tituloDocumento: 'Contrato de teste', cabecalho: '', corpo: 'Texto contratual preservado.',
      rodape: footer, fonte: 'MINUTA_TECNICA',
      presentationVersion: 'CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA',
      qr: { habilitado: true, rotulo: 'Conferir documento', caminhoValidacao: '/validar-documento', modoValidade: 'SEM_VENCIMENTO', diasValidade: null },
      marcaDagua: { habilitada: true, intensidade: 'SUAVE', origem: 'POLO_EMISSOR' },
      ...(positions === undefined ? {} : { layoutEncerramento: structuredClone(positions) }),
    },
  };
  globalThis.__contractTemplatePositionsRpc = async (name, args) => {
    calls.push({ name, args: structuredClone(args) });
    if (name === 'get_modelo_documento_template_secure') return { data: structuredClone(row), error: null };
    assert.equal(name, 'save_modelo_documento_template_secure');
    assert.equal(args.p_expected_revision, row.revision);
    const content = structuredClone(args.p_content);
    delete content.status;
    row = { ...row, revision: row.revision + 1, status: 'EM_REVISAO', content };
    return { data: [structuredClone(row)], error: null };
  };
  return calls;
};

const save = (template, content = template.conteudo) => service.saveTemplate({
  templateKey: template.templateKey,
  modalidade: template.modalidade,
  revisaoEsperada: template.revisao,
  conteudo: content,
  requestId: '00000000-0000-4000-8000-000000000001',
});

test('get, edit, save and reload preserve every closing coordinate exactly', async () => {
  const initial = layout();
  const calls = mockStore(initial);
  const read = await service.getTemplate('TECNICO');
  assert.deepEqual(read.conteudo.layoutEncerramento, initial);
  const edited = structuredClone(read.conteudo);
  edited.layoutEncerramento.elements.qr = { x: 166.25, y: 248.75, width: 22.5 };
  edited.layoutEncerramento.elements.contratante = { x: 19.25, y: 222.5, width: 56.75 };
  edited.layoutEncerramento.elements.contratada = { x: 91.5, y: 222.5, width: 56.75 };
  edited.layoutEncerramento.elements.testemunha1 = { x: 19.25, y: 241.25, width: 56.75 };
  edited.layoutEncerramento.elements.testemunha2 = { x: 91.5, y: 241.25, width: 56.75 };
  const beforeSave = structuredClone(edited);
  const saved = await save(read, edited);
  const reopened = await service.getTemplate('TECNICO');
  assert.deepEqual(calls.map((call) => call.name), [
    'get_modelo_documento_template_secure', 'save_modelo_documento_template_secure', 'get_modelo_documento_template_secure',
  ]);
  assert.deepEqual(calls[1].args.p_content.layoutEncerramento, beforeSave.layoutEncerramento);
  assert.deepEqual(saved.conteudo.layoutEncerramento, beforeSave.layoutEncerramento);
  assert.deepEqual(reopened.conteudo.layoutEncerramento, beforeSave.layoutEncerramento);
  assert.deepEqual(edited, beforeSave);
  assert.equal(reopened.conteudo.corpo, read.conteudo.corpo);
  assert.equal(reopened.conteudo.rodape, read.conteudo.rodape);
  assert.deepEqual(reopened.conteudo.qr, read.conteudo.qr);
  assert.deepEqual(reopened.conteudo.marcaDagua, read.conteudo.marcaDagua);
  assert.equal(reopened.revisao, 8);
});

test('invalid and overlapping positions are rejected before the save RPC', async () => {
  const calls = mockStore(layout());
  const read = await service.getTemplate('TECNICO');
  for (const invalid of [
    { version: 2, elements: {} },
    { version: 1, elements: { qr: { x: '172', y: 211, width: 20 } } },
    { version: 1, elements: { qr: { x: 180, y: 248, width: 23 } } },
    { version: 1, elements: { contratante: { x: 88, y: 221, width: 62 } } },
  ]) {
    await assert.rejects(save(read, { ...read.conteudo, layoutEncerramento: invalid }));
  }
  assert.deepEqual(calls.map((call) => call.name), ['get_modelo_documento_template_secure']);
});

test('legacy model without positions can still be loaded, saved and reloaded', async () => {
  const calls = mockStore();
  const read = await service.getTemplate('TECNICO');
  assert.equal(Object.hasOwn(read.conteudo, 'layoutEncerramento'), false);
  const saved = await save(read);
  const reopened = await service.getTemplate('TECNICO');
  assert.equal(Object.hasOwn(calls[1].args.p_content, 'layoutEncerramento'), false);
  assert.equal(Object.hasOwn(saved.conteudo, 'layoutEncerramento'), false);
  assert.equal(Object.hasOwn(reopened.conteudo, 'layoutEncerramento'), false);
  assert.equal(reopened.conteudo.rodape, footer);
});

test('invalid stored positions fail explicitly instead of being replaced by defaults', async () => {
  mockStore({ version: 9, elements: {} });
  await assert.rejects(service.getTemplate('TECNICO'), /configuração de posições/);
});
