import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let loadAlunoBulletinPdf;
let directory;
const validSource = () => ({
  emission: { id:'emission',codigo:'TEST-BOL',documento:'boletim',status:'ATIVO',
    matricula_id:'enrollment',aluno_id:'student',periodo_referencia:'module',
    dados_emissao:{studentMatricula:'ACA-2026001',studentDocumentType:'CIN',studentCpf:'12345678909',studentRg:null} },
  preview:{ template:{textContent:'{{ALUNO_NOME}} {{ALUNO_MATRICULA}}',absoluteFields:[
    {id:'configured-image',type:'image',x:12,y:24,value:'data:image/png;base64,SYNTHETIC'}],pageCount:2,v:4},
  polo:{nome:'Instituição sintética'},watermark:{watermarkUrl:'SYNTHETIC',watermarkOpacity:0,watermarkScale:100,watermarkRotate:false},
  certificate:null,academicData:{studentMatricula:'ACA-2026001',studentCpf:null,studentRg:null,studentDocumentType:null,
    cargaHorariaCumprida:17,cargaHorariaTotal:43,mediaGeral:7.23,frequenciaGeral:81.49,
    componentes:[{moduleId:'module',moduleName:'Módulo sintético',moduleOrder:1,disciplineOrder:1,
      discipline:'Disciplina sintética',cargaHoraria:40,nota:9,frequencia:99,situacao:'Aprovado'}]} },
});

const state = (source = validSource()) => {
  const harness = {calls:[],pdfCalls:[],reply:{data:source,error:null},
    result:{blob:new Blob(['%PDF-SYNTHETIC'],{type:'application/pdf'}),fileName:'boletim-test.pdf'}};
  globalThis.__studentBulletinHarness = harness;
  return harness;
};

before(async () => {
  const html = await readFile(new URL('../../../lib/htmlSanitizer.ts',import.meta.url),'utf8');
  const escape = html.slice(html.indexOf('export const escapeHtmlText'),html.indexOf('export const sanitizedHtml'));
  const bundle = await build({entryPoints:[fileURLToPath(new URL('./aluno-bulletin.service.ts',import.meta.url))],
    bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'controlled-external-io',setup(plugin){
      plugin.onResolve({filter:/lib\/supabase$/},()=>({path:'rpc',namespace:'controlled'}));
      plugin.onLoad({filter:/^rpc$/,namespace:'controlled'},()=>({contents:`export const supabase={rpc(name,args){
        const h=globalThis.__studentBulletinHarness;h.calls.push({name,args});
        const request=Promise.resolve(h.reply);request.abortSignal=signal=>{h.signal=signal;return request};return request;
      },from(){throw Error('Unexpected direct table access')}};`}));
      plugin.onResolve({filter:/historico-emissoes\/emission-document\.pdf$/},()=>({path:'pdf',namespace:'controlled'}));
      plugin.onLoad({filter:/^pdf$/,namespace:'controlled'},()=>({contents:`export async function createEmissionDocumentsPdf(sources){
        const h=globalThis.__studentBulletinHarness;h.pdfCalls.push(sources);return h.compose?h.compose():h.result;
      }`}));
      // Keep the real pure formatter; unrelated DOMPurify hooks need a browser.
      plugin.onResolve({filter:/lib\/htmlSanitizer$/},()=>({path:'escape',namespace:'controlled'}));
      plugin.onLoad({filter:/^escape$/,namespace:'controlled'},()=>({contents:escape,loader:'ts'}));
    }}]});
  directory=await mkdtemp(join(tmpdir(),'student-bulletin-service-'));
  const path=join(directory,'service.mjs');
  await writeFile(path,bundle.outputFiles[0].text);
  ({loadAlunoBulletinPdf}=await import(pathToFileURL(path).href));
});
after(async()=>{if(directory)await rm(directory,{recursive:true,force:true})});

test('requests only enrollment/module and returns the exact compositor Blob, complete model and backend summary',async()=>{
  const source=validSource();
  const h=state(source);
  const result=await loadAlunoBulletinPdf('enrollment','student','module');
  assert.deepEqual(h.calls,[{name:'obter_boletim_aluno_pdf',args:{p_matricula_id:'enrollment',p_modulo_id:'module'}}]);
  assert.equal(result.blob,h.result.blob);
  assert.equal(result.fileName,'boletim-test.pdf');
  assert.equal(result.code,'TEST-BOL');
  const preview=h.pdfCalls[0][0].preview;
  assert.equal(preview.template,source.preview.template);
  assert.equal(preview.watermark,source.preview.watermark);
  assert.equal(preview.academicData.mediaGeral,7.23);
  assert.equal(preview.academicData.frequenciaGeral,81.49);
  assert.equal(preview.academicData.cargaHorariaTotal,43);
  assert.equal(preview.academicData.cargaHorariaCumprida,17);
  assert.equal(preview.academicData.studentCpf,null);
  assert.equal(preview.academicData.studentDocumentType,null);
  assert.equal(preview.academicData.studentMatricula,'ACA-2026001');
});

