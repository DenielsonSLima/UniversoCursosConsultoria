begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.whatsapp_canonical_phone(p_phone text)
returns text
language sql
immutable
set search_path = public
as $$
  with normalized as (
    select public.whatsapp_normalize_phone(p_phone) as phone
  )
  select case
    when phone ~ '^55[1-9][0-9][6-9][0-9]{7}$'
      then left(phone, 4) || '9' || substring(phone from 5)
    else phone
  end
  from normalized;
$$;

create table if not exists public.whatsapp_automation_deliveries (
  id uuid primary key default gen_random_uuid(),
  automation_key text not null,
  aluno_id uuid not null references public.parceiros(id) on delete cascade,
  receivable_id uuid references public.contas_receber(id) on delete set null,
  receivable_ids uuid[] not null default '{}'::uuid[],
  reference_date date not null,
  dedupe_key text not null,
  target_phone text not null,
  content text not null,
  status text not null default 'processing',
  meta_message_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint whatsapp_automation_deliveries_key_check
    check (automation_key in ('due', 'receipt', 'overdue', 'multiple')),
  constraint whatsapp_automation_deliveries_status_check
    check (status in ('processing', 'sent', 'error', 'skipped')),
  constraint whatsapp_automation_deliveries_dedupe_key_unique
    unique (dedupe_key)
);

create index if not exists idx_whatsapp_automation_deliveries_aluno_created
  on public.whatsapp_automation_deliveries (aluno_id, created_at desc);

create index if not exists idx_whatsapp_automation_deliveries_status_created
  on public.whatsapp_automation_deliveries (status, created_at)
  where status in ('processing', 'error');

create index if not exists idx_contas_receber_whatsapp_due
  on public.contas_receber (data_vencimento, cliente_id)
  where data_pagamento is null;

create index if not exists idx_contas_receber_whatsapp_payment
  on public.contas_receber (data_pagamento, cliente_id)
  where data_pagamento is not null;

alter table public.whatsapp_automation_deliveries enable row level security;

drop policy if exists portal_whatsapp_automation_deliveries_gestor_read
  on public.whatsapp_automation_deliveries;
create policy portal_whatsapp_automation_deliveries_gestor_read
  on public.whatsapp_automation_deliveries
  for select
  to authenticated
  using (public.is_gestor());

revoke all on public.whatsapp_automation_deliveries from public, anon;
grant select on public.whatsapp_automation_deliveries to authenticated;
grant select, insert, update on public.whatsapp_automation_deliveries to service_role;

create or replace function public.whatsapp_apply_template(
  p_template text,
  p_values jsonb
)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_result text := coalesce(p_template, '');
  v_key text;
  v_value text;
begin
  for v_key, v_value in
    select key, value
    from jsonb_each_text(coalesce(p_values, '{}'::jsonb))
  loop
    v_result := replace(v_result, '{{' || v_key || '}}', coalesce(v_value, ''));
  end loop;
  return v_result;
end;
$$;

