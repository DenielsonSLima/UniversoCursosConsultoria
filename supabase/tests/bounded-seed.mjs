// All identifiers and payer documents are deliberately synthetic.
export const uid = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const actor=uid(1), operation=uid(9), bankIds=[], localIds=[];
export const paidLocal=uid(201);
export async function seed(db) {
  const query=(sql,args=[])=>db.query(sql,args);
  const cls=uid(5), polo=uid(2), payer=uid(4);
  for(let m=1;m<=6;m++) {
    if(m!==1) await query('insert into public.matriculas values($1,$2,$3,$4)',[uid(5+m),cls,payer,'ATIVO']);
  }
  const groups=[];
  for(let m=1;m<=6;m++) groups.push({m,cycle:1,local:true,months:m<=3?12:0});
  groups.push({m:1,cycle:2,local:false,months:12});
  let bank=0;
  for(const g of groups) {
    const request=uid(500+g.m*10+g.cycle), enrollment=uid(5+g.m), reviewed=[], ids=[];
    const add=async(number,type,local)=>{
      const id=local?uid(200+g.m):uid(1000+(++bank)); ids.push(id);
      if(local && g.m!==1) localIds.push(id); else if(!local) bankIds.push(id);
      const amount=local?200:type==='REMATRICULA'?100:279.90;
      const date=type==='PARCELA'?new Date(Date.UTC(2026,9+number-1,5)).toISOString().slice(0,10):'2026-10-01';
      const key=local?'matricula':type==='REMATRICULA'?'ciclo-1-rematricula':`ciclo-${g.cycle}-parc-${number}`;
      const snapshot={versao:2,identidade:{},cicloManual:{requestId:request,cicloNumero:g.cycle,
        regraFingerprint:'r',politicaFingerprint:'p',cronogramaFingerprint:'s'},
        tipoLancamento:type==='PARCELA'?'MENSALIDADE':type,valorBase:amount,
        descontoPontualidade:type==='PARCELA'?19.9:0,jurosAtrasoPercentual:1,
        multaAtrasoPercentual:2,multaAtrasoValor:Math.round(amount*2)/100,
        aplicarDesconto:type==='PARCELA',aplicarMultaJuros:true,destinoCobranca:local?'LOCAL':'BANESE'};
      const row={id,polo_id:polo,cliente_id:payer,matricula_id:enrollment,turma_id:cls,
        tipo_lancamento:type,parcela_numero:number,origem_cronograma_id:key,descricao:`Synthetic ${type} ${number}`, 
        regra_financeira_tecnica_snapshot:snapshot,status:g.m===1&&local?'PAGO':'PENDENTE',
        valor:amount,data_vencimento:date,valor_pago:g.m===1&&local?200:null,
        data_pagamento:g.m===1&&local?'2026-10-01':null,updated_at:'2026-10-01T00:00:00Z'};
      if(local && g.m===1) Object.assign(row,{origem_pagamento:'PRESENCIAL',forma_pagamento:'DINHEIRO',
        conta_bancaria_id:uid(9002),manual_settlement_id:uid(9001),
        manual_settlement_principal_cents:20000,manual_settlement_received_cents:20000,
        manual_settlement_interest_cents:0,manual_settlement_penalty_cents:0,
        manual_settlement_addition_cents:0,manual_settlement_discount_cents:0});
      if(!local) Object.assign(row,{gateway_provider:'banese_card',gateway_payment_method:'BOLETO',
        gateway_submission_channel:'API',gateway_submission_status:'API_REGISTERED',gateway_environment:'sandbox',
        gateway_financial_terms_confirmed_at:'2026-10-01T00:00:00Z',gateway_status:'PENDING',
        gateway_payment_id:String(bank).padStart(9,'0'),gateway_boleto_nosso_numero:String(bank).padStart(9,'0'),
        gateway_boleto_convenio:'123',gateway_boleto_agencia:'033',gateway_boleto_linha_digitavel:'1'.repeat(47),
        gateway_boleto_codigo_barras:'2'.repeat(44),gateway_synced_at:'2026-10-01T00:00:00Z'});
      await query('insert into public.contas_receber select (jsonb_populate_record(null::public.contas_receber,$1::jsonb)).*',[row]);
      reviewed.push({chave:key,vencimento:date,valor:amount,tipo:type,numero:number,destinoCobranca:local?'LOCAL':'BANESE'});
    };
    await add(0,g.local?'MATRICULA':'REMATRICULA',g.local);
    for(let n=1;n<=g.months;n++) await add(n,'PARCELA',false);
    await query(`insert into internal_academic.technical_manual_cycle_runs(matricula_id,turma_id,cycle_number,request_id,item_count,receivable_ids,state,reviewed_items,rule_fingerprint,policy_fingerprint,schedule_fingerprint) values($1,$2,$3,$4,$5,$6,'LOCAL_CREATED',$7,'r','p','s')`,
      [enrollment,cls,g.cycle,request,ids.length,ids,JSON.stringify(reviewed)]);
  }
  await query(`insert into public.receivable_manual_settlements(id,receivable_id,state,requires_remote_cancellation,
    polo_id,account_id,payment_method,payment_date,principal_cents,received_cents,interest_cents,penalty_cents,addition_cents,discount_cents)
    values($1,$2,'COMPLETED',false,$3,$4,'DINHEIRO','2026-10-01',20000,20000,0,0,0,0)`,
    [uid(9001),paidLocal,polo,uid(9002)]);
  await db.exec(`update public.contas_receber r set gateway_financial_terms=internal_academic.technical_manual_banese_expected_terms(r)
    where gateway_provider is not null;
    update public.contas_receber set forma_pagamento='BOLETO',gateway_boleto_issued_at=now(),
      gateway_issuer_polo_id=polo_id where gateway_provider is not null;
    update internal_academic.technical_manual_cycle_runs set created_by='${actor}';
    insert into public.payment_gateway_transactions(id,receivable_id,provider_code,environment,payment_method,amount,
      remote_payment_id,bank_slip_our_number,bank_slip_digitable_line,bank_slip_barcode,remote_status,synced_at,updated_at)
    select gen_random_uuid(),id,gateway_provider,gateway_environment,gateway_payment_method,valor,gateway_payment_id,
      gateway_boleto_nosso_numero,gateway_boleto_linha_digitavel,gateway_boleto_codigo_barras,'PENDING',gateway_synced_at,updated_at
      from public.contas_receber where gateway_provider is not null;
    insert into internal_academic.technical_manual_receivable_issuance_authorizations
      (receivable_id,matricula_id,turma_id,cycle_number,request_id,receivable_fingerprint,authorized_by,authorized_at,claim_count)
    select id,matricula_id,turma_id,(regra_financeira_tecnica_snapshot#>>'{cicloManual,cicloNumero}')::integer,
      gen_random_uuid(),'original-fingerprint','${actor}',now(),1 from public.contas_receber where gateway_provider is not null;
    update internal_academic.technical_manual_receivable_issuance_authorizations a
      set first_claimed_at=now(),receivable_fingerprint=internal_academic.technical_manual_receivable_issuance_fingerprint(r)
      from public.contas_receber r where r.id=a.receivable_id;
    update public.payment_gateway_transactions t set origin_polo_id=r.polo_id,issuer_polo_id=r.gateway_issuer_polo_id,
      pix_payload=r.gateway_pix_payload,pix_encoded_image=r.gateway_pix_encoded_image,
      raw_payload=jsonb_build_object('manualCycleIssuance',jsonb_build_object('cycleRequestId',
        r.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}'))
      from public.contas_receber r where r.id=t.receivable_id;
    insert into public.banese_reconciliation_queue(receivable_id,state,next_check_at,updated_at)
      select id,'READY',now(),now() from public.contas_receber where gateway_provider is not null;`);
}
