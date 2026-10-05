begin;

create or replace function internal_contas.ead_expiration_write_allowed(p_receivable_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.banese_ead_checkout_expiration_jobs j
    where j.receivable_id=p_receivable_id and j.state='PROCESSING' and j.lease_until>now()
      and j.id::text=current_setting('app.ead_expiration_job',true)
      and j.lease_token::text=current_setting('app.ead_expiration_lease',true));
$$;
revoke all on function internal_contas.ead_expiration_write_allowed(uuid)
  from public,anon,authenticated,service_role;

create or replace function public.guard_ead_checkout_expiration_receivable()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_job public.banese_ead_checkout_expiration_jobs%rowtype;
  v_field text;
begin
  select * into v_job from public.banese_ead_checkout_expiration_jobs where receivable_id=old.id;
  if not found then return new; end if;
  if internal_contas.ead_expiration_write_allowed(old.id) then return new; end if;
  if v_job.canceled_at is not null then
    if new is distinct from old then
      raise exception 'Título da compra EAD expirada deve preservar seu histórico.' using errcode='PT409';
    end if;
    return new;
  end if;
  if v_job.state not in ('PROCESSING','RETRY','REVIEW_REQUIRED') then return new; end if;
  foreach v_field in array array[
    'matricula_id','cliente_id','turma_id','polo_id','valor','data_vencimento',
    'gateway_provider','gateway_environment','gateway_payment_method','gateway_payment_id',
    'gateway_boleto_nosso_numero','gateway_boleto_convenio','gateway_boleto_agencia',
    'gateway_boleto_linha_digitavel','gateway_boleto_codigo_barras','gateway_financial_terms',
    'gateway_submission_channel','gateway_submission_status','gateway_cnab_file_id',
    'tipo_lancamento','origem_pagamento'
  ] loop
    if to_jsonb(new)->v_field is distinct from to_jsonb(old)->v_field then
      if v_field='origem_pagamento' and old.origem_pagamento in ('GATEWAY_EAD','GATEWAY_ONLINE')
        and new.origem_pagamento='BANESE' and new.status='PAGO'
        and new.gateway_status='PAID' and new.data_pagamento is not null
        and coalesce(new.valor_pago,0)>0 then continue; end if;
      raise exception 'Identidade da compra EAD está reservada para conciliação.' using errcode='PT409';
    end if;
  end loop;
  if new.status not in ('PENDENTE','VENCIDO','PAGO','AGUARDANDO_CONFIRMACAO','AGUARDANDO_PAGAMENTO')
    or old.status='PAGO' and new.status<>'PAGO' then
    raise exception 'Expiração EAD exige confirmação bancária antes de cancelar.' using errcode='PT409';
  end if;
  return new;
end;
$$;
create trigger a_guard_ead_checkout_expiration_receivable before update on public.contas_receber
  for each row execute function public.guard_ead_checkout_expiration_receivable();

create or replace function public.guard_ead_checkout_expiration_transaction()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_id uuid;
  v_job public.banese_ead_checkout_expiration_jobs%rowtype;
  v_field text;
begin
  if tg_op='INSERT' then v_id:=new.receivable_id;
  else v_id:=old.receivable_id; end if;
  if tg_op='UPDATE' and new.receivable_id is distinct from old.receivable_id
    and exists(select 1 from public.banese_ead_checkout_expiration_jobs target
      where target.receivable_id=new.receivable_id and (target.canceled_at is not null
        or target.state in ('PROCESSING','RETRY','REVIEW_REQUIRED'))) then
    raise exception 'Transação não pode ingressar em uma compra EAD reservada.' using errcode='PT409';
  end if;
  select * into v_job from public.banese_ead_checkout_expiration_jobs where receivable_id=v_id;
  if not found and tg_op='UPDATE' then
    v_id:=new.receivable_id;
    select * into v_job from public.banese_ead_checkout_expiration_jobs where receivable_id=v_id;
  end if;
  if not found then if tg_op='DELETE' then return old; else return new; end if; end if;
  if v_job.canceled_at is null and v_job.state='PAID' then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op='INSERT' or tg_op='DELETE' then
    raise exception 'Transação da compra EAD possui identidade canônica reservada.' using errcode='PT409';
  end if;
  if internal_contas.ead_expiration_write_allowed(v_id) then return new; end if;
  if v_job.canceled_at is not null then
    if new is distinct from old then
      raise exception 'Transação da compra EAD expirada é imutável.' using errcode='PT409';
    end if;
    return new;
  end if;
  if v_job.state not in ('PROCESSING','RETRY','REVIEW_REQUIRED') then return new; end if;
  foreach v_field in array array[
    'receivable_id','inscricao_online_id','provider_code','environment','payment_method',
    'origin_polo_id','issuer_polo_id','remote_payment_id','amount','installments',
    'bank_slip_our_number','bank_slip_digitable_line','bank_slip_barcode'
  ] loop
    if to_jsonb(new)->v_field is distinct from to_jsonb(old)->v_field then
      raise exception 'Transação EAD mudou durante a consulta bancária.' using errcode='PT409';
    end if;
  end loop;
  return new;
