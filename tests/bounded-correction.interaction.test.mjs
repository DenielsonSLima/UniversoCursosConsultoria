import { build } from 'esbuild';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.CORRECTION_JSDOM_PATH || 'jsdom');
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixture, id } from './bounded-correction.fixture.mjs';
const reactPath = process.env.CORRECTION_REACT_PATH || require.resolve('react');
const reactDomPath = process.env.CORRECTION_REACT_DOM_PATH || require.resolve('react-dom/client');
const base = 'modules/gestor/gestao/tecnicos/detalhes/components/financeiro/';
await build({ entryPoints: [base + 'FinanceiroBoundedCorrectionDialog.tsx'], outfile: 'tmp/correction-dialog.mjs',
  bundle: true, format: 'esm', platform: 'node', packages: 'external', plugins: [{ name: 'mock-io', setup(b) {
    b.onResolve({ filter: /^react$/ }, () => ({ path: reactPath, external: true }));
    b.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const supabase={rpc:(...args)=>globalThis.mockRpc(...args)};' }));
  } }] });
const dom = new JSDOM('<html><body><button id="origin">Review</button></body></html>', { url: 'https://example.test' });
for (const key of ['window', 'document', 'HTMLElement', 'Node', 'MutationObserver']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import(pathToFileURL(reactPath));
const { createRoot } = await import(pathToFileURL(reactDomPath));
const { default: Dialog } = await import(pathToFileURL(resolve('tmp/correction-dialog.mjs')));
let root, host, calls, resumed, closed, preview, failConsent, failResume, hold, lostConsentResponse, denyActor;
const reset = () => {
  calls = []; resumed = 0; closed = 0; preview = fixture(); failConsent = false; failResume = false; hold = null; lostConsentResponse = false; denyActor = false;
  globalThis.mockRpc = async (name, args) => {
    calls.push({ name, args });
    if (denyActor) return {data:null,error:new Error('Consentimento pertence a outro usuário')};
    if (name.startsWith('preview_')) return { data: structuredClone(preview), error: null };
    if (hold) await hold;
    if (failConsent) return {data:null,error:new Error('Prévia alterada')};
    const replayed=preview.consent.consented;
    if(replayed && preview.consent.requestId!==args.p_request_id) return {data:null,error:new Error('Consent batch replay mismatch')};
    preview.consent={consented:true,requestId:args.p_request_id};
    if(lostConsentResponse) return {data:null,error:new Error('Resposta perdida após commit')};
    return {data:{consented:true,replayed,requestId:args.p_request_id},error:null};
  };
};
const render = async () => {
  document.getElementById('origin').focus();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await React.act(async () => { root.render(React.createElement(Dialog, {
    correction: preview, onClose: () => { closed++; }, onConfirm: async (p) => {
      resumed++; assert.equal(p.operationId, id(1)); assert.equal(p.matriculaId, id(2));
      if (failResume) throw new Error('Emissão parcial');
    },
  })); await new Promise(r => setTimeout(r, 1)); });
};
const clean = () => { React.act(() => root.unmount()); host.remove(); };
const button = () => [...host.querySelectorAll('button')].find(b => b.textContent.includes('Confirmar termos'));
const accept = () => React.act(() => host.querySelector('input').click());
reset(); await render();
assert.match(host.textContent, /15\/10\/2026/); assert.match(host.textContent, /15\/09\/2027/);
assert.match(host.textContent, /19,90/); assert.match(host.textContent, /2%/); assert.match(host.textContent, /1% ao mês/);
assert.match(host.textContent, /16\/10\/2026/); assert.match(host.textContent, /13 títulos do 2º ciclo/);
assert.equal(host.querySelectorAll('tbody tr').length, 12); assert.equal(button().disabled, true);
assert.equal(calls.length, 1); assert.equal(resumed, 0);
accept(); assert.equal(button().disabled, false);
await React.act(async () => { button().click(); await new Promise(r => setTimeout(r, 1)); });
assert.equal(resumed, 1); assert.equal(closed, 1);
assert.equal(calls[1].args.p_expected_fingerprint, preview.fingerprint);
assert.equal(calls[1].name, 'consent_bounded_financial_correction_secure'); clean();
reset(); await render();
await React.act(async () => { [...host.querySelectorAll('button')].find(b => b.textContent === 'Cancelar').click(); });
assert.equal(closed, 1); assert.equal(resumed, 0); assert.equal(calls.length, 1); clean();
reset(); await render(); accept(); failConsent = true;
await React.act(async () => { button().click(); });
assert.equal(resumed, 0); assert.equal(button().disabled, true); assert.match(host.textContent, /Prévia alterada/);
const originalRequest = calls[1].args.p_request_id; failConsent = false; accept();
await React.act(async () => { button().click(); });
assert.equal(calls[2].args.p_request_id, originalRequest); assert.equal(resumed, 1); clean();
reset(); await render(); accept(); failResume = true;
await React.act(async () => { button().click(); });
assert.equal(resumed, 1); assert.equal(closed, 0); assert.equal(button().disabled, true);
assert.match(host.textContent, /Emissão parcial/); clean();
// Reopening after a partial issuance uses the server's committed batch, never a new actor/key.
reset(); preview.consent={consented:false,requestId:null}; preview.status='WAITING_CONSENT';
await render(); accept(); failResume=true;
await React.act(async()=>{button().click();});
const committedPartialBatch=preview.consent.requestId;assert.ok(committedPartialBatch);clean();
preview.status='PARTIAL';failResume=false;await render();assert.equal(button().disabled,true);accept();
await React.act(async()=>{button().click();});
assert.equal(calls.filter(c=>c.name.startsWith('consent_')).at(-1).args.p_request_id,committedPartialBatch);
assert.equal(resumed,2);assert.equal(closed,1);clean();
// A lost consent response is recovered through authenticated preview after close/reopen.
reset();preview.consent={consented:false,requestId:null};preview.status='WAITING_CONSENT';lostConsentResponse=true;
await render();accept();await React.act(async()=>{button().click();});
const lostResponseBatch=preview.consent.requestId;assert.ok(lostResponseBatch);assert.equal(resumed,0);clean();
lostConsentResponse=false;preview.status='READY';await render();accept();
await React.act(async()=>{button().click();});
assert.equal(calls.filter(c=>c.name.startsWith('consent_')).at(-1).args.p_request_id,lostResponseBatch);
assert.equal(resumed,1);clean();
// An account change before confirmation is rejected by the authenticated consent RPC.
reset();await render();accept();denyActor=true;
await React.act(async()=>{button().click();});
assert.equal(resumed,0);assert.match(host.textContent,/outro usuário/);clean();
// Reopened preview for a different actor cannot recover the first actor's consent.
reset();denyActor=true;await render();assert.equal(button().disabled,true);assert.equal(resumed,0);
assert.equal(host.querySelector('input'),null);assert.match(host.textContent,/outro usuário/);clean();
reset(); preview.status = 'WAITING_BANK'; await render();
assert.equal(host.querySelector('input').disabled, true); assert.equal(button().disabled, true); assert.equal(resumed, 0); clean();
reset(); await render(); accept(); let release; hold = new Promise(r => { release = r; });
await React.act(async () => { const b = button(); b.click(); b.click(); });
assert.equal(calls.filter(c => c.name.startsWith('consent_')).length, 1);
await React.act(async () => { release(); }); assert.equal(resumed, 1); clean();
reset(); await render();
await React.act(async () => { document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })); });
assert.equal(closed, 1); assert.equal(resumed, 0); clean();
assert.equal(document.activeElement.id, 'origin');
await build({ entryPoints: [base + 'FinanceiroCicloManualStatus.tsx'], outfile: 'tmp/correction-status.mjs',
  bundle: true, format: 'esm', platform: 'node', packages: 'external', plugins: [{name:'mock-icons',setup(b){
    b.onResolve({filter:/^react$/},()=>({path:reactPath,external:true}));
    b.onResolve({filter:/^lucide-react$/},()=>({path:'icons',namespace:'mock'}));
    b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const AlertTriangle=()=>null,CheckCircle2=()=>null,Landmark=()=>null,LockKeyhole=()=>null,ReceiptText=()=>null,ShieldCheck=()=>null;'}));
  }}] });
