import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {build}=require('esbuild');
const {JSDOM}=require(process.env.NFSE_CERTIFICATE_JSDOM_PATH || 'jsdom');
const React=require('react');
const {act}=React;
const dom=new JSDOM('<!doctype html><html><head></head><body><main id="root" class="configuracoes-workspace"></main><button id="opener">Open</button></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','Event','MouseEvent','KeyboardEvent','File']) globalThis[key]=dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=require('react-dom/client');
await build({entryPoints:['modules/gestor/configuracoes/nfse-portal-contribuinte/components/NfseCertificateModal.tsx'],bundle:true,platform:'node',format:'cjs',jsx:'automatic',outfile:'tmp/nfse-certificate-modal-smoke.cjs',external:['react','react-dom'],plugins:[{name:'mock-network',setup(build){
 build.onResolve({filter:/certificate-upload\.service$/},()=>({path:'upload',namespace:'mock'}));
 build.onResolve({filter:/^@tanstack\/react-query$/},()=>({path:'query',namespace:'mock'}));
 build.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='upload'?'export const uploadNfseCertificate=(...args)=>globalThis.__upload(...args)':'export const useQueryClient=()=>globalThis.__client',loader:'js'}));
}}],loader:{'.css':'empty'}});
const Modal=require('../tmp/nfse-certificate-modal-smoke.cjs').default;
const sharedStyle=document.createElement('style');sharedStyle.textContent=fs.readFileSync('modules/gestor/configuracoes/configuracoes-dialogs.css','utf8');document.head.append(sharedStyle);
const style=document.createElement('style');style.textContent=fs.readFileSync('modules/gestor/configuracoes/nfse-portal-contribuinte/components/nfse-certificate-modal.css','utf8');document.head.append(style);
let calls=[],saved=[],closeCount=0,invalidations=[],resolveUpload,rejectUpload;
globalThis.__upload=(...args)=>{calls.push(args);return new Promise((resolve,reject)=>{resolveUpload=resolve;rejectUpload=reject;});};
globalThis.__client={invalidateQueries:async args=>{invalidations.push(args);}};
const root=createRoot(document.getElementById('root'));
const scope={contextKey:'11111111-1111-4111-8111-111111111111',poloId:'22222222-2222-4222-8222-222222222222',month:'2026-11',environment:'HOMOLOGACAO'};
const render=async()=>{await act(async()=>root.render(React.createElement(Modal,{scope,onClose:()=>{closeCount++;root.render(null);},onSaved:value=>{saved.push(value);root.render(null);}})));};
const changeFile=async()=>{const file=document.querySelector('input[type=file]');Object.defineProperty(file,'files',{configurable:true,value:[new File(['synthetic-only'],'synthetic.p12',{type:'application/x-pkcs12'})]});await act(async()=>file.dispatchEvent(new Event('change',{bubbles:true})));};
const submit=()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
await render();
let input=document.getElementById('nfse-a1-password');
assert.equal(input.type,'password');assert.equal(input.autocomplete,'off');
let css=window.getComputedStyle(input);
assert.equal(css.minHeight,'44px');assert.equal(css.borderStyle,'solid');assert.equal(css.backgroundColor,'rgb(255, 255, 255)');assert.equal(css.color,'rgb(24, 51, 75)');
await changeFile();input.value='  Sênha-測試!  ';
await act(async()=>document.querySelector('[aria-controls="nfse-a1-password"]').click());
assert.equal(input.type,'text');assert.equal(input.value,'  Sênha-測試!  ');
await act(async()=>{submit();submit();});
assert.equal(calls.length,1);assert.equal(calls[0][2],'  Sênha-測試!  ');assert.equal(input.type,'password');
await act(async()=>resolveUpload({expiresAt:'2027-11-10T12:00:00.000Z'}));
assert.deepEqual(saved,[{expiresAt:'2027-11-10T12:00:00.000Z'}]);assert.equal(input.value,'');assert.equal(document.querySelector('[role=dialog]'),null);assert.equal(invalidations.length,1);
assert.deepEqual(invalidations[0].queryKey,['nfse-configuration-metadata',scope.contextKey,scope.poloId,scope.environment]);
await render();await changeFile();input=document.getElementById('nfse-a1-password');input.value='fictional-failure';
await act(async()=>submit());await act(async()=>rejectUpload(new Error('Senha ou arquivo inválido.')));
assert.equal(input.value,'');assert.equal(input.type,'password');assert.match(document.querySelector('[role=alert]').textContent,/Senha ou arquivo/);
input.value='must-clear-on-file-change';await changeFile();assert.equal(input.value,'');assert.equal(document.querySelector('[role=alert]'),null);
input.value='must-clear-on-cancel';await act(async()=>[...document.querySelectorAll('button')].find(x=>x.textContent==='Cancelar').click());assert.equal(input.value,'');assert.equal(closeCount,1);assert.equal(document.querySelector('[role=dialog]'),null);
await render();input=document.getElementById('nfse-a1-password');input.value='must-clear-on-escape';await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(input.value,'');assert.equal(closeCount,2);
await render();input=document.getElementById('nfse-a1-password');input.value='must-clear-on-close';await act(async()=>document.querySelector('[aria-label=\"Fechar cadastro de certificado\"]').click());assert.equal(input.value,'');assert.equal(closeCount,3);
await render();await changeFile();input=document.getElementById('nfse-a1-password');assert.equal(input.value,'');await act(async()=>submit());assert.equal(calls.at(-1)[2],'');await act(async()=>rejectUpload(new Error('Synthetic stop.')));
await act(async()=>root.unmount());
console.log('PASS synthetic DOM smoke: standalone CSS, literal Unicode/whitespace, reveal, single submission, cache scope, expiry handoff, clearing after success/error/file change/cancel/Escape/unmount, blank-password file. No network request or real certificate.');