end;
$$;
create trigger a_guard_ead_checkout_expiration_transaction
  before insert or update or delete on public.payment_gateway_transactions
  for each row execute function public.guard_ead_checkout_expiration_transaction();

create or replace function public.guard_ead_checkout_expiration_inscription()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_job public.banese_ead_checkout_expiration_jobs%rowtype;
begin
  select * into v_job from public.banese_ead_checkout_expiration_jobs where inscription_id=old.id;
  if not found then if tg_op='DELETE' then return old; else return new; end if; end if;
  if tg_op='DELETE' then
    raise exception 'Inscrição EAD deve preservar histórico de pagamento.' using errcode='PT409';
  end if;
  if internal_contas.ead_expiration_write_allowed(old.receivable_id) then return new; end if;
  if v_job.canceled_at is not null and new is distinct from old then
    raise exception 'Inscrição EAD expirada deve preservar seu histórico.' using errcode='PT409';
  end if;
  if v_job.canceled_at is null and v_job.state='PAID' then return new; end if;
  if new.receivable_id is distinct from old.receivable_id
    or new.gateway_payment_id is distinct from old.gateway_payment_id
    or new.gateway_provider is distinct from old.gateway_provider
    or new.gateway_environment is distinct from old.gateway_environment
    or new.matricula_id is distinct from old.matricula_id or new.aluno_id is distinct from old.aluno_id
    or new.turma_id is distinct from old.turma_id or new.curso_id is distinct from old.curso_id
    or new.status='CANCELADO' and old.status<>'CANCELADO' then
    raise exception 'Inscrição EAD aguarda confirmação bancária.' using errcode='PT409';
  end if;
  return new;
end;
$$;
create trigger a_guard_ead_checkout_expiration_inscription before update or delete on public.inscricoes_online
  for each row execute function public.guard_ead_checkout_expiration_inscription();

create or replace function public.preserve_ead_checkout_expiration_queue_fence()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.banese_ead_checkout_expiration_jobs j
    where j.receivable_id=new.id and j.canceled_at is null and (
      j.state='PROCESSING' or j.remote_mutation_started_at is not null
      and j.state in ('RETRY','REVIEW_REQUIRED'))) then
    update public.banese_reconciliation_queue
    set state='EXPIRATION_FENCED',next_check_at=null,lease_run_id=null,lease_until=null,updated_at=now()
    where receivable_id=new.id;
  end if;
  return new;
end;
$$;
create trigger zz_preserve_ead_checkout_expiration_queue_fence
  after update of gateway_status,status,gateway_synced_at on public.contas_receber
  for each row execute function public.preserve_ead_checkout_expiration_queue_fence();

create or replace function internal_contas.ead_expiration_payment_is_confirmed(p_job_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.banese_ead_checkout_expiration_jobs j
    join public.contas_receber c on c.id=j.receivable_id
    join public.payment_gateway_transactions t on t.id=j.transaction_id
    join public.inscricoes_online i on i.id=j.inscription_id
    where j.id=p_job_id and c.status='PAGO' and c.gateway_status='PAID'
      and c.origem_pagamento='BANESE' and c.gateway_settlement_source='API'
      and c.data_pagamento is not null and c.valor_pago>0
      and coalesce((c.gateway_settlement_evidence->>'paymentCount')::integer,0)>0
      and upper(t.remote_status) in ('PAID','RECEIVED','CONFIRMED')
      and t.receivable_id=c.id and t.remote_payment_id=c.gateway_boleto_nosso_numero
      and i.receivable_id=c.id and i.matricula_id=c.matricula_id
      and i.gateway_payment_id=c.gateway_boleto_nosso_numero);
$$;
revoke all on function internal_contas.ead_expiration_payment_is_confirmed(uuid)
  from public,anon,authenticated,service_role;

