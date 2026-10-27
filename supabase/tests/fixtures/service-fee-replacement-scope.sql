CREATE OR REPLACE FUNCTION internal_academic.assert_rejected_fee_service_scope(p_operation_id uuid, p_manifest_hash text)
 RETURNS internal_academic.rejected_fee_service_capabilities
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c internal_academic.rejected_fee_service_capabilities; o internal_academic.technical_rejected_fee_corrections;
 r public.contas_receber; run internal_academic.technical_manual_cycle_runs; a jsonb;
begin
 select * into strict c from internal_academic.rejected_fee_service_capabilities where operation_id=p_operation_id for update;
 select * into strict o from internal_academic.technical_rejected_fee_corrections where id=p_operation_id for update;
 perform pg_advisory_xact_lock(hashtextextended('technical-manual-banese:'||c.receivable_id::text,0));
 select * into strict run from internal_academic.technical_manual_cycle_runs where matricula_id=o.matricula_id and cycle_number=2 for update;
 perform 1 from public.contas_receber where id=any(run.receivable_ids) order by id for update;
 select * into strict r from public.contas_receber where id=c.receivable_id;
 select to_jsonb(x) into strict a from internal_academic.technical_manual_receivable_issuance_authorizations x where receivable_id=c.receivable_id;
 if c.manifest_hash is distinct from p_manifest_hash or o.manifest_hash is distinct from p_manifest_hash
  or c.receivable_id is distinct from o.receivable_id or c.request_id is distinct from o.new_request_id
  or c.actor_kind<>'SYSTEM' or o.state<>'CONSENTED' or o.consent_actor_id is not null
  or to_jsonb(run) is distinct from c.source_run or a is distinct from c.source_authorization
  or internal_academic.rejected_fee_siblings_hash(run,r.id) is distinct from c.siblings_hash
  or r.valor is distinct from 100::numeric or r.data_vencimento is distinct from date '2026-10-30'
  or not internal_academic.rejected_fee_corrected_valid(r)
  or internal_financial_correction.has_payment_evidence(r)
  or (internal_academic.is_technical_manual_cycle_protected(r.matricula_id)
   and not internal_academic.manual_cycle_manager_receivable_valid(r.id,r.matricula_id))
  or not internal_academic.manual_cycle_manager_first_post_allowed(r.id,r.matricula_id)
  or not exists(select 1 from public.matriculas m where m.id=r.matricula_id and m.turma_id=r.turma_id
    and upper(coalesce(m.status,'')) in ('PENDENTE','ATIVO'))
  or (c.first_claimed_at is not null and c.fingerprint is distinct from internal_academic.technical_manual_receivable_issuance_fingerprint(r))
  or exists(select 1 from public.contas_receber x where x.id<>r.id and x.gateway_environment='production'
    and x.gateway_boleto_convenio=r.gateway_boleto_convenio and x.gateway_boleto_nosso_numero=r.gateway_boleto_nosso_numero)
  or (c.completed_at is null and exists(select 1 from public.payment_gateway_transactions x where x.receivable_id=r.id))
  or run.item_count<>13 or cardinality(run.receivable_ids)<>13
  or (select count(*) from public.contas_receber x where x.id=any(run.receivable_ids) and x.id<>r.id
      and x.tipo_lancamento='PARCELA' and internal_academic.technical_manual_banese_receivable_complete(x))<>12 then
  raise exception 'REJECTED_FEE_SERVICE_SCOPE_CHANGED' using errcode='PT409'; end if;
 return c;
end $function$;

CREATE OR REPLACE FUNCTION internal_academic.rejected_fee_corrected_valid(r contas_receber)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o internal_academic.technical_rejected_fee_corrections%rowtype; old_r public.contas_receber;
begin
 select * into o from internal_academic.technical_rejected_fee_corrections where receivable_id=r.id;
 if not found or not (o.state in ('PREPARED','CONSENTED') or (o.state='PREPARING'
   and o.preparation_xid=txid_current() and current_setting('app.rejected_fee_correction_id',true)=o.id::text))
  or o.absence_evidence is null or o.absence_hash is distinct from internal_academic.rejected_fee_sha256(o.absence_evidence::text)
  or r.data_vencimento is distinct from o.corrected_due_date
  or r.gateway_financial_terms is distinct from o.corrected_terms
  or not exists(select 1 from internal_academic.technical_manual_cycle_runs run
   where run.matricula_id=o.matricula_id and run.cycle_number=2 and to_jsonb(run)=o.source_run
    and r.id=any(run.receivable_ids)) then return false; end if;
 old_r:=r; old_r.data_vencimento:=(o.source_receivable->>'data_vencimento')::date;
 return internal_academic.technical_manual_receivable_issuance_fingerprint(old_r)=o.source_fingerprint
  and r.regra_financeira_tecnica_snapshot=o.source_receivable->'regra_financeira_tecnica_snapshot'
  and exists(select 1 from public.matriculas m join public.turmas t on t.id=m.turma_id
   where m.id=r.matricula_id and m.turma_id=r.turma_id and m.aluno_id=r.cliente_id and t.polo_id=r.polo_id);
end $function$;

CREATE OR REPLACE FUNCTION internal_academic.rejected_fee_siblings_hash(p_run internal_academic.technical_manual_cycle_runs, p_fee uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select internal_academic.rejected_fee_sha256(coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb)::text)
 from public.contas_receber r where r.id=any(p_run.receivable_ids) and r.id<>p_fee;
$function$;

CREATE OR REPLACE FUNCTION internal_academic.technical_manual_receivable_issuance_fingerprint(p_receivable contas_receber)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        case
          when coalesce(
            (p_receivable.regra_financeira_tecnica_snapshot
              ->> 'versao')::integer,
            1
          ) >= 2
          then jsonb_build_object(
            'versao', 2,
            'receivableId', p_receivable.id,
            'matriculaId', p_receivable.matricula_id,
            'turmaId', p_receivable.turma_id,
            'poloId', p_receivable.polo_id,
            'clienteId', p_receivable.cliente_id,
            'tipo', p_receivable.tipo_lancamento,
            'parcelaNumero', p_receivable.parcela_numero,
            'origem', p_receivable.origem_cronograma_id,
            'descricao', p_receivable.descricao,
            'valor', pg_catalog.round(p_receivable.valor::numeric, 2),
            'vencimento', p_receivable.data_vencimento,
            'formaPagamento', p_receivable.forma_pagamento,
            'gatewayMetodo', p_receivable.gateway_payment_method,
            'snapshot', p_receivable.regra_financeira_tecnica_snapshot
          )
          else jsonb_build_object(
            'versao', 1,
            'receivableId', p_receivable.id,
            'matriculaId', p_receivable.matricula_id,
            'turmaId', p_receivable.turma_id,
            'poloId', p_receivable.polo_id,
            'clienteId', p_receivable.cliente_id,
            'tipo', p_receivable.tipo_lancamento,
            'parcelaNumero', p_receivable.parcela_numero,
            'origem', p_receivable.origem_cronograma_id,
            'descricao', p_receivable.descricao,
            'valor', pg_catalog.round(p_receivable.valor::numeric, 2),
            'vencimento', p_receivable.data_vencimento
          )
        end::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$function$;

