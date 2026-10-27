begin;
set local lock_timeout='5s';
create table internal_academic.technical_rejected_fee_corrections (
 id uuid primary key, receivable_id uuid not null unique references public.contas_receber(id),
 matricula_id uuid not null, cycle_number integer not null check(cycle_number=2),
 cycle_request_id uuid not null, corrected_due_date date not null,
 source_receivable jsonb not null, source_authorization jsonb not null, source_run jsonb not null,
 siblings_hash text not null check(siblings_hash ~ '^[a-f0-9]{64}$'),
 source_fingerprint text not null check(source_fingerprint ~ '^[a-f0-9]{64}$'),
 corrected_terms jsonb not null, manifest_hash text not null check(manifest_hash ~ '^[a-f0-9]{64}$'),
 approval_reference text not null check(length(approval_reference)>=8),
 approved_at timestamptz not null default clock_timestamp(),
 approved_database_role text not null, new_request_id uuid not null unique,
 state text not null default 'APPROVED' check(state in ('APPROVED','ABSENCE_CONFIRMED','PREPARING','PREPARED','CONSENTED')),
 lease_token uuid, lease_until timestamptz, last_dispatch_at timestamptz,
 absence_evidence jsonb, absence_hash text, absence_confirmed_at timestamptz,
 preparation_xid bigint, prepared_at timestamptz,
 consent_actor_id uuid references auth.users(id), consent_at timestamptz,
 check(new_request_id::text <> source_authorization->>'request_id')
);
alter table internal_academic.technical_rejected_fee_corrections enable row level security;
revoke all on internal_academic.technical_rejected_fee_corrections from public,anon,authenticated,service_role;

create function internal_academic.rejected_fee_sha256(p_value text)
returns text language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(p_value,'UTF8'),'sha256'),'hex');
$$;

create function internal_academic.rejected_fee_correction_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'REJECTED_FEE_HISTORY_IMMUTABLE' using errcode='55000'; end if;
 if current_setting('app.rejected_fee_correction_id',true) is distinct from new.id::text then
  raise exception 'REJECTED_FEE_CANONICAL_OPERATION_REQUIRED' using errcode='42501';
 end if;
 if tg_op='UPDATE' and (to_jsonb(new)-array['state','lease_token','lease_until','last_dispatch_at',
   'absence_evidence','absence_hash','absence_confirmed_at','preparation_xid','prepared_at','consent_actor_id','consent_at'])
  is distinct from (to_jsonb(old)-array['state','lease_token','lease_until','last_dispatch_at',
   'absence_evidence','absence_hash','absence_confirmed_at','preparation_xid','prepared_at','consent_actor_id','consent_at']) then
  raise exception 'REJECTED_FEE_APPROVAL_IMMUTABLE' using errcode='55000';
 end if;
 if tg_op='UPDATE' and not (new.state=old.state or (old.state='APPROVED' and new.state='ABSENCE_CONFIRMED')
  or (old.state='ABSENCE_CONFIRMED' and new.state='PREPARING')
  or (old.state='PREPARING' and new.state='PREPARED') or (old.state='PREPARED' and new.state='CONSENTED')) then
  raise exception 'REJECTED_FEE_STATE_TRANSITION_INVALID' using errcode='55000'; end if;
 if tg_op='UPDATE' and old.state in ('PREPARED','CONSENTED') and
  (new.absence_evidence is distinct from old.absence_evidence or new.absence_hash is distinct from old.absence_hash
   or new.prepared_at is distinct from old.prepared_at or new.absence_confirmed_at is distinct from old.absence_confirmed_at
   or (old.consent_at is not null and (new.consent_at is distinct from old.consent_at
     or new.consent_actor_id is distinct from old.consent_actor_id))) then
  raise exception 'REJECTED_FEE_EVIDENCE_IMMUTABLE' using errcode='55000';
 end if;
 return new;
