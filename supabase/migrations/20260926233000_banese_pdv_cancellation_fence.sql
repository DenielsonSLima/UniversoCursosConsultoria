-- Only explicitly authorized, non-academic PDV titles may enter this queue.
create table public.banese_pdv_cancellation_jobs (
  receivable_id uuid primary key references public.contas_receber(id),
  authorized_reason text not null check (length(authorized_reason) between 10 and 500),
  state text not null default 'AUTHORIZED' check (state in ('AUTHORIZED','FENCED','CANCELED','RECOVERED')),
  lease_token uuid, lease_until timestamptz, snapshot jsonb,
  mutation_started_at timestamptz, confirmed_at timestamptz,
  evidence_sha256 text, replacement_receivable_id uuid references public.contas_receber(id),
  created_at timestamptz not null default now()
);
alter table public.banese_pdv_cancellation_jobs enable row level security;
revoke all on public.banese_pdv_cancellation_jobs from public, anon, authenticated;
grant select, insert, update on public.banese_pdv_cancellation_jobs to service_role;

create function public.guard_banese_pdv_cancellation() returns trigger
language plpgsql security definer set search_path='' as $$
declare rid uuid; j public.banese_pdv_cancellation_jobs;
begin
  rid := case when tg_table_name='contas_receber' then old.id else old.receivable_id end;
  select * into j from public.banese_pdv_cancellation_jobs where receivable_id=rid;
  if j.state='FENCED' and current_setting('app.pdv_cancel_lease',true) is distinct from j.lease_token::text then
    raise exception using errcode='P0001', message='Titulo PDV em substituicao autorizada.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger guard_pdv_cancellation_receivable before update or delete on public.contas_receber
for each row execute function public.guard_banese_pdv_cancellation();
create trigger guard_pdv_cancellation_transaction before update or delete on public.payment_gateway_transactions
for each row execute function public.guard_banese_pdv_cancellation();

