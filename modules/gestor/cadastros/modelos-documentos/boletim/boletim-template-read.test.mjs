import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { build } from 'esbuild';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('./boletim.service.ts', import.meta.url));
const shared = fileURLToPath(new URL('../shared/document-template.service.ts', import.meta.url));
const result = await build({
  stdin: { contents: `export {boletimService} from ${JSON.stringify(entry)};
    export {createDocumentTemplateService} from ${JSON.stringify(shared)};`, resolveDir: '/', loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'template-query', setup(plugin) {
    plugin.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'db', namespace: 'fixture' }));
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: `
      export const supabase={from(table){
        if(table!=='documentos_templates')throw new Error('Unexpected table');
        return{select(){return this},eq(field,id){this.id=id;return this},async maybeSingle(){
          const io=globalThis.__boletimTemplateReadIo;io.queries.push(this.id);
          return io.results[this.id]??{data:null,error:null};
        }};
      }};` }));
  } }],
});
const { boletimService, createDocumentTemplateService } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
);
const start = (results = {}) => {
  globalThis.__boletimTemplateReadIo = { results, queries: [] };
  return globalThis.__boletimTemplateReadIo;
};

test('boletim bloqueia erro no modelo principal sem substituir por modelo legado ou genérico', async () => {
  const error = new Error('Falha sintética na consulta principal');
  const io = start({ boletim_tecnico: { data: null, error } });
  await assert.rejects(boletimService.getTemplate('TECNICO'), (actual) => actual === error);
  assert.deepEqual(io.queries, ['boletim_tecnico']);
});

test('ausência principal permite modelo legado persistido, mas erro legado bloqueia emissão', async () => {
  const frozen = { v: 3, textContent: 'Modelo sintético legado', absoluteFields: [] };
  const io = start({ boletim_tecnico_TECNICO: { data: { conteudo: frozen }, error: null } });
  assert.equal(await boletimService.getTemplate('TECNICO'), frozen);
  assert.deepEqual(io.queries, ['boletim_tecnico', 'boletim_tecnico_TECNICO']);
  const error = new Error('Falha sintética na consulta legada');
  start({ boletim_tecnico_TECNICO: { data: null, error } });
  await assert.rejects(boletimService.getTemplate('TECNICO'), (actual) => actual === error);
});

test('boletim usa o fallback do editor somente após ausência confirmada dos dois modelos', async () => {
  const io = start();
  const fallback = await boletimService.getTemplate('TECNICO');
  assert.deepEqual(io.queries, ['boletim_tecnico', 'boletim_tecnico_TECNICO']);
  assert.equal(fallback.v, 3);
  assert.match(fallback.textContent, /TABELA_BOLETIM_TECNICO/);
  assert.equal(fallback.absoluteFields.find((field) => field.id === 'boletim_assinatura').y, 930);
});

test('outros documentos preservam fallback anterior quando não habilitam leitura estrita', async () => {
  const fallback = { textContent: 'Fallback sintético', absoluteFields: [] };
  const service = createDocumentTemplateService('synthetic', fallback);
  const io = start({ synthetic_POLO: { data: null, error: { message: 'Falha sintética' } } });
  assert.deepEqual(await service.getTemplate('POLO'), fallback);
  assert.deepEqual(io.queries, ['synthetic_POLO']);
});
