import { createFixture, issuedReceivable, supabaseStub } from './alunoExtrato.browser.fixture.mjs';

export { createFixture, issuedReceivable };
export const accountId = '50000000-0000-4000-8000-000000000001';
export const poloId = createFixture().poloId;

export const accounts = [{
  id: accountId, banco: 'CAIXA SINTÉTICO', conta: 'CX-TESTE', titular: 'Unidade de teste',
  agencia: '', tipo: 'CAIXA', natureza: 'CAIXA_INTERNO', poloId,
  polosUso: [poloId], saldoInicial: 0, ativo: true,
}, {
  id: 'inactive', banco: 'CONTA INATIVA', conta: 'IGNORAR', poloId,
  polosUso: [poloId], ativo: false,
}, {
  id: 'foreign', banco: 'OUTRO POLO COMPARTILHADO', conta: 'IGNORAR', poloId: 'another-polo',
  polosUso: [poloId], ativo: true,
}];

export const paidFixture = (received = 280) => createFixture([issuedReceivable({
  status: 'PAGO', valor_pago: received, data_pagamento: '2026-10-10',
  origem_pagamento: 'PRESENCIAL', gateway_status: 'CANCELED',
  emissao_ciclo_status: 'PENDENTE', desconto_aplicado: 300 - received,
  composicao_status: 'MANUAL',
  operation_capabilities: {
    sourceSystem: 'BANESE', provenanceKind: 'NATIVE_ISSUED',
    canSettle: false, canOpenExisting: false,
  },
})], { recebido: received, pendente: 0, pagos: 1, pendentes: 0 });

// Realtime is deliberately silent: a successful local operation must reconcile
// the statement and shared totals through Query invalidation on its own.
export const silentSupabaseStub = supabaseStub.replace("callback('SUBSCRIBED');", '');

export const financeStub = `
export const financeiroService = {
  async getContasBancariasSaldos(poloId) {
    window.accountCalls.push(poloId);
    if (window.accountError) throw new Error('Consulta de contas negada.');
    return structuredClone(window.accounts);
  },
  async markReceivablePaid(receivableId, payload) {
    window.settlementCalls.push({receivableId,payload:structuredClone(payload)});
    if (window.holdSettlement) await new Promise(resolve=>{window.releaseSettlement=resolve});
    if (window.failSettlements > 0) {
      window.failSettlements-=1;
      throw new Error('Servidor não confirmou o recebimento; tente novamente.');
    }
    if (window.unconfirmedResult) return {success:false};
    window.fixture=structuredClone(window.paidFixture);
    return {success:true,gatewayCanceled:true,gatewayProvider:'banese_card',settlementId:'synthetic-settlement'};
  },
};
`;

export const toastStub = `import React,{useState} from 'react';
  export function useToast(){const [toasts,setToasts]=useState([]);
    const add=(title,message)=>setToasts(list=>[...list,{title,message}]);
    return {toasts,removeToast(){},toast:{success:add,error:add,info:add,warning:add}};}
  export default function Toast({toasts}){return <div>{toasts.map((item,index)=><div role="status" key={index}>{item.title}: {item.message}</div>)}</div>}`;

export const entry = `import React from 'react';import {createRoot} from 'react-dom/client';
  import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
  import Statement from './AlunoFinanceiroExtrato';
  const client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  const invalidate=client.invalidateQueries.bind(client);
  client.invalidateQueries=(filters,options)=>{
    window.invalidations.push(filters?.queryKey);return invalidate(filters,options);
  };
  client.setQueryData(['turma-financeiro-extrato-aluno','unrelated-enrollment'],{sentinel:true});
  window.queryClient=client;
  window.calls=[];window.channels=[];window.accountCalls=[];window.settlementCalls=[];window.invalidations=[];
  let app;
  window.mount=()=>{app=createRoot(document.getElementById('root'));app.render(
    <QueryClientProvider client={client}><Statement matriculaId={window.fixture.matriculaId}
      turmaId={window.fixture.turmaId} canSettle={window.canSettle}
      onBack={()=>{window.backRequested=true}}/></QueryClientProvider>)};
  window.refreshStatement=()=>client.invalidateQueries({queryKey:['turma-financeiro-extrato-aluno',window.fixture.matriculaId]});
  window.refetchAccounts=()=>client.refetchQueries({predicate:query=>query.queryKey[0]==='financeiro'&&query.queryKey[1]==='contas-bancarias-saldos'});
  window.otherQueryInvalidated=()=>client.getQueryState(['turma-financeiro-extrato-aluno','unrelated-enrollment']).isInvalidated;
`;