test('canonical component order remains identical in components and both table presentations',async()=>{
  const source=validSource();
  const row=source.preview.academicData.componentes[0];
  source.preview.academicData.componentes=[{...row,discipline:'Zeta'},{...row,discipline:'Alfa'}];
  const h=state(source);
  await loadAlunoBulletinPdf('enrollment','student','module');
  const academic=h.pdfCalls[0][0].preview.academicData;
  assert.deepEqual(academic.componentes.map(item=>item.discipline),['Zeta','Alfa']);
  for(const table of [academic.componentesTable,academic.historicoTable]){
    assert.ok(table.indexOf('Zeta')<table.indexOf('Alfa'));
  }
});

test('another identity, enrollment, module, document or inactive emission cannot reach compositor',async()=>{
  for(const [key,value] of [['aluno_id','another'],['matricula_id','another'],['periodo_referencia','another'],
    ['documento','declaracao_matricula'],['status','REVOGADO']]){
    const source=validSource();source.emission[key]=value;
    const h=state(source);
    await assert.rejects(loadAlunoBulletinPdf('enrollment','student','module'),/não foi localizado/);
    assert.equal(h.pdfCalls.length,0);
  }
});

test('empty or cross-module components fail instead of filtering an unauthorized response',async()=>{
  for(const rows of [[],[{moduleId:'another'}],[null]]){
    const source=validSource();source.preview.academicData.componentes=rows;
    const h=state(source);
    await assert.rejects(loadAlunoBulletinPdf('enrollment','student','module'),/não pertencem/);
    assert.equal(h.pdfCalls.length,0);
  }
});

test('malformed configured model never falls back',async()=>{
  for(const template of [null,{textContent:12},{textContent:''},{textContent:'Body',absoluteFields:{}}]){
    const source=validSource();source.preview.template=template;
    const h=state(source);
    await assert.rejects(loadAlunoBulletinPdf('enrollment','student','module'),/não está disponível/);
    assert.equal(h.pdfCalls.length,0);
  }
});

test('malformed institutional header fails before compositor',async()=>{
  for(const polo of [null,{},[]]){
    const source=validSource();source.preview.polo=polo;
    const h=state(source);
    await assert.rejects(loadAlunoBulletinPdf('enrollment','student','module'),/não está disponível/);
    assert.equal(h.pdfCalls.length,0);
  }
});

test('RPC denial stops delivery and exposes its canonical error',async()=>{
  const h=state();h.reply={data:null,error:{message:'Módulo não iniciado.'}};
  await assert.rejects(loadAlunoBulletinPdf('enrollment','student','module'),/Módulo não iniciado/);
  assert.equal(h.pdfCalls.length,0);
});

test('cancellation before request and during delayed reply discards stale sources',async()=>{
  const controller=new AbortController();controller.abort();
  let h=state();
  await assert.rejects(loadAlunoBulletinPdf('enrollment','student','module',controller.signal),/cancelada/);
  assert.equal(h.calls.length,0);
  const delayed=new AbortController();h=state();
  let deliver;h.reply=new Promise(resolve=>{deliver=resolve});
  const request=loadAlunoBulletinPdf('enrollment','student','module',delayed.signal);
  delayed.abort();deliver({data:validSource(),error:null});
  await assert.rejects(request,/cancelada/);
  assert.equal(h.signal,delayed.signal);
  assert.equal(h.pdfCalls.length,0);
});

test('cancellation during composition and invalid PDF results cannot be delivered',async()=>{
  const controller=new AbortController();let h=state();
  h.compose=async()=>{controller.abort();return h.result};
  await assert.rejects(loadAlunoBulletinPdf('enrollment','student','module',controller.signal),/cancelada/);
  for(const blob of [new Blob([],{type:'application/pdf'}),new Blob(['invalid'],{type:'text/plain'})]){
    h=state();h.result.blob=blob;
    await assert.rejects(loadAlunoBulletinPdf('enrollment','student','module'),/vazio|formato PDF/);
  }
});