// Exercise the real upload service with only its remote boundary replaced.
globalThis.FormData=dom.window.FormData;
await build({
  entryPoints:['modules/gestor/emissor-nfse/services/configuration/certificate-upload.service.ts'],
  bundle:true,platform:'node',format:'cjs',outfile:'tmp/nfse-certificate-service-smoke.cjs',
  plugins:[{name:'mock-remote-boundary',setup(build){
    build.onResolve({filter:/\/configuration\.service$/},()=>({path:'enabled',namespace:'mock'}));
    build.onResolve({filter:/\/lib\/supabase$/},()=>({path:'remote',namespace:'mock'}));
    build.onLoad({filter:/.*/,namespace:'mock'},args=>({loader:'js',contents:args.path==='enabled'
      ? 'export const NFSE_CONFIGURATION_ENABLED=true'
      : 'export const supabase={functions:{invoke:(...args)=>globalThis.__invoke(...args)}}'}));
  }}],
});
const {uploadNfseCertificate}=require('../tmp/nfse-certificate-service-smoke.cjs');
let transport;
const validResponse={configured:true,chainVerified:true,representationVerified:false,
  expiresAt:'2027-11-10T12:00:00.000Z',readiness:'BLOCKED',revocationStatus:'UNKNOWN'};
globalThis.__invoke=async(name,options)=>{transport={name,options};return {data:validResponse,error:null};};
const result=await uploadNfseCertificate(scope,new File(['synthetic'],'synthetic.p12'),
  '  Sênha-測試!  ','33333333-3333-4333-8333-333333333333');
assert.equal(transport.name,'nfse-certificate-upload');
assert.equal(transport.options.body.get('password'),'  Sênha-測試!  ');
assert.equal(transport.options.headers['x-nfse-context'],scope.contextKey);
assert.equal(transport.options.headers['Content-Type'],undefined);
assert.equal(result.expiresAt,validResponse.expiresAt);
await assert.rejects(()=>uploadNfseCertificate(scope,new File(['x'],'wrong.txt'),'','33333333-3333-4333-8333-333333333333'),/PFX\/P12/);
globalThis.__invoke=async()=>({data:null,error:{context:new Response(JSON.stringify({error:'ICP_TRUST_STORE_UNAVAILABLE'}),{status:503})}});
await assert.rejects(()=>uploadNfseCertificate(scope,new File(['x'],'synthetic.p12'),'','33333333-3333-4333-8333-333333333333'),/cadeia de confiança configurada/);
console.log('PASS upload service smoke: literal multipart password, scoped headers, persisted expiry and safe service-error mapping. Remote boundary mocked.');