const { default: Status } = await import(pathToFileURL(resolve('tmp/correction-status.mjs')));
for (const status of ['WAITING_BANK','WAITING_CONSENT','READY','PARTIAL','COMPLETE','REVIEW']) {
  reset(); preview.status=status; host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await React.act(async()=>{root.render(React.createElement(Status,{cicloManual:{correcaoEmissao:preview,
    cicloGerado:{numero:2,quantidadeItens:13,emitidosBanese:0,pendentesEmissao:13,emRevisao:0}},
    disabled:false,statusAcademico:'ATIVO',onGenerate:()=>{throw Error('No generation');},onResume:()=>{resumed++;}}));});
  assert.doesNotMatch(host.textContent,/Retomar emissão|Gerar e emitir/);
  assert.match(host.textContent,/2º ciclo: 13 títulos somente históricos/);
  assert.equal(host.querySelectorAll('button').length,['WAITING_CONSENT','READY','PARTIAL'].includes(status)?1:0);
  clean();
}
reset(); host=document.createElement('div');document.body.append(host);root=createRoot(host);
await React.act(async()=>{root.render(React.createElement(Status,{cicloManual:{correcaoEmissao:preview},
  disabled:false,statusAcademico:'TRANCADO',onGenerate:()=>{},onResume:()=>{resumed++;}}));});