create function public.claim_banese_pdv_cancellation(p_receivable_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.banese_pdv_cancellation_jobs; r public.contas_receber; n integer; token uuid;
begin
  select * into j from public.banese_pdv_cancellation_jobs where receivable_id=p_receivable_id for update;
  if not found then raise exception 'Cancelamento nao autorizado.'; end if;
  if j.state in ('CANCELED','RECOVERED') then return jsonb_build_object('state',j.state); end if;
  if j.lease_until>now() then raise exception 'Cancelamento ja em execucao.'; end if;
  select * into r from public.contas_receber where id=p_receivable_id for update;
  if r.categoria is distinct from 'OUTROS_CREDITOS' or r.matricula_id is not null or r.turma_id is not null
     or r.gateway_provider is distinct from 'banese_card' or r.gateway_environment is distinct from 'production'
     or r.gateway_payment_method is distinct from 'BOLETO' or r.gateway_submission_status is distinct from 'API_REGISTERED'
     or r.status not in ('PENDENTE','VENCIDO') or r.data_pagamento is not null or coalesce(r.valor_pago,0)<>0
     or r.gateway_status is distinct from 'PENDING' or r.gateway_financial_terms_confirmed_at is null
     or nullif(r.gateway_pix_payload,'') is not null or nullif(r.gateway_pix_encoded_image,'') is not null then
    raise exception 'Titulo PDV nao elegivel para substituicao.';
  end if;
  select count(*) into n from public.payment_gateway_transactions where receivable_id=r.id;
  if n<>1 then raise exception 'Transacao PDV nao e unica.'; end if;
  if exists(select 1 from public.banese_reconciliation_queue where receivable_id=r.id and state='LEASED' and lease_until>now()) then
    raise exception 'Aguarde conciliacao em andamento.';
  end if;
  token:=gen_random_uuid();
  update public.banese_pdv_cancellation_jobs set state='FENCED',lease_token=token,lease_until=now()+interval '2 minutes',snapshot=coalesce(snapshot,to_jsonb(r)) where receivable_id=r.id;
  update public.banese_reconciliation_queue set state='REPLACEMENT_FENCED',next_check_at=null,lease_run_id=null,lease_until=null,updated_at=now() where receivable_id=r.id;
  return jsonb_build_object('state','FENCED','leaseToken',token,'receivable',to_jsonb(r));
end $$;

create function public.mark_banese_pdv_cancel_intent(p_receivable_id uuid,p_lease_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update public.banese_pdv_cancellation_jobs set mutation_started_at=coalesce(mutation_started_at,now())
  where receivable_id=p_receivable_id and state='FENCED' and lease_token=p_lease_token and lease_until>now();
  if not found then raise exception 'Lease de cancelamento expirado.'; end if;
  return true;
end $$;

create function public.finish_banese_pdv_cancellation(
  p_receivable_id uuid,p_lease_token uuid,p_remote_status text,p_evidence_sha256 text,
  p_pix_payload text default null,p_pix_image text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.banese_pdv_cancellation_jobs; r public.contas_receber; recovered jsonb;
begin
  select * into j from public.banese_pdv_cancellation_jobs where receivable_id=p_receivable_id for update;
  if j.state is distinct from 'FENCED' or j.lease_token is distinct from p_lease_token or j.lease_until<=now() then raise exception 'Lease invalido.'; end if;
  select * into r from public.contas_receber where id=p_receivable_id for update;
  if to_jsonb(r) is distinct from j.snapshot then raise exception 'Snapshot financeiro mudou.'; end if;
  if p_evidence_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'Evidencia invalida.'; end if;
  perform set_config('app.pdv_cancel_lease',p_lease_token::text,true);
  if p_remote_status='PENDING' and nullif(p_pix_payload,'') is not null and nullif(p_pix_image,'') is not null and j.mutation_started_at is null then
    recovered:=public.persist_banese_recovered_pix_v2(
      p_receivable_id:=r.id,p_environment:=r.gateway_environment,p_nosso_numero:=r.gateway_boleto_nosso_numero,
      p_pix_payload:=p_pix_payload,p_pix_encoded_image:=p_pix_image,
      p_remote_digitable_line:=r.gateway_boleto_linha_digitavel,p_remote_barcode:=r.gateway_boleto_codigo_barras,
      p_expected_amount:=r.valor,p_expected_due_date:=r.data_vencimento,p_expected_convenio:=r.gateway_boleto_convenio,
      p_replace_invalid_digitable_line:=false,p_reconciliation:=jsonb_build_object('source','BANESE_PDV_BEFORE_CANCEL','evidenceSha256',p_evidence_sha256),
      p_expected_updated_at:=r.updated_at,p_expected_status:=r.status,p_expected_gateway_status:=r.gateway_status,
      p_expected_gateway_last_error:=r.gateway_last_error,p_expected_financial_terms:=r.gateway_financial_terms,
      p_expected_financial_terms_confirmed_at:=r.gateway_financial_terms_confirmed_at);
    if coalesce((recovered->>'persisted')::boolean,false) is not true then raise exception 'Pix nao persistido.'; end if;
    update public.banese_pdv_cancellation_jobs set state='RECOVERED',confirmed_at=now(),evidence_sha256=p_evidence_sha256,lease_until=null where receivable_id=r.id;
    update public.banese_reconciliation_queue set state='READY',next_check_at=now(),updated_at=now() where receivable_id=r.id;
    return jsonb_build_object('state','RECOVERED');
  end if;
  if p_remote_status is distinct from 'CANCELED' or p_pix_payload is not null or p_pix_image is not null then raise exception 'Baixa nao comprovada.'; end if;
  update public.contas_receber set status='CANCELADO',gateway_status='CANCELED',gateway_last_error=null,gateway_synced_at=now(),updated_at=now() where id=r.id;
  update public.payment_gateway_transactions set remote_status='CANCELED',last_error=null,synced_at=now(),updated_at=now() where receivable_id=r.id;
  update public.banese_pdv_cancellation_jobs set state='CANCELED',confirmed_at=now(),evidence_sha256=p_evidence_sha256,lease_until=null where receivable_id=r.id;
  update public.banese_reconciliation_queue set state='DONE',next_check_at=null,updated_at=now() where receivable_id=r.id;
  return jsonb_build_object('state','CANCELED');
end $$;
revoke all on function public.guard_banese_pdv_cancellation() from public,anon,authenticated;
revoke all on function public.claim_banese_pdv_cancellation(uuid) from public,anon,authenticated;
revoke all on function public.mark_banese_pdv_cancel_intent(uuid,uuid) from public,anon,authenticated;
revoke all on function public.finish_banese_pdv_cancellation(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_banese_pdv_cancellation(uuid) to service_role;
grant execute on function public.mark_banese_pdv_cancel_intent(uuid,uuid) to service_role;
grant execute on function public.finish_banese_pdv_cancellation(uuid,uuid,text,text,text,text) to service_role;
