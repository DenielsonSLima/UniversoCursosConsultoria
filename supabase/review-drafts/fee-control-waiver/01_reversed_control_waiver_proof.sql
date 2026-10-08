-- PRIVATE REVIEW CANDIDATE. No permission grants or financial mutations.
begin;
create function internal_financial_correction.reversed_control_waiver_complete(r public.contas_receber)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare e public.receivable_manual_settlement_events%rowtype;
 s public.receivable_manual_settlements%rowtype; old_r public.contas_receber%rowtype;
 expected jsonb; changed text[]:=array['status','conta_bancaria_id','valor_pago','data_pagamento',
 'forma_pagamento','origem_pagamento','manual_settlement_reversed_at','updated_at'];
begin
 if r.status is distinct from 'CANCELADO' or r.tipo_lancamento is distinct from 'MATRICULA'
  or r.parcela_numero is distinct from 0 or r.valor is distinct from 200::numeric
  or r.manual_settlement_id is null or r.manual_settlement_reversed_at is null
  or r.origem_pagamento is distinct from 'LOCAL' or r.valor_pago is not null
  or r.data_pagamento is not null or r.conta_bancaria_id is not null or r.forma_pagamento is not null
  or not internal_academic.manual_cycle_has_local_intent(r)
  or internal_academic.manual_cycle_has_bank_fields(r)
  or exists(select 1 from public.payment_gateway_transactions t where t.receivable_id=r.id)
  or exists(select 1 from internal_proesc.obligation_links l where l.receivable_id=r.id)
 then return false; end if;
 select * into s from public.receivable_manual_settlements where id=r.manual_settlement_id;
 if not found or s.receivable_id is distinct from r.id or s.state is distinct from 'REVERSED'
  or s.reversed_at is distinct from r.manual_settlement_reversed_at
  or s.completed_at is null or s.reversed_at<s.completed_at
  or s.requires_remote_cancellation is distinct from false
  or s.provider_code is not null or s.remote_payment_id is not null or s.remote_payment_link_id is not null
  or (select count(*) from public.receivable_manual_settlements where receivable_id=r.id)<>1
 then return false; end if;
 select * into e from public.receivable_manual_settlement_events
 where settlement_id=s.id and event_type='LOCAL_SETTLEMENT_REVERSED'
 and details->>'operation'='REVERSED_CONTROL_AND_WAIVED';
 if not found or (select count(*) from public.receivable_manual_settlement_events
  where settlement_id=s.id and details->>'operation'='REVERSED_CONTROL_AND_WAIVED')<>1
  or e.details->>'executionActorKind' is distinct from 'SERVICE_MAINTENANCE'
  or e.details->>'actorRole' is distinct from 'APPROVER'
  or e.details->>'databaseSessionUser' is distinct from 'postgres'
  or e.details->'ownerConfirmedNoCash' is distinct from 'true'::jsonb
  or e.details->'moneyMoved' is distinct from 'false'::jsonb
  or e.details->>'receivableId' is distinct from r.id::text
  or (e.details->>'reversedAt')::timestamptz is distinct from s.reversed_at
  or length(coalesce(e.details->>'approvalReference',''))<8
  or coalesce(e.details->>'approvalHash','')!~'^[a-f0-9]{64}$'
  or length(coalesce(e.details->>'securityApprovalReference',''))<8
  or coalesce(e.details->>'securityApprovalHash','')!~'^[a-f0-9]{64}$'
 then return false; end if;
 old_r:=jsonb_populate_record(null::public.contas_receber,e.details->'receiptBefore');
 if old_r.id is distinct from r.id or old_r.status is distinct from 'PAGO'
  or old_r.valor is distinct from 200::numeric or old_r.valor_pago is distinct from 200::numeric
  or old_r.manual_settlement_id is distinct from s.id or old_r.manual_settlement_reversed_at is not null
  or (to_jsonb(r)-changed) is distinct from (to_jsonb(old_r)-changed)
  or (to_jsonb(s)-array['state','reversed_at','updated_at']) is distinct from
     ((e.details->'settlementBefore')-array['state','reversed_at','updated_at'])
  or e.details#>>'{settlementBefore,state}' is distinct from 'COMPLETED'
  or e.details#>>'{settlementBefore,id}' is distinct from s.id::text
  or e.details#>>'{settlementBefore,receivable_id}' is distinct from r.id::text
  or s.principal_cents is distinct from 20000::bigint or s.received_cents is distinct from 20000::bigint
  or s.principal_cents is distinct from r.manual_settlement_principal_cents
  or s.received_cents is distinct from r.manual_settlement_received_cents
  or s.interest_cents is distinct from r.manual_settlement_interest_cents
  or s.penalty_cents is distinct from r.manual_settlement_penalty_cents
  or s.addition_cents is distinct from r.manual_settlement_addition_cents
  or s.discount_cents is distinct from r.manual_settlement_discount_cents
 then return false; end if;
 return exists(select 1 from internal_financial_correction.operations o
  join public.usuarios_sistema u on u.auth_user_id=o.actor_id and u.id=e.actor_id
  join internal_academic.technical_manual_cycle_runs run
   on run.matricula_id=r.matricula_id and run.cycle_number=1
  where o.id=(e.details->>'parentOperationId')::uuid and o.state='FINALIZED'
   and o.actor_id::text=e.details->>'approverAuthId'
   and o.plan_fingerprint=e.details->>'parentPlanFingerprint'
   and o.turma_id=r.turma_id and o.polo_id=r.polo_id
   and to_jsonb(run)=e.details->'runBefore' and r.id=any(run.receivable_ids)
   and (select count(*) from internal_financial_correction.items i where i.operation_id=o.id
    and i.matricula_id=r.matricula_id and i.kind='RESET_C1' and i.state='FINALIZED')=12
   and not exists(select 1 from internal_financial_correction.items i where i.receivable_id=r.id));
exception when others then return false;
end $$;
revoke all on function internal_financial_correction.reversed_control_waiver_complete(public.contas_receber)
 from public,anon,authenticated,service_role;

-- Keep the original never-paid proof unchanged; accept the distinct reversed proof.
do $$
declare original text; original_acl aclitem[]; function_oid oid;
begin
 function_oid:='internal_financial_correction.local_waiver_complete(public.contas_receber)'::regprocedure;
 select pg_get_functiondef(function_oid),proacl into original,original_acl from pg_proc where oid=function_oid;
 if md5(original)<>'438c19acadf532c0583672da7e9d3080' then
  raise exception 'CONTROL_WAIVER_BASELINE_DRIFT'; end if;
 if position('reversed_control_waiver_complete' in original)>0 then
  raise exception 'CONTROL_WAIVER_ALREADY_INSTALLED'; end if;
 if position(' select exists(' in original)=0 then raise exception 'CONTROL_WAIVER_BASELINE_DRIFT'; end if;
 execute replace(original,' select exists(',
 ' select internal_financial_correction.reversed_control_waiver_complete(r) or exists(');
 if (select proacl from pg_proc where oid=function_oid) is distinct from original_acl then
  raise exception 'CONTROL_WAIVER_ACL_CHANGED'; end if;
end $$;
commit;
