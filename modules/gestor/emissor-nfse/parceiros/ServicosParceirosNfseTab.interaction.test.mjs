import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir,mkdtemp,writeFile,rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { build } from 'esbuild';
import React,{act} from 'react';
const {JSDOM}=await import(process.env.NFSE_TEST_JSDOM_MODULE?pathToFileURL(resolve(process.env.NFSE_TEST_JSDOM_MODULE)).href:'jsdom');
const base=fileURLToPath(new URL('../../../../',import.meta.url));
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const scope={contextKey:id(1),poloId:id(2),environment:'PRODUCAO',month:'2026-11'};
test('services filter, paginate and confirm only eligible page selections, with safe retries and stale-data recovery',async()=>{
  await mkdir(resolve(base,'tmp'),{recursive:true});const tmp=await mkdtemp(resolve(base,'tmp/service-dom-'));
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,
    MutationObserver:dom.window.MutationObserver,MouseEvent:dom.window.MouseEvent,IS_REACT_ACT_ENVIRONMENT:true});
  dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
  const {createRoot}=await import('react-dom/client'); const {QueryClient,QueryClientProvider}=await import('@tanstack/react-query');
  const rows=['PREVIEWED','REJECTED','AUTHORIZED','CANCELLED','PROCESSING'].map((state,n)=>({id:id(100+n),partnerName:`Parceiro sintético ${n}`,
    partnerType:n===0?'PJ':n===1?'PF':'ALUNO',modelName:'Modelo',serviceDate:'2026-11-01',serviceDescription:'Serviço',amount:'10.00',
    receivableAction:'NONE',state,operationId:state?id(200+n):null,canRemove:n<2,number:n===2||n===3?'1':null}));
  const requested=[],removed=[],cache=new Map();let fail=false,pending=false,shrink=false;
  globalThis.__serviceQuery=(_scope,page,filters)=>{
    requested.push({...filters,page});const key=JSON.stringify([page,filters,shrink]);
    if(!cache.has(key))cache.set(key,{rows:shrink?[]:rows,page,pageSize:5,totalItems:shrink?0:6,totalAmount:shrink?'0.00':'60.00'});
    return {data:cache.get(key),error:null,isPending:false,isFetching:pending,refetch:async()=>{}};
  };
  globalThis.__serviceRemove=()=>({isPending:pending,mutateAsync:async input=>{removed.push(input);if(fail)throw new Error('Resposta perdida');
    return {result:{message:'Histórico e contas preservados.'},scope};}});
  const output=resolve(tmp,'test.mjs');
  const built=await build({stdin:{contents:`export {default as Tab} from './modules/gestor/emissor-nfse/parceiros/ServicosParceirosNfseTab';
    export {NfseTabContext} from './modules/gestor/emissor-nfse/components/NfseTabContext';`,resolveDir:base,loader:'tsx'},
    bundle:true,write:false,format:'esm',platform:'node',packages:'external',jsx:'automatic',outfile:output,loader:{'.css':'empty'},plugins:[{name:'synthetic',setup(b){
      b.onResolve({filter:/useNfsePartnerServices$/},()=>({path:'hooks',namespace:'fixture'}));
      b.onResolve({filter:/useNfsePartnerServicesRealtime$/},()=>({path:'realtime',namespace:'fixture'}));
      b.onResolve({filter:/Nfse(PartnerServiceModal|SourceEmissionModal|BatchEmissionModal)$/},()=>({path:'modal',namespace:'fixture'}));
      b.onResolve({filter:/queries\/nfse-cache$/},()=>({path:'cache',namespace:'fixture'}));
      b.onResolve({filter:/lib\/supabase$/},()=>({path:'blocked',namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'js',contents:path==='hooks'?`export const useNfsePartnerServices=(...a)=>globalThis.__serviceQuery(...a);export const useRemoveNfsePartnerServices=(...a)=>globalThis.__serviceRemove(...a);`
        :path==='realtime'?'export const useNfsePartnerServicesRealtime=()=>{};':path==='cache'?'export const invalidateNfseCache=async()=>{};'
        :path==='modal'?'export default ()=>null;':'throw new Error("Live backend forbidden");'}));
    }}]});await writeFile(output,built.outputFiles[0].contents);
  const {Tab,NfseTabContext}=await import(pathToFileURL(output).href);const client=new QueryClient();const root=createRoot(document.getElementById('root'));
  const render=async()=>{await act(async()=>root.render(React.createElement(QueryClientProvider,{client},React.createElement(NfseTabContext.Provider,{value:{scope}},React.createElement(Tab)))));};
  const settle=async()=>act(async()=>{await setTimeout(10);});
  const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text||b.getAttribute('aria-label')===text);
  const input=label=>document.querySelector(`input[aria-label="${label}"]`);
  const click=async el=>{assert(el);await act(async()=>el.click());await settle();};
  const value=async(el,next,blur=true)=>{await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,next);
    el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});await settle();
    if(blur){await act(async()=>el.dispatchEvent(new dom.window.FocusEvent('focusout',{bubbles:true})));await settle();}};
  try{
    await render();await settle();assert(button('Emitir NFS-e'));assert(document.body.textContent.includes('Não enviada (preparada)'));assert.equal(requested.at(-1).partnerType,'');assert.equal(document.querySelectorAll('tbody tr').length,5);
    assert.equal(input('Selecionar serviço de Parceiro sintético 4').disabled,false);
    await click(input('Selecionar serviço de Parceiro sintético 4'));
    assert.equal(button('Revisar lote (1)').disabled,false); assert.equal(button('Excluir selecionados (1)').disabled,true);
    await click(input('Selecionar serviços desta página')); assert.equal(button('Revisar lote (5)').disabled,false);
    assert.equal(button('Excluir selecionados (5)').disabled,true);
    await click(button('Selecionar não emitidos'));assert(button('Excluir selecionados (2)'));
    await click(button('Excluir selecionados (2)'));assert(document.querySelector('[role="dialog"]').textContent.includes('contas a receber'));
    await click(button('Voltar'));assert.equal(removed.length,0);
    await click(button('Próxima página'));assert.equal(requested.at(-1).page,2);assert(button('Excluir selecionados (0)'));
    await value(input('Buscar serviços'),'Empresa');assert.equal(requested.at(-1).page,1);assert.equal(requested.at(-1).search,'Empresa');
    const calls=requested.length;await value(input('Data inicial da prestação'),'0002-11-01');assert.equal(requested.length,calls);assert(document.body.textContent.includes('1900 e 2199'));
    await value(input('Data inicial da prestação'),'2026-11-01');await value(input('Data final da prestação'),'2026-11-20');
    await click(input('Tipo de parceiro'));await click([...document.querySelectorAll('[role="option"]')].find(e=>e.textContent==='Pessoa jurídica (PJ)'));
    assert.equal(requested.at(-1).partnerType,'PJ');assert.equal(requested.at(-1).dateFrom,'2026-11-01');assert.equal(requested.at(-1).dateTo,'2026-11-20');
    await click(button('Selecionar não emitidos'));await click(button('Excluir selecionados (2)'));
    fail=true;await click(button('Excluir da lista'));assert.equal(removed.length,1);assert.deepEqual(removed[0].serviceIds,[id(100),id(101)]);
    assert(document.body.textContent.includes('Exclusão não confirmada'));
    await click(button('Excluir selecionados (2)'));fail=false;await click(button('Excluir da lista'));assert.deepEqual(removed[1],removed[0]);assert(button('Excluir selecionados (0)'));
    pending=true;await render();assert.equal(input('Selecionar serviços desta página').disabled,true);assert.equal(input('Buscar serviços').disabled,true);
    pending=false;await render();await click(button('Próxima página'));shrink=true;await render();await settle();assert.equal(requested.at(-1).page,1);assert(document.body.textContent.includes('Nenhum serviço encontrado'));
  }finally{await act(async()=>root.unmount());client.clear();dom.window.close();delete globalThis.__serviceQuery;delete globalThis.__serviceRemove;await rm(tmp,{recursive:true,force:true});}
});