end $$;
create trigger guard_rejected_fee_correction before insert or update or delete
on internal_academic.technical_rejected_fee_corrections for each row
execute function internal_academic.rejected_fee_correction_guard();

create function internal_academic.rejected_fee_exact_rejection(p_error text)
returns boolean language plpgsql immutable set search_path='' as $$
declare v jsonb; v_json text;
begin
 if p_error not like 'CICLO_MANUAL_BANESE_REVISAO_%: Banese Card recusou criacao do boleto (400): %' then return false; end if;
 v_json:=split_part(p_error,'Banese Card recusou criacao do boleto (400): ',2);
 v:=v_json::jsonb;
 return coalesce(jsonb_typeof(v->'Erros')='array' and jsonb_array_length(v->'Erros')=1
  and v#>>'{Erros,0,CodigoErroProcessamento}'='82'
  and v#>>'{Erros,0,Descricao}'='ERRO_DATA_VENCIMENTO_MENOR_DATA_EMISSAO_DOCUMENTO',false);
exception when data_exception then return false;
end $$;

create function internal_academic.rejected_fee_siblings_hash(p_run internal_academic.technical_manual_cycle_runs,p_fee uuid)
returns text language sql stable security definer set search_path='' as $$
 select internal_academic.rejected_fee_sha256(coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb)::text)
 from public.contas_receber r where r.id=any(p_run.receivable_ids) and r.id<>p_fee;
$$;

create function internal_academic.rejected_fee_source_safe(r public.contas_receber)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare run internal_academic.technical_manual_cycle_runs%rowtype;
 a internal_academic.technical_manual_receivable_issuance_authorizations%rowtype;