create or replace function public.whatsapp_financial_automation_candidates(
  p_target_date date default (pg_catalog.timezone('America/Maceio', now()))::date,
  p_aluno_id uuid default null,
  p_limit integer default 500
)
returns table (
  automation_key text,
  aluno_id uuid,
  aluno_nome text,
  telefone text,
  receivable_id uuid,
  receivable_ids uuid[],
  reference_date date,
  dedupe_key text,
  message_content text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with cfg as (
    select
      wa_send_due_notice as due_enabled,
      greatest(coalesce(wa_due_notice_days, 3), 0) as due_days,
      wa_due_notice_template as due_template,
      coalesce(wa_due_notice_modalities, '{}'::text[]) as due_modalities,
      wa_send_payment_receipt as receipt_enabled,
      wa_payment_receipt_template as receipt_template,
      coalesce(wa_payment_receipt_modalities, '{}'::text[]) as receipt_modalities,
      wa_send_overdue_notice as overdue_enabled,
      greatest(coalesce(wa_overdue_notice_days, 1), 0) as overdue_days,
      wa_default_overdue_template as overdue_template,
      coalesce(wa_overdue_notice_modalities, '{}'::text[]) as overdue_modalities,
      wa_send_multiple_overdue_notice as multiple_enabled,
      greatest(coalesce(wa_multiple_overdue_min_installments, 2), 2) as multiple_min,
      wa_multiple_overdue_template as multiple_template,
      coalesce(wa_multiple_overdue_modalities, '{}'::text[]) as multiple_modalities
    from public.mensageria_config
    where tipo = 'whatsapp'
      and wa_enabled = true
      and wa_status = 'configurado'
  ),
  base as (
    select
      cr.id,
      cr.cliente_id as aluno_id,
      cr.matricula_id,
      coalesce(cr.turma_id, m.turma_id) as turma_id,
      coalesce(cr.matricula_id, cr.turma_id, cr.cliente_id) as group_id,
      cr.descricao,
      cr.valor,
      cr.data_vencimento,
      cr.data_pagamento,
      cr.valor_pago,
      cr.status,
      cr.parcela_numero,
      p.nome as aluno_nome,
      public.whatsapp_canonical_phone(p.telefone) as telefone,
      case
        when length(public.whatsapp_digits(p.cpf_cnpj)) = 11
          then right(public.whatsapp_digits(p.cpf_cnpj), 4)
        else 'não informado'
      end as cpf_final,
      coalesce(c.nome, 'curso não informado') as curso_nome,
      upper(coalesce(c.modalidade, '')) as modalidade,
      coalesce(t.nome, 'turma não informada') as turma_nome,
      coalesce(
        nullif(cr.gateway_invoice_url, ''),
        nullif(cr.gateway_bank_slip_url, ''),
        nullif(cr.asaas_invoice_url, ''),
        nullif(cr.asaas_bank_slip_url, ''),
        'solicite o link de pagamento neste atendimento'
      ) as link_pagamento,
      cfg.*
    from public.contas_receber cr
    join public.parceiros p on p.id = cr.cliente_id and p.tipo = 'Aluno'
    left join public.matriculas m on m.id = cr.matricula_id
    left join public.turmas t on t.id = coalesce(cr.turma_id, m.turma_id)
    left join public.cursos c on c.id = t.curso_id
    cross join cfg
    where (p_aluno_id is null or p.id = p_aluno_id)
      and public.whatsapp_canonical_phone(p.telefone) is not null
  ),
  unpaid as (
    select *
    from base
    where data_pagamento is null
      and upper(coalesce(status, '')) not in (
        'PAGO', 'RECEBIDO', 'CONFIRMADO', 'PAID', 'RECEIVED', 'CONFIRMED',
        'CANCELADO', 'CANCELED', 'REFUNDED', 'ESTORNADO'
      )
  ),
  overdue_group as (
    select
      aluno_id,
      group_id,
      count(*)::integer as installment_count,
      sum(valor) as total_value,
      array_agg(id order by data_vencimento, id) as ids,
      min(data_vencimento) as first_due_date
    from unpaid
    where data_vencimento < p_target_date
    group by aluno_id, group_id
  ),
  due_rows as (
    select b.*
    from unpaid b
    where b.due_enabled = true
      and b.data_vencimento = p_target_date + b.due_days
      and b.modalidade = any(b.due_modalities)
  ),
  receipt_rows as (
    select b.*
    from base b
    where b.receipt_enabled = true
      and b.data_pagamento = p_target_date
      and b.modalidade = any(b.receipt_modalities)
  ),
  overdue_rows as (
    select b.*
    from unpaid b
    join overdue_group g on g.aluno_id = b.aluno_id and g.group_id = b.group_id
    where b.overdue_enabled = true
      and b.data_vencimento = p_target_date - b.overdue_days
      and b.modalidade = any(b.overdue_modalities)
      and (b.multiple_enabled is not true or g.installment_count < b.multiple_min)
  ),
  multiple_rows as (
    select
      first_row.*,
      g.installment_count,
      g.total_value,
      g.ids,
      g.first_due_date
    from overdue_group g
    join lateral (
      select b.*
      from unpaid b
      where b.aluno_id = g.aluno_id
        and b.group_id = g.group_id
      order by b.data_vencimento, b.id
      limit 1
    ) first_row on true
    where first_row.multiple_enabled = true
      and g.installment_count >= first_row.multiple_min
      and first_row.modalidade = any(first_row.multiple_modalities)
  ),
  candidates as (
    select
      'due'::text as automation_key,
      b.aluno_id,
      b.aluno_nome,
      b.telefone,
      b.id as receivable_id,
      array[b.id]::uuid[] as receivable_ids,
      p_target_date as reference_date,
      'due:' || b.id::text as dedupe_key,
      public.whatsapp_apply_template(b.due_template, jsonb_build_object(
        'nome_aluno', b.aluno_nome,
        'nome_curso', b.curso_nome,
        'valor_fatura', 'R$ ' || replace(to_char(b.valor, 'FM999999990D00'), '.', ','),
        'data_vencimento', to_char(b.data_vencimento, 'DD/MM/YYYY'),
        'cpf_final', b.cpf_final,
        'link_pagamento', b.link_pagamento,
        'nome_turma', b.turma_nome,
        'numero_mensalidade', coalesce(lpad(b.parcela_numero::text, 2, '0'), 'não informado'),
        'descricao_fatura', b.descricao
      )) as message_content
    from due_rows b

    union all

    select
      'receipt'::text,
      b.aluno_id,
      b.aluno_nome,
      b.telefone,
      b.id,
      array[b.id]::uuid[],
      p_target_date,
      'receipt:' || b.id::text,
      public.whatsapp_apply_template(b.receipt_template, jsonb_build_object(
        'nome_aluno', b.aluno_nome,
        'nome_curso', b.curso_nome,
        'valor_fatura', 'R$ ' || replace(to_char(coalesce(b.valor_pago, b.valor), 'FM999999990D00'), '.', ','),
        'data_vencimento', to_char(b.data_vencimento, 'DD/MM/YYYY'),
        'cpf_final', b.cpf_final,
        'link_pagamento', b.link_pagamento,
        'nome_turma', b.turma_nome,
        'numero_mensalidade', coalesce(lpad(b.parcela_numero::text, 2, '0'), 'não informado'),
        'descricao_fatura', b.descricao
      ))
    from receipt_rows b

    union all

    select
      'overdue'::text,
      b.aluno_id,
      b.aluno_nome,
      b.telefone,
      b.id,
      array[b.id]::uuid[],
      p_target_date,
      'overdue:' || b.id::text,
      public.whatsapp_apply_template(b.overdue_template, jsonb_build_object(
        'nome_aluno', b.aluno_nome,
        'nome_curso', b.curso_nome,
        'valor_fatura', 'R$ ' || replace(to_char(b.valor, 'FM999999990D00'), '.', ','),
        'data_vencimento', to_char(b.data_vencimento, 'DD/MM/YYYY'),
        'cpf_final', b.cpf_final,
        'link_pagamento', b.link_pagamento,
        'nome_turma', b.turma_nome,
        'numero_mensalidade', coalesce(lpad(b.parcela_numero::text, 2, '0'), 'não informado'),
        'descricao_fatura', b.descricao
      ))
    from overdue_rows b

    union all

    select
      'multiple'::text,
      b.aluno_id,
      b.aluno_nome,
      b.telefone,
      b.id,
      b.ids,
      p_target_date,
      'multiple:' || b.aluno_id::text || ':' || md5(array_to_string(b.ids, ',')),
      public.whatsapp_apply_template(b.multiple_template, jsonb_build_object(
        'nome_aluno', b.aluno_nome,
        'nome_curso', b.curso_nome,
        'valor_fatura', 'R$ ' || replace(to_char(b.valor, 'FM999999990D00'), '.', ','),
        'valor_total_atrasado', 'R$ ' || replace(to_char(b.total_value, 'FM999999990D00'), '.', ','),
        'quantidade_parcelas', b.installment_count::text,
        'data_vencimento', to_char(b.first_due_date, 'DD/MM/YYYY'),
        'cpf_final', b.cpf_final,
        'link_pagamento', b.link_pagamento,
        'nome_turma', b.turma_nome,
        'numero_mensalidade', coalesce(lpad(b.parcela_numero::text, 2, '0'), 'não informado'),
        'descricao_fatura', b.descricao
      ))
    from multiple_rows b
  )
  select c.*
  from candidates c
  order by
    case c.automation_key
      when 'due' then 1
      when 'receipt' then 2
      when 'overdue' then 3
      when 'multiple' then 4
      else 5
    end,
    c.aluno_nome,
    c.receivable_id
  limit greatest(1, least(coalesce(p_limit, 500), 500));
$$;

revoke all on function public.whatsapp_apply_template(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.whatsapp_financial_automation_candidates(date, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.whatsapp_apply_template(text, jsonb) to service_role;
grant execute on function public.whatsapp_financial_automation_candidates(date, uuid, integer) to service_role;

do $$
begin
  if not exists (
    select 1 from vault.secrets
    where name = 'whatsapp_automation_worker_secret'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'whatsapp_automation_worker_secret',
      'Autenticacao interna dos executores automaticos do WhatsApp'
    );
  end if;
end;
$$;

create or replace function public.whatsapp_get_automation_worker_secret()
returns text
language sql
security definer
set search_path = pg_catalog, public, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'whatsapp_automation_worker_secret'
  limit 1;
$$;

revoke all on function public.whatsapp_get_automation_worker_secret()
  from public, anon, authenticated;
grant execute on function public.whatsapp_get_automation_worker_secret()
  to service_role;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job
    where jobname in (
      'whatsapp-financial-automation-every-5-minutes',
      'whatsapp-birthday-automation-every-5-minutes'
    )
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'whatsapp-financial-automation-every-5-minutes',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := 'https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/whatsapp-automation-agent',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'whatsapp_automation_worker_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);

select cron.schedule(
  'whatsapp-birthday-automation-every-5-minutes',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := 'https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/whatsapp-birthday-agent',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'whatsapp_automation_worker_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);

commit;
