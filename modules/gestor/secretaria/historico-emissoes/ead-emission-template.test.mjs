import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const directory = fileURLToPath(new URL('.', import.meta.url));
const requireTool = createRequire(process.env.EAD_UI_NODE_MODULES
  ? pathToFileURL(resolve(process.env.EAD_UI_NODE_MODULES, '../ead-service-runner.mjs')) : import.meta.url);
const { build } = requireTool('esbuild');
const unusedService = name => `export const ${name}=new Proxy({}, {get(){return async()=>{throw new Error('Unexpected unrelated document IO')}}});`;
const ioModules = {
  'carteirinha.service': unusedService('carteirinhaService'),
  'cracha.service': unusedService('crachaService'),
  'declaracao.service': unusedService('declaracaoService'),
  'declaracao-frequencia.service': unusedService('declaracaoFrequenciaService'),
  'irpf.service': unusedService('irpfService'),
  'boletim.service': unusedService('boletimService'),
  'historico.service': unusedService('historicoService'),
  'transferencia.service': unusedService('transferenciaService'),
  'document-layouts': `${unusedService('pastaIdentificacaoService')} export const fichaMatriculaDefaultTemplate=null;`,
  'fichas-matricula.service': unusedService('fichasMatriculaService'),
  'academicos.service': 'export const academicosService={getConfigs:async()=>({})};',
  'marca-dagua.service': 'export const marcaDaguaService={getCompaniesWithWatermark:async()=>[]};',
  'polos.service': 'export const polosService={getById:async()=>({})};',
  'academic-preview': "export const loadAcademicPreview=async()=>{throw new Error('Unexpected academic RPC')};",
};
const result = await build({
  entryPoints: [resolve(directory, 'historico-emissoes.service.ts')], bundle: true,
  write: false, format: 'esm', platform: 'node',
  nodePaths: process.env.EAD_UI_NODE_MODULES ? [process.env.EAD_UI_NODE_MODULES] : [],
  plugins: [{
    name: 'emission-template-io', setup(plugin) {
      plugin.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'database', namespace: 'fixture' }));
      plugin.onResolve({ filter: /.*/ }, args => {
        const name = args.path.split('/').at(-1);
        return name in ioModules ? { path: name, namespace: 'fixture' } : undefined;
      });
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
        contents: args.path === 'database' ? `export const supabase={from(table){
          const filters={};return {select(){return this},eq(key,value){filters[key]=value;return this},
            order(){return this},limit(){return this},async maybeSingle(){
              const state=globalThis.__eadEmissionIo;state.calls.push({table,filters});
              if(table==='documentos_templates')return {data:{conteudo:state.models},error:state.modelError};
              if(table==='certificados_academicos')return {data:state.certificates.find(row=>
                Object.entries(filters).every(([key,value])=>row[key]===value))||null,error:state.certificateError};
              throw new Error('Unexpected table: '+table);
            }};
        }};` : ioModules[args.path], loader: 'js',
      }));
    },
  }],
});
const { historicoEmissoesService } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const course = model => ({ nome: 'Curso sintético', ead_config: { certificacao: { modeloDocumento: model } } });
const certificate = (id, model, modalidade = 'EAD') => ({
  id, modalidade, status: 'FINALIZADO', codigo_validacao: `CODE-${id}`,
  matricula_id: `ENROLLMENT-${id}`, curso_id: `COURSE-${id}`, curso: course(model),
});
const emission = row => ({ documento: row.modalidade === 'EAD' ? 'certificado_ead' : 'certificado_tecnico',
  codigo: row.codigo_validacao, matricula_id: row.matricula_id, polo_id: 'POLO-SYNTHETIC',
  dados_emissao: { certificateId: row.id, watermarkSnapshot: {}, institutionSnapshot: {} },
});
const start = (certificates, models) => {
  globalThis.__eadEmissionIo = { certificates, models, calls: [], modelError: null, certificateError: null };
  return globalThis.__eadEmissionIo;
};

test('segunda via usa ID do curso para dois EAD no mesmo polo e mantém o modelo bruto', async () => {
  const first = certificate('first', 'custom-a');
  const second = certificate('second', 'custom-b');
  const models = [
    { id: 'generic', tipoCurso: 'Educação a Distância (EAD)' },
    { id: 'custom-a', tipoCurso: 'Personalizado', textoFrente: 'Texto autoral A', blocks: [{ id: 'a' }] },
    { id: 'custom-b', tipoCurso: 'Personalizado', textoFrente: 'Texto autoral B', blocks: [{ id: 'b' }] },
  ];
  const io = start([first, second], models);
  const previews = await historicoEmissoesService.loadPreviews([emission(first), emission(second)], 'POLO-SYNTHETIC');
  assert.equal(previews[0].template, models[1]);
  assert.equal(previews[1].template, models[2]);
  assert.equal(io.calls.filter(call => call.table === 'documentos_templates').length, 2);
});

test('reabrir EAD consulta configuração do curso e modelo atualizados, sem cache anterior', async () => {
  const row = certificate('fresh', 'model-before');
  const io = start([row], [{ id: 'model-before', textoFrente: 'Antes' }]);
  const first = await historicoEmissoesService.loadPreview(emission(row), 'POLO-SYNTHETIC');
  assert.equal(first.template.textoFrente, 'Antes');
  row.curso = course('model-after');
  io.models = [{ id: 'model-after', textoFrente: 'Depois', blocks: [{ id: 'saved' }] }];
  const second = await historicoEmissoesService.loadPreview(emission(row), 'POLO-SYNTHETIC');
  assert.equal(second.template, io.models[0]);
  assert.equal(io.calls.filter(call => call.table === 'certificados_academicos').length, 2);
  assert.equal(io.calls.filter(call => call.table === 'documentos_templates').length, 2);
});

test('ID configurado inexistente e erro de consulta não usam modelo genérico nem cache válido', async () => {
  const row = certificate('missing', 'missing-model');
  const io = start([row], [{ id: 'generic', tipoCurso: 'Educação a Distância (EAD)' }]);
  await assert.rejects(historicoEmissoesService.loadPreview(emission(row), 'POLO-SYNTHETIC'), /modelo de certificado configurado/);
  row.curso = course('generic');
  await historicoEmissoesService.loadPreview(emission(row), 'POLO-SYNTHETIC');
  io.modelError = new Error('Erro real de leitura simulado');
  await assert.rejects(historicoEmissoesService.loadPreview(emission(row), 'POLO-SYNTHETIC'), error => error === io.modelError);
  io.modelError = null;
  io.models = null;
  await assert.rejects(historicoEmissoesService.loadPreview(emission(row), 'POLO-SYNTHETIC'), /modelos de certificado salvos/);
});

test('EAD sem ID configurado usa apenas modelo EAD persistido; técnico mantém seleção por tipo', async () => {
  const legacy = certificate('legacy', '');
  const technical = certificate('technical', 'ignored-id', 'TECNICO');
  const models = [
    { id: 'technical-saved', tipoCurso: 'Cursos Técnicos' },
    { id: 'ead-saved', tipoCurso: 'Educação a Distância (EAD)' },
  ];
  start([legacy, technical], models);
  assert.equal((await historicoEmissoesService.loadPreview(emission(legacy), 'POLO-SYNTHETIC')).template, models[1]);
  assert.equal((await historicoEmissoesService.loadPreviewFresh(emission(technical), 'POLO-SYNTHETIC')).template, models[0]);
});
