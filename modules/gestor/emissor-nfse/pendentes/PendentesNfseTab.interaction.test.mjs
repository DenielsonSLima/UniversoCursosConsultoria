import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const jsdomPath = process.env.NFSE_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');
const base = fileURLToPath(new URL('../../../', import.meta.url));
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const scope = {contextKey:id(1),poloId:id(2),environment:'HOMOLOGACAO',month:'2026-11'};
const row = n => ({id:id(n),batchId:id(90),studentId:id(n+100),studentName:`Aluno sintético ${n}`,
  classId:id(91),classLabel:'Turma sintética',amount:'10.00',modelLabel:'Modelo sintético',
  status:'PREPARADO',receiptCount:1,paymentMonth:'2026-11',createdAt:'2026-11-10',state:null,blockingReasons:['COMPETENCE_REQUIRED','SERVICE_DATE_REQUIRED']});

test('pending queue supports page selection, cancellation, repeated clicks, errors and last-page recovery', async()=>{
  await mkdir(resolve(base,'../tmp'),{recursive:true});
  const temp = await mkdtemp(resolve(base,'../tmp/nfse-ui-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost/'});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,
    MouseEvent:dom.window.MouseEvent,IS_REACT_ACT_ENVIRONMENT:true});
  const calls=[];
  let rows=Array.from({length:26},(_,n)=>row(n+10));
  let pending;
  globalThis.__nfseQueueService={
    list:async(_scope,page)=>({rows:rows.slice((page-1)*25,page*25),page,pageSize:25,
      totalItems:rows.length,totalAmount:`${rows.length*10}.00`,summary:{preparedCount:rows.length,
        preparedAmount:`${rows.length*10}.00`},providerEnabled:false}),
    remove:async(captured,input)=>{
      calls.push({scope:captured,input});
      await new Promise((resolve,reject)=>{pending={resolve,reject};});
      rows=rows.filter(row=>!input.documentIds.includes(row.id));
      return {id:id(200),documentIds:input.documentIds,removedCount:input.documentIds.length,
        paymentMonths:['2026-11'],message:'Recebimentos preservados.'};
    },
  };
  const bundle=resolve(temp,'test.mjs');
  const result=await build({stdin:{contents:`export { default as Page } from './gestor/emissor-nfse/pendentes/PendentesNfseTab';
    export { NfseTabContext } from './gestor/emissor-nfse/components/NfseTabContext';`,resolveDir:base,loader:'tsx'},
    bundle:true,write:false,format:'esm',platform:'node',packages:'external',jsx:'automatic',outfile:bundle,
    loader:{'.css':'empty'},plugins:[{name:'synthetic-service',setup(build){
      build.onResolve({filter:/nfse-queue\.service$/},()=>({path:'synthetic',namespace:'fixture'}));
      build.onResolve({filter:/Nfse(SourceEmissionModal|BatchEmissionModal|FiscalReviewModal)$/},args=>({path:args.path,namespace:'boundary'}));
      build.onLoad({filter:/.*/,namespace:'boundary'},args=>({contents:`import React from 'react';
        export default function Dialog(props) { return React.createElement('div',{role:'dialog','data-modal':${JSON.stringify(args.path)}},
          props.items ? props.items.length+' itens selecionados' : props.documentId || props.source.id,
          React.createElement('button',{onClick:props.onClose},'Fechar fluxo')); }`,loader:'js',resolveDir:base}));
      build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const nfseQueueService=globalThis.__nfseQueueService;',loader:'js'}));
    }}]});
  await writeFile(bundle,result.outputFiles[0].contents);
  const {Page,NfseTabContext}=await import(pathToFileURL(bundle).href);
  const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0},mutations:{retry:false,gcTime:0}}});
  const root=createRoot(document.getElementById('root'));
  const settle=async()=>act(async()=>{await new Promise(r=>setTimeout(r,30));});
  const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text) || b.getAttribute('aria-label')?.includes(text));
  const click=async(element)=>{assert(element,'control missing');await act(async()=>element.click());await settle();};
  const checkboxes=()=>[...document.querySelectorAll('input[type="checkbox"]')];
  try {
    await act(async()=>root.render(React.createElement(QueryClientProvider,{client},
      React.createElement(NfseTabContext.Provider,{value:{scope}},React.createElement(Page)))));
    await settle();
    assert.equal(checkboxes().length,26);
    assert.equal(button('Atualizar'),undefined);
    assert.equal(button('Revisar e emitir'),undefined);
    for (const row of document.querySelectorAll('tbody tr')) {
      assert.equal(row.querySelectorAll('button').length,1);
      assert.equal(row.querySelector('button').textContent,'Revisar');
      assert.equal(row.querySelector('.nfse-queue-status').textContent,'Preparado');
      assert(row.querySelector('.nfse-queue-status .nfse-status').title.includes('Informar a competência fiscal'));
    }
    await click(button('Revisar dados fiscais'));
    assert(document.querySelector('[data-modal]').dataset.modal.includes('NfseFiscalReviewModal'));
    await click(button('Fechar fluxo'));
    assert.equal(button('Emitir / consultar nota').disabled,true);
    assert.equal(button('Excluir selecionados').disabled,true);
    await click(checkboxes()[1]);
    assert.equal(checkboxes()[0].indeterminate,true);
    assert(button('Excluir selecionados (1)'));
    await click(button('Emitir / consultar nota'));
    assert(document.querySelector('[data-modal]').dataset.modal.includes('NfseSourceEmissionModal'));
    await click(button('Fechar fluxo'));
    await click(checkboxes()[0]);
    assert.equal(checkboxes().filter(c=>c.checked).length,26);
    assert(document.body.textContent.includes('25 selecionado(s) nesta página'));
    await click(button('Emitir selecionados (25)'));
    assert(document.querySelector('[data-modal]').dataset.modal.includes('NfseBatchEmissionModal'));
    assert(document.querySelector('[role="dialog"]').textContent.includes('25 itens selecionados'));
    await click(button('Fechar fluxo'));
    await click(button('Excluir selecionados'));
    assert(document.querySelector('[role="dialog"]').textContent.includes('25 preparação'));
    await click(button('Voltar'));
    assert.equal(calls.length,0);
    assert.equal(document.querySelector('[role="dialog"]'),null);
    await click(button('Limpar seleção'));
    assert.equal(checkboxes().filter(c=>c.checked).length,0);
    await click(button('Próxima'));
    assert.equal(checkboxes().length,2);
    assert(document.body.textContent.includes('Página 2'));
    await click(checkboxes()[1]);
    await click(button('Excluir selecionados'));
    const confirm=button('Excluir da fila');
    await act(async()=>{confirm.click();confirm.click();});
    await settle();
    assert.equal(calls.length,1);
    assert.equal(button('Excluindo').disabled,true);
    assert.equal(document.querySelector('[role="dialog"]'),null);
    await act(async()=>pending.reject(new Error('Falha sintética')));
    await settle();
    assert(document.body.textContent.includes('Exclusão não confirmada'));
    assert(button('Excluir selecionados (1)'));
    await click(button('Excluir selecionados'));
    await click(button('Excluir da fila'));
    assert.equal(calls.length,2);
    assert.equal(calls[0].input.requestId,calls[1].input.requestId);
    await act(async()=>pending.resolve());
    await settle();await settle();
    assert(!document.body.textContent.includes('Página 2'));
    assert.equal(checkboxes().length,26);
    assert.equal(button('Excluir selecionados').disabled,true);
    assert.equal(rows.length,25);
    // A scoped realtime invalidation updates the mounted list without a refresh control.
    rows=[...rows,row(70)];
    await act(async()=>client.invalidateQueries({queryKey:['nfse-queue','v1',scope.contextKey,scope.poloId,scope.environment,scope.month]}));
    await settle();
    assert(document.body.textContent.includes('26 documento(s)'));
    await click(checkboxes()[1]);
    await click(button('Próxima'));
    assert(document.body.textContent.includes('0 selecionado(s) nesta página'));
    // PREVIEWED means no dispatch lease, including a signed but untransmitted
    // preparation. The server rechecks the same scope lock before logical removal.
    const unsigned = { ...row(80), operationId:id(180), requestId:id(280), state:'PREVIEWED' };
    const signed = { ...row(81), operationId:id(181), requestId:id(281), state:'PREVIEWED',
      signedDpsXml:'PERSISTED SIGNED SYNTHETIC BYTES', fiscalInput:{frozen:true} };
    const dispatched = ['PROCESSING','AWAITING_CONFIRMATION','AUTHORIZED','REJECTED','BLOCKED'].map((state,n)=>({
      ...row(n+82), operationId:id(n+182), requestId:id(n+282), state }));
    rows = [unsigned,signed,...dispatched];
    const preserved = JSON.stringify([unsigned,signed]);
    await act(async()=>client.invalidateQueries({queryKey:['nfse-queue','v1',scope.contextKey,scope.poloId,scope.environment,scope.month]}));
    await settle();await settle();
    assert.equal(checkboxes().length,8);
    for (const item of dispatched) {
      const input = document.querySelector(`input[aria-label="Selecionar preparação de ${item.studentName}, ${item.classLabel}"]`);
      await click(input);assert.equal(button('Excluir selecionados').disabled,true);await click(input);
    }
    await click(checkboxes()[1]);await click(checkboxes()[2]);await click(checkboxes()[3]);
    assert(button('Excluir selecionados (2)'));
    await click(button('Excluir selecionados'));
    const dialog = document.querySelector('[role="dialog"]');
    assert.match(dialog.textContent,/histórico será mantido/);
    assert.match(dialog.textContent,/não cancela nem exclui notas fiscais emitidas/);
    assert.doesNotMatch(dialog.textContent,/sem assinatura|não assinad|unsigned/i);
    await click(button('Excluir da fila'));
    assert.deepEqual(calls.at(-1).input.documentIds,[unsigned.id,signed.id]);
    assert(!JSON.stringify(calls.at(-1).input).includes('PERSISTED SIGNED'));
    await act(async()=>pending.resolve());await settle();
    assert.equal(rows.length,5);assert.equal(JSON.stringify([unsigned,signed]),preserved);
  } finally {
    await act(async()=>root.unmount());client.clear();dom.window.close();
    delete globalThis.__nfseQueueService;
    await rm(temp,{recursive:true,force:true});
  }
});