create or replace function public.guard_ead_checkout_expiration_enrollment()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_job public.banese_ead_checkout_expiration_jobs%rowtype;
begin
  select * into v_job from public.banese_ead_checkout_expiration_jobs j
  where j.matricula_id=old.id and j.canceled_at is null and j.cancel_reason='EXPIRED_OPTIONAL'
    and j.state in ('PROCESSING','RETRY','REVIEW_REQUIRED') limit 1;
  if not found then return new; end if;
  if new.aluno_id is distinct from old.aluno_id or new.turma_id is distinct from old.turma_id then
    raise exception 'Vínculo acadêmico EAD está reservado para conciliação.' using errcode='PT409';
  end if;
  if new.status is not distinct from old.status then return new; end if;
  -- The existing post-settlement flow activates before projecting inscription.
  if old.status in ('PENDENTE','AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO')
    and new.status='ATIVO' and internal_contas.ead_expiration_payment_is_confirmed(v_job.id) then
    return new;
  end if;
  -- The existing inscription trigger closes only this never-active purchase.
  if internal_contas.ead_expiration_write_allowed(v_job.receivable_id)
    and old.status='PENDENTE' and new.status='CANCELADO'
    and exists(select 1 from public.contas_receber c where c.id=v_job.receivable_id
      and c.status='CANCELADO' and c.gateway_status in ('CANCELED','EXPIRED')) then return new; end if;
  raise exception 'Situação acadêmica EAD aguarda confirmação bancária.' using errcode='PT409';
end;
$$;
create trigger a_guard_ead_checkout_expiration_enrollment before update on public.matriculas
  for each row execute function public.guard_ead_checkout_expiration_enrollment();

create or replace function public.guard_ead_checkout_expiration_progress()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_aluno uuid:=case when tg_op='DELETE' then old.aluno_id else new.aluno_id end;
  v_course uuid:=case when tg_op='DELETE' then old.curso_id else new.curso_id end;
  v_old_aluno uuid:=case when tg_op<>'INSERT' then old.aluno_id else null end;
  v_old_course uuid:=case when tg_op<>'INSERT' then old.curso_id else null end;
begin
  if exists(select 1 from public.banese_ead_checkout_expiration_jobs j
    join public.matriculas m on m.id=j.matricula_id join public.turmas t on t.id=m.turma_id
    where ((m.aluno_id=v_aluno and t.curso_id=v_course)
      or (m.aluno_id=v_old_aluno and t.curso_id=v_old_course)) and j.canceled_at is null
      and j.state in ('PROCESSING','RETRY','REVIEW_REQUIRED') and j.cancel_reason='EXPIRED_OPTIONAL'
      and not internal_contas.ead_expiration_payment_is_confirmed(j.id)) then
    raise exception 'Acesso EAD aguarda confirmação de pagamento.' using errcode='PT409';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger a_guard_ead_checkout_expiration_progress before insert or update or delete on public.ead_aluno_progresso
  for each row execute function public.guard_ead_checkout_expiration_progress();

create or replace function public.guard_ead_checkout_expiration_course_identity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='turmas' then
    if new.curso_id is not distinct from old.curso_id and new.polo_id is not distinct from old.polo_id then return new; end if;
    if exists(select 1 from public.banese_ead_checkout_expiration_jobs j
      join public.matriculas m on m.id=j.matricula_id
      where m.turma_id=old.id and j.canceled_at is null
        and j.state in ('PROCESSING','RETRY','REVIEW_REQUIRED')) then
      raise exception 'Identidade da turma EAD aguarda conciliação bancária.' using errcode='PT409';
    end if;
  elsif new.modalidade is distinct from old.modalidade and exists(
    select 1 from public.banese_ead_checkout_expiration_jobs j
    join public.matriculas m on m.id=j.matricula_id join public.turmas t on t.id=m.turma_id
    where t.curso_id=old.id and j.canceled_at is null
      and j.state in ('PROCESSING','RETRY','REVIEW_REQUIRED')) then
    raise exception 'Modalidade do curso EAD aguarda conciliação bancária.' using errcode='PT409';
  end if;
  return new;
end;
$$;
create trigger a_guard_ead_checkout_expiration_class_identity before update of curso_id,polo_id on public.turmas
  for each row execute function public.guard_ead_checkout_expiration_course_identity();
create trigger a_guard_ead_checkout_expiration_course_identity before update of modalidade on public.cursos
  for each row execute function public.guard_ead_checkout_expiration_course_identity();

revoke all on function public.guard_ead_checkout_expiration_receivable() from public,anon,authenticated;
revoke all on function public.guard_ead_checkout_expiration_transaction() from public,anon,authenticated;
revoke all on function public.guard_ead_checkout_expiration_inscription() from public,anon,authenticated;
revoke all on function public.preserve_ead_checkout_expiration_queue_fence() from public,anon,authenticated;
revoke all on function public.guard_ead_checkout_expiration_enrollment() from public,anon,authenticated;
revoke all on function public.guard_ead_checkout_expiration_progress() from public,anon,authenticated;
revoke all on function public.guard_ead_checkout_expiration_course_identity() from public,anon,authenticated;

commit;
