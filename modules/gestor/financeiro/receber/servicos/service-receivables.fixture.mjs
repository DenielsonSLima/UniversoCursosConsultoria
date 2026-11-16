// Fictional local UI fixtures. All reads and settlements stay inside this process.
export const serviceFixtureId = value => `11111111-1111-4111-8111-${String(value).padStart(12, '0')}`;

export function createServiceCacheFixture() {
  return { reads: [], channels: [], removed: 0, hold: false, pending: [], payments: [], accountsUsage: [], revision: 1 };
}

export function serviceCacheFixturePlugin(base) {
  const sources = {
    service: `const f=globalThis.__serviceCacheFixture;
      const id=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
      const row=filters=>({id:id(1),clienteId:id(4),poloId:filters.poloId,poloNome:'Unidade fictícia',
        clienteNome:'Parceiro fictício '+filters.poloId.slice(-1),descricao:'Serviço fictício revisão '+f.revision,
        valor:120,categoria:'OUTROS_CREDITOS',dataVencimento:'2026-11-30',status:'PENDENTE',
        operationCapabilities:{canSettle:true,canOpenExisting:false},nfseNumber:String(f.revision),
        nfseInstallmentNumber:1,nfseInstallmentCount:1,nfseFiscalCancelledAt:null});
      const read=(kind,filters,value)=>{f.reads.push({kind,filters:{...filters}});return f.hold?
        new Promise(resolve=>f.pending.push(()=>resolve(value))):Promise.resolve(value)};
      export const serviceReceivablesService={
        groups:(filters,page,pageSize)=>read('groups',filters,{groups:[{key:id(4),label:row(filters).clienteNome,
          itemCount:1,pendingCount:1,receivedCount:0,canceledCount:0,nextDue:'2026-11-30',first:row(filters)}],
          totalItems:1,totalReceivables:1,page,pageSize}),
        groupItems:(filters,partner,page,pageSize)=>read('items',filters,{rows:[row(filters)],totalItems:1,page,pageSize}),
        summary:filters=>read('summary',filters,{allCount:2,pendingCount:1,receivedCount:1,overdueCount:0,canceledCount:0,
          allValue:170,pendingValue:120,receivedValue:50,overdueValue:0,canceledValue:0}),
        exportSnapshot:()=>{throw new Error('Export is outside this cache regression');}};`,
    shared: `export const useFinanceiroSharedQueries=options=>{
      globalThis.__serviceCacheFixture.accountsUsage.push({...options});return {accountsQuery:{data:[],isError:false}};};`,
    payment: `export const confirmFinancialPayment=async(kind,input,fingerprint)=>{
      globalThis.__serviceCacheFixture.payments.push({kind,input,fingerprint});
      return {preview:{status:'PAGO',paymentAmount:'120.00',remainingAfter:'0.00'}};};`,
    modal: `import React from 'react';export const FinancialPaymentModal=p=>React.createElement('section',
      {role:'dialog'},'Pagamento fictício',React.createElement('button',{onClick:p.onClose},'Fechar fictício'),
      React.createElement('button',{onClick:()=>p.onConfirm({input:{sourceId:p.sourceId},fingerprint:'fictional'})},'Confirmar fictício'));`,
    bolepix: `export const OtherCreditPaymentModal=()=>null;`,
    report: `import React from 'react';export default function Report(){return React.createElement('button',{},'EXTRATO PDF');}
      export const FinancialReportStatusBadge=()=>null;`,
    supabase: `const f=globalThis.__serviceCacheFixture;export const supabase={
      channel(name){const channel={name,on(_kind,config,callback){channel.config=config;channel.event=callback;return channel},
        subscribe(callback){channel.status=callback;return channel}};f.channels.push(channel);return channel},
      removeChannel(){f.removed++;},functions:{invoke(){throw new Error('Real Edge request forbidden in fictional fixture');}},
      rpc(){throw new Error('Real database request forbidden in fictional fixture');}};`,
    otherTab: `import React from 'react';export default function OtherTab(){return React.createElement('p',{},'Modalidade acadêmica fictícia');}`,
  };
  return { name: 'fictional-service-cache', setup(builder) {
    for (const [filter, path] of [
      [/servicos-receber\.service$/, 'service'], [/useFinanceiroSharedQueries$/, 'shared'],
      [/financial-payment\.service$/, 'payment'], [/\/FinancialPaymentModal$/, 'modal'],
      [/\/OtherCreditPaymentModal$/, 'bolepix'], [/components\/FinancialReportPreview$/, 'report'],
      [/lib\/supabase$/, 'supabase'], [/\/(?:Tecnico|Livres|Especializacao|Ead)ReceberTab$/, 'otherTab'],
    ]) builder.onResolve({ filter }, () => ({ path, namespace: 'service-cache-fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'service-cache-fixture' }, args => ({
      loader: 'js', resolveDir: base, contents: sources[args.path],
    }));
  } };
}
