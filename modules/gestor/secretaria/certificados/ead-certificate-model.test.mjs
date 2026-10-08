import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const directory = fileURLToPath(new URL('.', import.meta.url));
const dependencies = process.env.EAD_UI_NODE_MODULES;
const requireTool = createRequire(dependencies
  ? pathToFileURL(resolve(dependencies, '../ead-ui-runner.mjs')) : import.meta.url);
const { build } = requireTool('esbuild');
const load = async (path, plugins = []) => {
  const result = await build({entryPoints:[resolve(directory,path)],bundle:true,write:false,format:'esm',platform:'node',plugins});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const { selectEadCertificateModel } = await load('ead-certificate-model.ts');

test('EAD uses the exact configured model; a missing configured ID never falls back by type', () => {
  const models = [{id:'fallback',tipoCurso:'Educação a Distância (EAD)'}, {id:'configured',tipoCurso:'Outro'}];
  const course = id => ({ead_config:{certificacao:{modeloDocumento:id}}});
  assert.equal(selectEadCertificateModel(models, course('configured')), models[1]);
  assert.equal(selectEadCertificateModel(models, course('missing')), undefined);
  assert.equal(selectEadCertificateModel(models, course('')), models[0]);
  assert.equal(selectEadCertificateModel([{id:'legacy',modalidade:'EAD'}])?.id, 'legacy');
  assert.equal(selectEadCertificateModel([], course('')), undefined);
  assert.equal(selectEadCertificateModel([{id:'technical',tipoCurso:'Cursos Técnicos'}], course('')), undefined);
});

const { diplomaService } = await load('../../cadastros/modelos-documentos/diploma/diploma.service.ts', [{
  name:'persisted-templates-io', setup(plugin) {
    plugin.onResolve({filter:/lib\/supabase$/}, () => ({path:'database',namespace:'fixture'}));
    plugin.onLoad({filter:/.*/,namespace:'fixture'}, () => ({contents:`export const supabase={from(table){
      if(table!=='documentos_templates') throw new Error('Tabela inesperada');
      return {select(){return this},eq(){return this},async maybeSingle(){return globalThis.__persistedTemplatesResponse}};
    }};`,loader:'js'}));
  },
}]);

test('strict EAD template read preserves saved text, ID, blocks and asset settings exactly', async () => {
  const saved = [{id:'custom-ead',tipoCurso:'Educação a Distância (EAD)',textoFrente:'Texto autoral salvo',
    textoVerso:'Verso personalizado',landscapeWatermarkUrl:'asset://watermark',landscapeWatermarkOpacity:0.23,
    blocks:[{id:'custom',type:'image',page:'verso',x:17.4,y:22,width:91,url:'asset://saved'}]}];
  globalThis.__persistedTemplatesResponse = {data:{conteudo:saved},error:null};
  assert.equal(await diplomaService.getPersistedTemplates(), saved);
});

test('strict EAD template read propagates database failures and rejects absent payloads', async () => {
  const error = new Error('Falha de autorização sintética');
  globalThis.__persistedTemplatesResponse = {data:null,error};
  await assert.rejects(diplomaService.getPersistedTemplates(), value => value === error);
  for (const data of [null, {conteudo:null}, {conteudo:{}}]) {
    globalThis.__persistedTemplatesResponse = {data,error:null};
    await assert.rejects(diplomaService.getPersistedTemplates(), /modelos de certificado salvos/);
  }
  delete globalThis.__persistedTemplatesResponse;
});
