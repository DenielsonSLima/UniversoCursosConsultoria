begin;

-- Função de trigger nunca deve ser invocada diretamente via API.
revoke all on function public.whatsapp_record_message_usage() from public, anon, authenticated;

-- O resumo de custos do WhatsApp é restrito ao módulo Comunicação.
create or replace function public.whatsapp_usage_summary(
  p_month date default date_trunc('month', now())::date
)
returns table(
  usage_month date,
  monthly_limit numeric,
  currency text,
  meta_balance numeric,
  meta_balance_source text,
  meta_synced_at timestamptz,
  marketing_sent bigint,
  marketing_rate numeric,
  marketing_cost numeric,
  marketing_available bigint,
  marketing_percent numeric,
  billing_sent bigint,
  billing_rate numeric,
  billing_cost numeric,
  billing_available bigint,
  billing_percent numeric,
  service_sent bigint,
  service_rate numeric,
  service_cost numeric,
  service_percent numeric,
  total_sent bigint,
  spent numeric,
  remaining numeric,
  spent_percent numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not public.gestor_has_tab('comunicacao', 'comunicacao-whatsapp')
  then
    raise exception 'Gestor sem permissão para consultar o consumo do WhatsApp.'
      using errcode = '42501';
  end if;

  return query
  with settings as (
    select *
    from public.whatsapp_billing_settings
    where id = true
  ), usage as (
    select
      coalesce(sum(wmu.cost) filter (where wmu.category = 'marketing'), 0) as marketing_cost,
      coalesce(count(*) filter (where wmu.category = 'marketing'), 0) as marketing_sent,
      coalesce(sum(wmu.cost) filter (where wmu.category = 'billing'), 0) as billing_cost,
      coalesce(count(*) filter (where wmu.category = 'billing'), 0) as billing_sent,
      coalesce(sum(wmu.cost) filter (where wmu.category = 'service'), 0) as service_cost,
      coalesce(count(*) filter (where wmu.category = 'service'), 0) as service_sent,
      coalesce(sum(wmu.cost), 0) as spent,
      coalesce(count(*), 0) as total_sent
    from public.whatsapp_message_usage wmu
    where wmu.usage_month = date_trunc('month', p_month)::date
  )
  select
    date_trunc('month', p_month)::date,
    s.monthly_limit,
    s.currency,
    s.meta_balance,
    s.meta_balance_source,
    s.meta_synced_at,
    u.marketing_sent,
    s.marketing_rate,
    u.marketing_cost,
    floor(greatest(s.monthly_limit - u.spent, 0) / nullif(s.marketing_rate, 0))::bigint,
    case when s.monthly_limit > 0
      then round(least((u.marketing_cost / s.monthly_limit) * 100, 100), 2)
      else 0 end,
    u.billing_sent,
    s.billing_rate,
    u.billing_cost,
    floor(greatest(s.monthly_limit - u.spent, 0) / nullif(s.billing_rate, 0))::bigint,
    case when s.monthly_limit > 0
      then round(least((u.billing_cost / s.monthly_limit) * 100, 100), 2)
      else 0 end,
    u.service_sent,
    s.service_rate,
    u.service_cost,
    case when s.monthly_limit > 0
      then round(least((u.service_cost / s.monthly_limit) * 100, 100), 2)
      else 0 end,
    u.total_sent,
    u.spent,
    greatest(s.monthly_limit - u.spent, 0),
    case when s.monthly_limit > 0
      then round(least((u.spent / s.monthly_limit) * 100, 100), 2)
      else 0 end
  from settings s
  cross join usage u;
end;
$$;

revoke all on function public.whatsapp_usage_summary(date) from public, anon;
grant execute on function public.whatsapp_usage_summary(date) to authenticated, service_role;

-- Helpers SQL com search_path fixo eliminam resolução por objetos maliciosos.
alter function public.whatsapp_normalize_text(text) set search_path = public;
alter function public.whatsapp_has_financial_terms(text) set search_path = public;
alter function public.whatsapp_is_service_window(uuid, uuid, timestamptz) set search_path = public;
alter function public.whatsapp_classify_usage(uuid, uuid, timestamptz, text) set search_path = public;
alter function public.whatsapp_digits(text) set search_path = public;
alter function public.whatsapp_birthday_monthly_projection(integer) set search_path = public;
alter function public.get_cursos_com_kpis(text) set search_path = public;

-- Funções internas são executadas apenas por wrappers/owner e service_role.
do $$
declare
  v_function record;
begin
  for v_function in
    select p.oid::regprocedure as regproc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'internal_academic'
      and p.prosecdef
      and p.proname not in (
        'is_active_student_in_turma',
        'is_aula_in_academic_context',
        'is_technical_stage_discipline'
      )
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      v_function.regproc
    );
    execute format('grant execute on function %s to service_role', v_function.regproc);
  end loop;
end;
$$;

-- Estes helpers são chamados diretamente por políticas RLS acadêmicas.
revoke all on function internal_academic.is_active_student_in_turma(uuid, uuid)
  from public, anon;
revoke all on function internal_academic.is_aula_in_academic_context(uuid, uuid, uuid)
  from public, anon;
revoke all on function internal_academic.is_technical_stage_discipline(uuid, uuid)
  from public, anon;
grant execute on function internal_academic.is_active_student_in_turma(uuid, uuid)
  to authenticated, service_role;
grant execute on function internal_academic.is_aula_in_academic_context(uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function internal_academic.is_technical_stage_discipline(uuid, uuid)
  to authenticated, service_role;

commit;
