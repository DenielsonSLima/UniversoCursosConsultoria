-- Authenticated full-term review and private bank-active C1 projection.
begin;
alter table internal_financial_correction.items add column consent_batch_id uuid;

create function internal_financial_correction.state_summary(p_matricula_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o internal_financial_correction.operations%rowtype; status_value text;
 emitted integer; review_count integer; local_disposition text; fingerprint_value text;
begin
 select op.* into o from internal_financial_correction.operations op where exists(
 select 1 from internal_financial_correction.items i where i.operation_id=op.id and i.matricula_id=p_matricula_id and i.kind='RESET_C1');
 if not found then return null; end if;
 select count(*) filter(where internal_academic.technical_manual_banese_receivable_complete(r)
   or internal_academic.technical_manual_banese_receivable_paid_issued(r)),
 count(*) filter(where r.gateway_submission_status='API_REVIEW') into emitted,review_count
 from internal_financial_correction.items i join public.contas_receber r on r.id=i.receivable_id
 where i.operation_id=o.id and i.matricula_id=p_matricula_id and i.kind='RESET_C1';
 status_value:=case when exists(select 1 from internal_financial_correction.items where operation_id=o.id and state='REVIEW') then 'REVIEW'
 when o.state<>'FINALIZED' then 'WAITING_BANK'
 when emitted=12 then 'COMPLETE' when review_count>0 then 'REVIEW'
 when not exists(select 1 from internal_financial_correction.items where operation_id=o.id and matricula_id=p_matricula_id and kind='RESET_C1'
   and (consent_actor_id is distinct from auth.uid() or not internal_financial_correction.live_consent(receivable_id)))
 then case when emitted>0 then 'PARTIAL' else 'READY' end else 'WAITING_CONSENT' end;
 select case when internal_financial_correction.local_waiver_complete(r) then 'WAIVED'
 when r.status='PAGO' then 'PRESERVED_PAID' else 'PENDING' end into local_disposition
 from internal_academic.technical_manual_cycle_runs run join public.contas_receber r on r.id=any(run.receivable_ids)
 where run.matricula_id=p_matricula_id and run.cycle_number=1 and r.tipo_lancamento='MATRICULA' and r.parcela_numero=0;
 fingerprint_value:=internal_financial_correction.corrected_fingerprint(o.id,p_matricula_id);
 return jsonb_build_object('operationId',o.id,'matriculaId',p_matricula_id,'status',status_value,
 'fingerprint',fingerprint_value,'firstDueDate','2026-10-15','installmentCount',12,'activeTotal','3358.80',
 'historicalCycle2Count',(select count(*) from internal_financial_correction.items where operation_id=o.id and matricula_id=p_matricula_id and kind='CANCEL_C2'),
 'localFeeDisposition',coalesce(local_disposition,'PENDING'));
end $$;

create function internal_financial_correction.active_cycle_context(p_operation_id uuid,p_matricula_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare run internal_academic.technical_manual_cycle_runs%rowtype; r public.contas_receber%rowtype;
 items jsonb:='[]'::jsonb; emitted integer:=0; review_count integer:=0; state_value text; complete boolean; paid boolean;
 summary jsonb;
begin
 select * into strict run from internal_academic.technical_manual_cycle_runs where matricula_id=p_matricula_id and cycle_number=1;
 for r in select source_r.* from public.contas_receber source_r join internal_financial_correction.items i on i.receivable_id=source_r.id
 where i.operation_id=p_operation_id and i.matricula_id=p_matricula_id and i.kind='RESET_C1' order by source_r.parcela_numero loop
  complete:=internal_academic.technical_manual_banese_receivable_complete(r);
  paid:=internal_academic.technical_manual_banese_receivable_paid_issued(r);
  if complete or paid then state_value:='EMITIDO'; emitted:=emitted+1;
  elsif r.gateway_submission_status='API_REVIEW' then state_value:='REVISAO_MANUAL';review_count:=review_count+1;
  elsif r.gateway_submission_status is not null or r.gateway_creation_token is not null or r.gateway_payment_id is not null
   or exists(select 1 from public.payment_gateway_transactions where receivable_id=r.id)
  then state_value:='REVISAO'; review_count:=review_count+1;
  else state_value:='PENDENTE'; end if;
  items:=items||jsonb_build_array(jsonb_build_object('id',r.id,'chave',r.origem_cronograma_id,'tipo','PARCELA',
   'numero',r.parcela_numero,'descricao',r.descricao,'valor',to_char(r.valor,'FM999999990.00'),
   'vencimento',to_char(r.data_vencimento,'YYYY-MM-DD'),'status',r.status,'emissaoBanese',state_value,
   'emissaoHistoricaComprovada',paid,'destinoCobranca','BANESE','localSemBoletoComprovado',false));
 end loop;
 if jsonb_array_length(items)<>12 then raise exception 'BOUNDED_C1_CARDINALITY'; end if;
 summary:=internal_financial_correction.state_summary(p_matricula_id);
 return jsonb_build_object('requestId',run.request_id,'replayed',true,'matriculaId',run.matricula_id,
  'turmaId',run.turma_id,'poloId',(select polo_id from public.turmas where id=run.turma_id),'primeiroVencimento','2026-10-15',
  'ciclo',jsonb_build_object('numero',1,'status',case when emitted=12 then 'EMITIDO_BANESE' when review_count>0 then 'EMISSAO_EM_REVISAO'
   when emitted>0 then 'EMISSAO_PARCIAL' else 'PRONTO_PARA_EMISSAO_BANESE' end,'quantidadeItens',12,'quantidadeBancaria',12,
   'quantidadeLocal',0,'total','3358.80','emitidosBanese',emitted,'pendentesEmissao',greatest(12-emitted-review_count,0),
   'emRevisao',review_count,'recebiveis',items),
  'cicloManual',internal_academic.technical_manual_cycle_state(p_matricula_id));
end $$;

create function public.preview_bounded_financial_correction_secure(p_operation_id uuid,p_matricula_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o internal_financial_correction.operations%rowtype; result jsonb; consented boolean; batch uuid; items jsonb; keys jsonb;
begin
 if auth.uid() is null or not public.gestor_has_financeiro_tab('receber') then raise exception 'BOUNDED_AUTH_REQUIRED' using errcode='42501'; end if;
 select * into o from internal_financial_correction.operations where id=p_operation_id;
 if not found or not public.is_gestor_for_polo(o.polo_id) or not exists(select 1 from public.matriculas m
  join public.turmas t on t.id=m.turma_id where m.id=p_matricula_id and t.id=o.turma_id and t.polo_id=o.polo_id
  and m.status in ('ATIVO','PENDENTE')) then raise exception 'BOUNDED_AUTH_SCOPE' using errcode='42501'; end if;
 result:=internal_financial_correction.state_summary(p_matricula_id);
 if internal_academic.is_technical_manual_cycle_protected(p_matricula_id) then raise exception 'BOUNDED_PROTECTED_ENROLLMENT' using errcode='42501'; end if;
 if result is null or result->>'operationId' is distinct from o.id::text then raise exception 'BOUNDED_TARGET_SCOPE'; end if;
 perform internal_financial_correction.assert_operation(o.id);
 if o.state='FINALIZED' then perform internal_financial_correction.assert_finalized_operation(o.id); end if;
 select jsonb_agg(jsonb_build_object('id',i.receivable_id,'key',i.receivable_snapshot->>'origem_cronograma_id',
 'value',to_char((i.receivable_snapshot->>'valor')::numeric,'FM999999990.00'),
 'dueDate',to_char(i.corrected_due_date,'YYYY-MM-DD'),'financialTerms',i.corrected_terms)
 order by (i.receivable_snapshot->>'parcela_numero')::integer),
 bool_and(i.consent_actor_id=auth.uid() and i.consent_at is not null and internal_financial_correction.live_consent(i.receivable_id)),
 min(i.consent_batch_id::text)::uuid,jsonb_object_agg(i.receivable_id::text,i.consent_request_id)
 into items,consented,batch,keys from internal_financial_correction.items i
 where i.operation_id=o.id and i.matricula_id=p_matricula_id and i.kind='RESET_C1';
 consented:=coalesce(consented,false);
 return result||jsonb_build_object('installments',items,'consent',jsonb_build_object('consented',consented,
  'requestId',case when consented then batch end),'authorizationRequestIds',case when consented then keys else '{}'::jsonb end,
  'cycleContext',case when consented then internal_financial_correction.active_cycle_context(o.id,p_matricula_id) else null end);
end $$;
revoke all on function public.preview_bounded_financial_correction_secure(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on all functions in schema internal_financial_correction from public,anon,authenticated,service_role;
commit;
