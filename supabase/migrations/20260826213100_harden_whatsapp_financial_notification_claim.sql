begin;

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
set search_path = ''
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
    where public.financial_receivable_is_notifiable(status, data_pagamento)
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
      and public.financial_receivable_is_paid_confirmed(
        b.status,
        b.data_pagamento
      )
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

revoke all on function public.whatsapp_financial_automation_candidates(
  date, uuid, integer
) from public, anon, authenticated;
grant execute on function public.whatsapp_financial_automation_candidates(
  date, uuid, integer
) to service_role;

create or replace function public.claim_whatsapp_financial_automation_delivery(
  p_automation_key text,
  p_aluno_id uuid,
  p_reference_date date,
  p_candidate_dedupe_key text,
  p_test_mode boolean default false,
  p_target_phone_override text default null
)
returns table (
  delivery_id uuid,
  automation_key text,
  aluno_id uuid,
  aluno_nome text,
  target_phone text,
  receivable_id uuid,
  receivable_ids uuid[],
  reference_date date,
  message_content text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate record;
  v_locked_count integer := 0;
  v_delivery_id uuid;
  v_delivery_dedupe_key text;
  v_target_phone text;
begin
  if p_automation_key not in ('due', 'receipt', 'overdue', 'multiple')
     or p_aluno_id is null
     or p_reference_date is null
     or nullif(btrim(p_candidate_dedupe_key), '') is null then
    return;
  end if;

  select candidate.* into v_candidate
  from public.whatsapp_financial_automation_candidates(
    p_reference_date,
    p_aluno_id,
    500
  ) candidate
  where candidate.automation_key = p_automation_key
    and candidate.dedupe_key = p_candidate_dedupe_key
  limit 1;
  if not found then
    return;
  end if;

  perform receivable.id
  from public.contas_receber receivable
  where receivable.id = any(v_candidate.receivable_ids)
  order by receivable.id
  for share;
  get diagnostics v_locked_count = row_count;
  if v_locked_count <> cardinality(v_candidate.receivable_ids) then
    return;
  end if;

  select candidate.* into v_candidate
  from public.whatsapp_financial_automation_candidates(
    p_reference_date,
    p_aluno_id,
    500
  ) candidate
  where candidate.automation_key = p_automation_key
    and candidate.dedupe_key = p_candidate_dedupe_key
  limit 1;
  if not found then
    return;
  end if;

  v_target_phone := case
    when p_test_mode then public.whatsapp_canonical_phone(p_target_phone_override)
    else v_candidate.telefone
  end;
  if v_target_phone is null then
    return;
  end if;

  v_delivery_dedupe_key := case
    when p_test_mode then format(
      'test:%s:%s:%s',
      p_reference_date,
      p_aluno_id,
      v_candidate.dedupe_key
    )
    else v_candidate.dedupe_key
  end;

  insert into public.whatsapp_automation_deliveries (
    automation_key,
    aluno_id,
    receivable_id,
    receivable_ids,
    reference_date,
    dedupe_key,
    target_phone,
    content,
    status
  ) values (
    v_candidate.automation_key,
    v_candidate.aluno_id,
    v_candidate.receivable_id,
    v_candidate.receivable_ids,
    v_candidate.reference_date,
    v_delivery_dedupe_key,
    v_target_phone,
    v_candidate.message_content,
    'processing'
  )
  on conflict on constraint whatsapp_automation_deliveries_dedupe_key_unique
  do nothing
  returning id into v_delivery_id;

  if v_delivery_id is null then
    return;
  end if;

  return query select
    v_delivery_id,
    v_candidate.automation_key::text,
    v_candidate.aluno_id::uuid,
    v_candidate.aluno_nome::text,
    v_target_phone,
    v_candidate.receivable_id::uuid,
    v_candidate.receivable_ids::uuid[],
    v_candidate.reference_date::date,
    v_candidate.message_content::text;
end;
$$;

revoke all on function public.claim_whatsapp_financial_automation_delivery(
  text, uuid, date, text, boolean, text
) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_financial_automation_delivery(
  text, uuid, date, text, boolean, text
) to service_role;

commit;