assert.equal(host.querySelector('button').disabled,true);assert.equal(resumed,0);clean();
for (const paid of [false,true]) {
  reset(); const local={id:id(99),tipo:'MATRICULA',numero:0,descricao:'Taxa local',valor:'200.00',vencimento:'2026-09-15',
    status:paid?'PAGO':'CANCELADO',destinoCobranca:'LOCAL',emissaoBanese:'NAO_APLICAVEL',localSemBoletoComprovado:true,
    ...(paid?{}:{localFeeWaiverProven:true})};
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await React.act(async()=>{root.render(React.createElement(Status,{cicloManual:{habilitado:true,modo:'MANUAL',
    estado:'BLOQUEADO',proximoCicloNumero:2,bloqueio:{codigo:'REVIEW',mensagem:'Revisão'},matriculaLocal:local,
    cicloGerado:{numero:1,quantidadeItens:13,quantidadeBancaria:12,quantidadeLocal:1,total:'3558.80',activeTotal:'3358.80',
      emitidosBanese:12,pendentesEmissao:0,emRevisao:0}},
    disabled:false,statusAcademico:'ATIVO',onGenerate:()=>{throw Error('No automatic generation');},onResume:()=>{resumed++;}}));});
  assert.equal(host.textContent.includes('Matrícula local dispensada'),!paid);assert.equal(resumed,0);
  if(!paid){assert.match(host.textContent,/Não representa pagamento/);assert.match(host.textContent,/total histórico R\$\s*3.558,80/);assert.match(host.textContent,/total nominal ativo R\$\s*3.358,80/);}clean();
}
console.log('PASS: corrected full terms DOM, 12 dates, explicit consent, cancel/Escape, stale consent, same-key retry, partial failure and double-click fence; historical C2 has no resume/generation action; academic block retained; reopened partial/lost-response consent replay and changed-actor rejection');
reset(); let generatedC2=0; preview.status='COMPLETE';preview.historicalCycle2Count=0;
host=document.createElement('div');document.body.append(host);root=createRoot(host);
await React.act(async()=>{root.render(React.createElement(Status,{cicloManual:{correcaoEmissao:preview,
 habilitado:true,modo:'MANUAL',estado:'ELEGIVEL',podeGerar:true,proximoCicloNumero:2,bloqueio:null,
 cicloGerado:{numero:1,quantidadeItens:13,quantidadeBancaria:12,quantidadeLocal:1,total:'3558.80',
 emitidosBanese:12,pendentesEmissao:0,emRevisao:0}},disabled:false,statusAcademico:'ATIVO',
 onGenerate:()=>{generatedC2++;},onResume:()=>{throw Error('Completed correction must not resume C1');}}));});
const nextCycleButton=[...host.querySelectorAll('button')].find(button=>button.textContent.includes('Gerar e emitir 2º ciclo'));
assert.ok(nextCycleButton);await React.act(async()=>nextCycleButton.click());assert.equal(generatedC2,1);clean();
console.log('PASS: COMPLETE without canceled C2 routes to existing canonical C2 action');