begin
 if r.tipo_lancamento is distinct from 'REMATRICULA' or r.parcela_numero is distinct from 0
 or r.origem_cronograma_id is distinct from 'ciclo-1-rematricula'
 or r.status is distinct from 'PENDENTE' or r.valor is distinct from 100::numeric
 or r.gateway_provider is distinct from 'banese_card' or r.gateway_environment is distinct from 'production'
 or r.gateway_payment_method is distinct from 'BOLETO' or r.forma_pagamento is distinct from 'BOLETO'
 or r.gateway_submission_channel is distinct from 'API' or r.gateway_submission_status is distinct from 'API_REVIEW'
 or r.gateway_status is distinct from 'CREATING' or r.gateway_creation_token is null
 or r.gateway_boleto_nosso_numero !~ '^[0-9]{9}$' or r.gateway_boleto_nosso_numero is null
 or r.gateway_boleto_convenio !~ '^[0-9]{1,20}$' or r.gateway_boleto_convenio is null
 or r.gateway_payment_id is not null or r.gateway_payment_link_id is not null
 or r.gateway_boleto_linha_digitavel is not null or r.gateway_boleto_codigo_barras is not null
 or r.gateway_pix_payload is not null or r.gateway_pix_encoded_image is not null
 or r.gateway_boleto_issued_at is not null or r.gateway_financial_terms_confirmed_at is not null
 or r.gateway_invoice_url is not null or r.gateway_bank_slip_url is not null
 or r.gateway_cnab_file_id is not null or r.asaas_payment_id is not null or r.asaas_payment_link_id is not null
 or r.renegotiation_agreement_id is not null
 or internal_financial_correction.has_payment_evidence(r)
 or not internal_academic.rejected_fee_exact_rejection(r.gateway_last_error)
 or exists(select 1 from public.payment_gateway_transactions t where t.receivable_id=r.id)
 or exists(select 1 from internal_proesc.obligation_links l where l.receivable_id=r.id)
 or exists(select 1 from internal_financial_correction.items i where i.receivable_id=r.id)
 or exists(select 1 from internal_academic.technical_manual_banese_due_date_overlay o where o.receivable_id=r.id)
 or exists(select 1 from internal_academic.technical_manual_banese_reissue_jobs j where j.receivable_id=r.id)
 or exists(select 1 from public.banese_cancellation_outbox b where b.receivable_id=r.id)
 or exists(select 1 from public.receivable_renegotiation_source_items s where s.receivable_id=r.id and s.released_at is null)
 or exists(select 1 from public.banese_reconciliation_queue q where q.receivable_id=r.id
   and (q.state='LEASED' or q.lease_run_id is not null or q.lease_until is not null)) then return false; end if;
 select * into run from internal_academic.technical_manual_cycle_runs x
 where x.matricula_id=r.matricula_id and x.turma_id=r.turma_id and x.cycle_number=2
  and x.state='LOCAL_CREATED' and r.id=any(x.receivable_ids);
 if not found or run.item_count<>13 or cardinality(run.receivable_ids)<>13
  or internal_academic.manual_cycle_manager_receivable_valid(r.id,r.matricula_id) is not true
  or internal_academic.manual_cycle_manager_first_post_allowed(r.id,r.matricula_id) is not true
  or (select count(*) from public.contas_receber c where c.id=any(run.receivable_ids) and c.id<>r.id
    and c.tipo_lancamento='PARCELA' and (internal_academic.technical_manual_banese_receivable_complete(c)
      or internal_academic.technical_manual_banese_receivable_paid_issued(c)))<>12 then return false; end if;
 select * into a from internal_academic.technical_manual_receivable_issuance_authorizations x where x.receivable_id=r.id;
 if not found or a.first_claimed_at is null or coalesce(a.claim_count,0)<1
  or a.request_id is distinct from r.gateway_creation_token
  or a.matricula_id is distinct from r.matricula_id or a.turma_id is distinct from r.turma_id
  or a.cycle_number<>2 or a.receivable_fingerprint is distinct from
    internal_academic.technical_manual_receivable_issuance_fingerprint(r) then return false; end if;
 if exists(select 1 from public.contas_receber c where c.id<>r.id and (
   (c.gateway_environment=r.gateway_environment and c.gateway_boleto_convenio=r.gateway_boleto_convenio
    and c.gateway_boleto_nosso_numero=r.gateway_boleto_nosso_numero)
   or (c.matricula_id=r.matricula_id and c.status<>'CANCELADO' and
    (c.origem_cronograma_id=r.origem_cronograma_id or c.tipo_lancamento='REMATRICULA'))))
 or exists(select 1 from public.payment_gateway_transactions t where t.environment=r.gateway_environment
   and (t.remote_payment_id=r.gateway_boleto_nosso_numero or t.bank_slip_our_number=r.gateway_boleto_nosso_numero)) then return false; end if;
 perform internal_academic.assert_manual_cycle_reviewed_receivable(r);
 return coalesce(r.gateway_financial_terms=internal_academic.technical_manual_banese_expected_terms(r),false);
end $$;

create function internal_academic.rejected_fee_corrected_valid(r public.contas_receber)
returns boolean language plpgsql stable security definer set search_path='' as $$
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
end $$;

create function internal_academic.rejected_fee_original_due(r public.contas_receber)
returns date language plpgsql stable security definer set search_path='' as $$
begin
 if internal_academic.rejected_fee_corrected_valid(r) then
  return (select (source_receivable->>'data_vencimento')::date
   from internal_academic.technical_rejected_fee_corrections where receivable_id=r.id);
 end if;
 return r.data_vencimento;
end $$;
revoke all on function internal_academic.rejected_fee_sha256(text),internal_academic.rejected_fee_correction_guard(),
 internal_academic.rejected_fee_exact_rejection(text),
 internal_academic.rejected_fee_siblings_hash(internal_academic.technical_manual_cycle_runs,uuid),
 internal_academic.rejected_fee_source_safe(public.contas_receber),
 internal_academic.rejected_fee_corrected_valid(public.contas_receber),
 internal_academic.rejected_fee_original_due(public.contas_receber)
 from public,anon,authenticated,service_role;
commit;
