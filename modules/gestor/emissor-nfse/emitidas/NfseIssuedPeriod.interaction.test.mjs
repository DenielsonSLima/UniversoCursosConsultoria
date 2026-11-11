import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir,mkdtemp,writeFile,rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL,fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import React,{act} from 'react';
const { JSDOM }=await import(process.env.NFSE_TEST_JSDOM_MODULE?pathToFileURL(resolve(process.env.NFSE_TEST_JSDOM_MODULE)).href:'jsdom');
const base=fileURLToPath(new URL('../../../../',import.meta.url));
const scope={contextKey:'synthetic-context',poloId:'synthetic-polo',environment:'PRODUCAO',month:'2026-11'};

test('period provider synchronizes date inputs, KPI and query filters with month reset and fail-closed total',async()=>{
 await mkdir(resolve(base,'tmp'),{recursive:true});const temp=await mkdtemp(resolve(base,'tmp/nfse-issued-period-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,
  MutationObserver:dom.window.MutationObserver,MouseEvent:dom.window.MouseEvent,IS_REACT_ACT_ENVIRONMENT:true});
 dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
 const {createRoot}=await import('react-dom/client');
 const output=resolve(temp,'test.mjs'),requests=[];
 globalThis.__periodQuery=(queryScope,filters)=>{
  requests.push({queryScope,filters});return {data:{rows:[],page:filters.page,pageSize:25,totalItems:100,totalAmount:'12345.67',courseTypes:[]},
    isPending:false,isFetching:false,error:globalThis.__periodFailure?new Error('Synthetic failure'):null,refetch:async()=>{}};
 };
 const compiled=await build({stdin:{contents:`export {default as List} from './modules/gestor/emissor-nfse/components/NfseDocumentsList';
  export {default as Metric} from './modules/gestor/emissor-nfse/emitidas/NfseIssuedTotalMetric';
  export {NfseIssuedPeriodProvider as Provider,useNfseIssuedPeriod} from './modules/gestor/emissor-nfse/emitidas/NfseIssuedPeriodContext';
  export {NfseTabContext} from './modules/gestor/emissor-nfse/components/NfseTabContext';`,resolveDir:base,loader:'tsx'},
  bundle:true,write:false,format:'esm',platform:'node',packages:'external',jsx:'automatic',outfile:output,loader:{'.css':'empty'},
  plugins:[{name:'period-read-fixture',setup(builder){
   builder.onResolve({filter:/useNfseQueries$/},()=>({path:'query',namespace:'fixture'}));
   builder.onResolve({filter:/NfseDocumentOperationAction$/},()=>({path:'operation',namespace:'fixture'}));
   builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='query'?'export const useNfseDocuments=(...args)=>globalThis.__periodQuery(...args);':'export default function(){return null}',loader:'js'}));
  }}]});
 await writeFile(output,compiled.outputFiles[0].contents);
 const {List,Metric,Provider,NfseTabContext,useNfseIssuedPeriod}=await import(pathToFileURL(output).href);
 function Controls(){const period=useNfseIssuedPeriod();return React.createElement(React.Fragment,null,
  React.createElement('button',{onClick:()=>period.setFilters({search:'  Nota  ',origin:'SERVICO'})},'Aplicar origem'),
  React.createElement('button',{disabled:period.isSettling,'aria-label':'Exportar'},'Exportar'));}
 function App({month='2026-11',enabled=true,showList=true,issuedState='ACTIVE'}={}){const current={...scope,month};return React.createElement(Provider,{month},
  React.createElement(NfseTabContext.Provider,{value:{scope:current,canRead:enabled,unavailable:false,loading:false}},
   React.createElement(Metric,{scope:current,enabled}),React.createElement(Controls),
   showList&&React.createElement(List,{status:'EMITIDA',issuedState,title:'Notas emitidas',description:'',emptyTitle:'Vazio',emptyDescription:''})));}
 const root=createRoot(document.getElementById('root'));
 const settle=()=>act(async()=>{await new Promise(r=>setTimeout(r,20));});
 const input=label=>document.querySelector(`input[aria-label="${label}"]`);
 const setDate=async(label,value,blur=true)=>{await act(async()=>{const item=input(label);Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(item,value);item.dispatchEvent(new dom.window.Event('input',{bubbles:true}));item.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});await settle();
   if(blur) await act(async()=>input(label).dispatchEvent(new dom.window.FocusEvent('focusout',{bubbles:true})));await settle();};
 try{
  await act(async()=>root.render(React.createElement(App)));await settle();
  assert.equal(input('Data inicial de emissão').value,'2026-11-01');assert.equal(input('Data final de emissão').value,'2026-11-30');
  assert(document.querySelector('.nfse-metric').textContent.includes('12.345,67'),'KPI uses server aggregate, not empty current-page rows');
  const exportButton=()=>document.querySelector('button[aria-label="Exportar"]');
  assert.equal(exportButton().disabled,false);
  await setDate('Data inicial de emissão','0002-11-01',false);
  assert.equal(exportButton().disabled,true,'Unapplied date draft blocks exporting the old period');
  assert.equal(document.querySelector('.nfse-metric strong').textContent,'—');
  assert.equal(requests.at(-1).filters.dateFrom,'2026-11-01');
  await act(async()=>input('Data inicial de emissão').dispatchEvent(new dom.window.FocusEvent('focusout',{bubbles:true})));await settle();
  assert(document.body.textContent.includes('1900 e 2199'));assert.equal(exportButton().disabled,true);
  await setDate('Data inicial de emissão','2026-10-01',false);
  assert.equal(exportButton().disabled,true,'Valid draft must still be committed before exporting');
  await act(async()=>input('Data inicial de emissão').dispatchEvent(new dom.window.FocusEvent('focusout',{bubbles:true})));await settle();
  assert.equal(exportButton().disabled,false);assert(document.querySelector('.nfse-metric').textContent.includes('12.345,67'));

  assert.equal(requests.at(-1).filters.dateFrom,'2026-10-01');
  assert(requests.slice(-2).every(r=>r.filters.dateFrom==='2026-10-01'));
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Aplicar origem').click());await settle();
  assert(requests.slice(-2).every(r=>r.filters.origin==='SERVICO'&&r.filters.search==='Nota'&&r.filters.issuedState==='ACTIVE'));
  await act(async()=>root.render(React.createElement(App,{month:'2028-02'})));await settle();
  assert.equal(input('Data inicial de emissão').value,'2028-02-01');assert.equal(input('Data final de emissão').value,'2028-02-29');
  assert.equal(input('Buscar registros').value,'');
  await setDate('Data inicial de emissão','0002-02-01',false);assert.equal(exportButton().disabled,true);
  await act(async()=>root.render(React.createElement(App,{month:'2028-02',showList:false})));await settle();
  assert.equal(exportButton().disabled,false,'Unmounting the issued filters clears the discarded date draft');
  await act(async()=>root.render(React.createElement(App,{month:'2028-02',issuedState:'CANCELLED'})));await settle();
  await setDate('Data inicial de emissão','0002-02-01');
  assert.equal(exportButton().disabled,false,'Cancelled filters never change active issued period pending state');
  assert(document.querySelector('.nfse-metric').textContent.includes('12.345,67'));
  globalThis.__periodFailure=true;await act(async()=>root.render(React.createElement(App,{month:'2028-02'})));await settle();
  assert.equal(document.querySelector('.nfse-metric strong').textContent,'—');
  globalThis.__periodFailure=false;await act(async()=>root.render(React.createElement(App,{enabled:false})));await settle();
  assert.equal(document.querySelector('.nfse-metric strong').textContent,'—');
 }finally{await act(async()=>root.unmount());dom.window.close();delete globalThis.__periodQuery;delete globalThis.__periodFailure;await rm(temp,{recursive:true,force:true});}
});
