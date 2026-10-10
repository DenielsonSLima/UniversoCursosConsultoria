import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const stubService = (name) => `export const ${name}=new Proxy({}, {get(){return async()=>{throw new Error('Unexpected unrelated IO')}}});`;
const modules = {
  'diploma.service': stubService('diplomaService'),
  'carteirinha.service': stubService('carteirinhaService'),
  'cracha.service': stubService('crachaService'),
  'declaracao.service': stubService('declaracaoService'),
  'declaracao-frequencia.service': stubService('declaracaoFrequenciaService'),
  'irpf.service': stubService('irpfService'),
  'historico.service': stubService('historicoService'),
  'transferencia.service': stubService('transferenciaService'),
  'document-layouts': `${stubService('pastaIdentificacaoService')} export const fichaMatriculaDefaultTemplate=null;`,
  'fichas-matricula.service': stubService('fichasMatriculaService'),
  'academicos.service': 'export const academicosService={getConfigs:async()=>({})};',
  'marca-dagua.service': 'export const marcaDaguaService={getCompaniesWithWatermark:async()=>[]};',
  'polos.service': 'export const polosService={getById:async()=>({})};',
  'boletim.service': `export const boletimService={getTemplate:async(scope)=>{
    const io=globalThis.__boletimHistoryIo;io.templateCalls.push(scope);
    if(io.templateError)throw io.templateError;return io.template;
  }};`,
  'academic-preview': `export const loadAcademicPreview=async()=>{
    const io=globalThis.__boletimHistoryIo;io.academicCalls++;return io.academic;
  };`,
};
const result = await build({
  entryPoints: [fileURLToPath(new URL('./historico-emissoes.service.ts', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'boletim-io', setup(plugin) {
    plugin.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'database', namespace: 'fixture' }));
    plugin.onResolve({ filter: /.*/ }, ({ path }) => {
      const name = path.split('/').at(-1);
      return name in modules ? { path: name, namespace: 'fixture' } : undefined;
    });
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
      contents: path === 'database' ? `export const supabase={
        from(){throw new Error('Unexpected DB query')},rpc(){throw new Error('Unexpected DB mutation')}
      };` : modules[path], loader: 'js',
    }));
  } }],
});
const { historicoEmissoesService } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const emission = (snapshot = undefined) => ({
  documento: 'boletim', codigo: 'BOL-SYNTHETIC', polo_id: 'POLO-SYNTHETIC',
  dados_emissao: { institutionSnapshot: {}, watermarkSnapshot: {},
    ...(snapshot === undefined ? {} : { documentTemplateSnapshot: snapshot }) },
});
const start = () => {
  globalThis.__boletimHistoryIo = { template: { v: 3, absoluteFields: [] }, templateCalls: [],
    templateError: null, academic: { mediaGeral: 8.25 }, academicCalls: 0 };
  return globalThis.__boletimHistoryIo;
};

test('reabrir boletim legado relê modelo e dados acadêmicos sem esperar TTL nem registrar emissão', async () => {
  const io = start();
  const row = emission();
  const before = JSON.stringify(row);
  const first = await historicoEmissoesService.loadPreview(row, row.polo_id);
  io.template = { v: 4, absoluteFields: [{ id: 'signature', type: 'image' }] };
  io.academic = { mediaGeral: 9.25 };
  const current = await historicoEmissoesService.loadPreview(row, row.polo_id);
  assert.notEqual(current.template, first.template);
  assert.equal(current.template, io.template);
  assert.equal(current.academicData, io.academic);
  assert.deepEqual(io.templateCalls, ['TECNICO', 'TECNICO']);
  assert.equal(io.academicCalls, 2);
  assert.equal(JSON.stringify(row), before);
});

test('snapshot nulo relê modelo atual e snapshot existente preserva campos originais na reemissão', async () => {
  const io = start();
  const legacy = emission(null);
  assert.equal((await historicoEmissoesService.loadPreviewFresh(legacy, legacy.polo_id)).template, io.template);
  const frozen = { v: 2, textContent: 'Original sintético', absoluteFields: [{ id: 'original', type: 'text' }] };
  const row = emission(frozen);
  const before = JSON.stringify(row);
  assert.equal((await historicoEmissoesService.loadPreview(row, row.polo_id)).template, frozen);
  io.template = { v: 4, absoluteFields: [{ id: 'signature', type: 'image' }] };
  assert.equal((await historicoEmissoesService.loadPreviewFresh(row, row.polo_id)).template, frozen);
  assert.equal(io.templateCalls.length, 1, 'O modelo congelado não pode consultar nem incorporar o modelo vivo');
  assert.equal(JSON.stringify(row), before);
});

test('snapshot malformado e erro de leitura atual bloqueiam o boletim sem reutilizar prévia antiga', async () => {
  const io = start();
  for (const snapshot of ['invalid', [], false]) {
    const row = emission(snapshot);
    await assert.rejects(historicoEmissoesService.loadPreviewFresh(row, row.polo_id), /modelo congelado do boletim/i);
  }
  const row = emission();
  await historicoEmissoesService.loadPreview(row, row.polo_id);
  io.templateError = new Error('Falha sintética ao reler o modelo');
  await assert.rejects(historicoEmissoesService.loadPreview(row, row.polo_id), (error) => error === io.templateError);
});
