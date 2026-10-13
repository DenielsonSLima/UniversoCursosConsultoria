import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import { build } from 'esbuild';

const directory = fileURLToPath(new URL('.', import.meta.url));
const temporary = await mkdtemp(join(directory, '.contract-template-test-'));
after(() => rm(temporary, { recursive: true, force: true }));
await build({
  entryPoints: [join(directory, 'contrato-aluno-template.service.ts')],
  outfile: join(temporary, 'service.mjs'),
  bundle: true, format: 'esm', platform: 'node', packages: 'external',
  plugins: [{ name: 'canonical-template-rpc-boundary', setup(plugin) {
    plugin.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'rpc', namespace: 'test-io' }));
    plugin.onLoad({ filter: /.*/, namespace: 'test-io' }, () => ({
      contents: 'export const supabase={rpc:(name,args)=>globalThis.__contractTemplateRpc(name,args)};', loader: 'js',
    }));
  } }],
});
const { contratoAlunoTemplateService } = await import(pathToFileURL(join(temporary, 'service.mjs')).href);

test('leitura e salvamento preservam V4, conteúdo e coordenadas sem rebaixar a apresentação', async () => {
  const v4 = 'CONTRATO_A4_INSTITUCIONAL_V4_LEGIVEL';
  const source = {
    status: 'EM_REVISAO', presentationVersion: v4,
    cabecalho: 'Secretaria acadêmica', tituloDocumento: 'Contrato individual',
    corpo: 'Conteúdo personalizado preservado.', rodape: 'Cidade, 13/10/2026.',
    layoutEncerramento: { version: 1, elements: { qr: { x: 171.2, y: 232.8, width: 20 } } },
    qr: { rotulo: 'Conferir contrato', modoValidade: 'SEM_VENCIMENTO' },
  };
  let saved;
  globalThis.__contractTemplateRpc = async (name, args) => {
    if (name === 'get_modelo_documento_template_secure') {
      return { data: { modalidade: 'TECNICO', revisao: 8, status: 'EM_REVISAO', conteudo: source } };
    }
    assert.equal(name, 'save_modelo_documento_template_secure');
    assert.equal(args.p_expected_revision, 8);
    saved = structuredClone(args.p_content);
    return { data: { modalidade: 'TECNICO', revisao: 9, status: 'EM_REVISAO', conteudo: saved } };
  };
  const loaded = await contratoAlunoTemplateService.getTemplate('TECNICO');
  const result = await contratoAlunoTemplateService.saveTemplate({
    templateKey: loaded.templateKey, modalidade: 'TECNICO', revisaoEsperada: loaded.revisao,
    conteudo: loaded.conteudo, requestId: 'REQUEST-SYNTHETIC',
  });
  assert.equal(saved.presentationVersion, v4);
  assert.deepEqual(result.conteudo, loaded.conteudo);
  assert.equal(saved.corpo, source.corpo);
  assert.equal(saved.cabecalho, source.cabecalho);
  assert.deepEqual(saved.layoutEncerramento.elements.qr, source.layoutEncerramento.elements.qr);
});

test('defaults V2 e modelos V3 continuam compatíveis', async () => {
  for (const version of [undefined, 'CONTRATO_A4_INSTITUCIONAL_V2', 'CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA']) {
    globalThis.__contractTemplateRpc = async () => ({ data: { conteudo: { presentationVersion: version } } });
    const result = await contratoAlunoTemplateService.getTemplate('TECNICO');
    assert.equal(result.conteudo.presentationVersion, version || 'CONTRATO_A4_INSTITUCIONAL_V2');
  }
});
