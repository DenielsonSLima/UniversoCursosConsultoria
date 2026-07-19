begin;

alter table public.whatsapp_billing_settings
  add column if not exists alert_initial_percent numeric(5,2) not null default 50.00,
  add column if not exists alert_warning_percent numeric(5,2) not null default 75.00,
  add column if not exists alert_critical_percent numeric(5,2) not null default 90.00;

alter table public.whatsapp_billing_settings
  drop constraint if exists whatsapp_billing_settings_alert_thresholds_check;

alter table public.whatsapp_billing_settings
  add constraint whatsapp_billing_settings_alert_thresholds_check check (
    alert_initial_percent >= 0
    and alert_initial_percent < alert_warning_percent
    and alert_warning_percent < alert_critical_percent
    and alert_critical_percent <= 100
  );

update public.whatsapp_billing_settings
set
  alert_initial_percent = 50.00,
  alert_warning_percent = 75.00,
  alert_critical_percent = 90.00
where id = true;

drop function if exists public.whatsapp_usage_summary(date);

create function public.whatsapp_usage_summary(
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
  spent_percent numeric,
  alert_level text,
  alert_title text,
  alert_message text,
  alert_threshold_percent numeric,
  alert_threshold_amount numeric
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
  ), summary as (
    select
      s.*,
      u.*,
      greatest(s.monthly_limit - u.spent, 0) as remaining,
      case when s.monthly_limit > 0
        then round(least((u.spent / s.monthly_limit) * 100, 100), 2)
        else 0 end as spent_percent
    from settings s
    cross join usage u
  ), alert as (
    select
      sm.*,
      case
        when sm.spent_percent >= sm.alert_critical_percent then 'critical'
        when sm.spent_percent >= sm.alert_warning_percent then 'warning'
        when sm.spent_percent >= sm.alert_initial_percent then 'initial'
        else 'none'
      end as alert_level,
      case
        when sm.spent_percent >= sm.alert_critical_percent then sm.alert_critical_percent
        when sm.spent_percent >= sm.alert_warning_percent then sm.alert_warning_percent
        when sm.spent_percent >= sm.alert_initial_percent then sm.alert_initial_percent
        else null
      end as alert_threshold_percent
    from summary sm
  )
  select
    date_trunc('month', p_month)::date,
    a.monthly_limit,
    a.currency,
    a.meta_balance,
    a.meta_balance_source,
    a.meta_synced_at,
    a.marketing_sent,
    a.marketing_rate,
    a.marketing_cost,
    floor(greatest(a.monthly_limit - a.spent, 0) / nullif(a.marketing_rate, 0))::bigint,
    case when a.monthly_limit > 0
      then round(least((a.marketing_cost / a.monthly_limit) * 100, 100), 2)
      else 0 end,
    a.billing_sent,
    a.billing_rate,
    a.billing_cost,
    floor(greatest(a.monthly_limit - a.spent, 0) / nullif(a.billing_rate, 0))::bigint,
    case when a.monthly_limit > 0
      then round(least((a.billing_cost / a.monthly_limit) * 100, 100), 2)
      else 0 end,
    a.service_sent,
    a.service_rate,
    a.service_cost,
    case when a.monthly_limit > 0
      then round(least((a.service_cost / a.monthly_limit) * 100, 100), 2)
      else 0 end,
    a.total_sent,
    a.spent,
    a.remaining,
    a.spent_percent,
    a.alert_level,
    case a.alert_level
      when 'critical' then 'Consumo crítico do WhatsApp'
      when 'warning' then 'Orçamento em atenção'
      when 'initial' then 'Acompanhamento de consumo iniciado'
      else null
    end,
    case a.alert_level
      when 'critical' then format(
        'O consumo chegou a %s%% (%s %s). Restam %s %s do orçamento mensal. Revise campanhas e automações não essenciais.',
        trim(to_char(a.spent_percent, 'FM990D00')),
        a.currency,
        trim(to_char(a.spent, 'FM999999990D00')),
        a.currency,
        trim(to_char(a.remaining, 'FM999999990D00'))
      )
      when 'warning' then format(
        'O consumo chegou a %s%% (%s %s). O aviso de 75%%, equivalente a %s %s no orçamento atual, foi atingido.',
        trim(to_char(a.spent_percent, 'FM990D00')),
        a.currency,
        trim(to_char(a.spent, 'FM999999990D00')),
        a.currency,
        trim(to_char(a.monthly_limit * a.alert_warning_percent / 100, 'FM999999990D00'))
      )
      when 'initial' then format(
        'O consumo chegou a %s%% (%s %s). A partir de 50%%, o acompanhamento do orçamento fica ativo.',
        trim(to_char(a.spent_percent, 'FM990D00')),
        a.currency,
        trim(to_char(a.spent, 'FM999999990D00'))
      )
      else null
    end,
    a.alert_threshold_percent,
    case
      when a.alert_threshold_percent is null then null
      else round(a.monthly_limit * a.alert_threshold_percent / 100, 2)
    end
  from alert a;
end;
$$;

revoke all on function public.whatsapp_usage_summary(date) from public, anon;
grant execute on function public.whatsapp_usage_summary(date) to authenticated, service_role;

commit;
