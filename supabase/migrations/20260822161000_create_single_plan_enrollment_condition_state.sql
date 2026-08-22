begin;

create table if not exists public.matriculas_plano_financeiro_unico_config (
  matricula_id uuid primary key,
  turma_id uuid not null references public.turmas(id) on delete cascade,
  aluno_id uuid not null references public.parceiros(id) on delete restrict,
  constraint matriculas_plano_financeiro_unico_config_matricula_fkey
    foreign key (matricula_id, turma_id, aluno_id)
    references public.matriculas(id, turma_id, aluno_id)
    on delete cascade,
  status_financeiro text not null default 'PENDENTE'
    check (status_financeiro in ('PENDENTE', 'GERADA')),
  modo_condicao text not null default 'HERDAR'
    check (modo_condicao in ('HERDAR', 'PERSONALIZAR')),
  plano_turma_revisao integer not null check (plano_turma_revisao > 0),
  plano_turma_fingerprint text not null,
  qtd_parcelas_individual integer check (qtd_parcelas_individual between 1 and 60),
  primeiro_vencimento_individual date,
  desconto_comercial_tipo text not null default 'NENHUM'
    check (desconto_comercial_tipo in ('NENHUM', 'A_VISTA', 'NEGOCIADO')),
  desconto_comercial_valor numeric(14, 2) not null default 0
    check (desconto_comercial_valor >= 0),
  desconto_pontualidade_individual numeric(14, 2)
    check (desconto_pontualidade_individual >= 0),
  juros_atraso_percentual_individual numeric(8, 4)
    check (juros_atraso_percentual_individual between 0 and 100),
  multa_atraso_individual numeric(14, 2)
    check (multa_atraso_individual >= 0),
  override_revisao integer not null default 0 check (override_revisao >= 0),
  override_fingerprint text not null,
  regra_efetiva_fingerprint text not null,
  motivo text check (
    motivo is null or motivo in (
      'BOLSA', 'CONVENIO', 'INCENTIVO', 'NEGOCIACAO',
      'A_VISTA', 'OUTRO'
    )
  ),
  justificativa text check (
    justificativa is null or pg_catalog.length(justificativa) between 1 and 300
  ),
  autorizado_por uuid references auth.users(id) on delete set null,
  generated_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matriculas_plano_unico_config_modo_check check (
    (
      modo_condicao = 'HERDAR'
      and qtd_parcelas_individual is null
      and primeiro_vencimento_individual is null
      and desconto_comercial_tipo = 'NENHUM'
      and desconto_comercial_valor = 0
      and desconto_pontualidade_individual is null
      and juros_atraso_percentual_individual is null
      and multa_atraso_individual is null
    ) or (
      modo_condicao = 'PERSONALIZAR'
      and qtd_parcelas_individual is not null
      and primeiro_vencimento_individual is not null
      and desconto_pontualidade_individual is not null
      and juros_atraso_percentual_individual is not null
      and multa_atraso_individual is not null
    )
  ),
  constraint matriculas_plano_unico_config_desconto_check check (
    (desconto_comercial_tipo = 'NENHUM' and desconto_comercial_valor = 0)
    or (desconto_comercial_tipo = 'A_VISTA'
      and desconto_comercial_valor > 0 and qtd_parcelas_individual = 1)
    or (desconto_comercial_tipo = 'NEGOCIADO' and desconto_comercial_valor > 0)
  ),
  constraint matriculas_plano_unico_config_outro_check check (
    motivo is distinct from 'OUTRO'
    or pg_catalog.length(pg_catalog.btrim(coalesce(justificativa, ''))) between 5 and 300
  ),
  constraint matriculas_plano_unico_config_personalizada_motivo_check check (
    modo_condicao <> 'PERSONALIZAR' or motivo is not null
  ),
  constraint matriculas_plano_unico_config_generated_check check (
    (status_financeiro = 'PENDENTE' and generated_at is null)
    or (status_financeiro = 'GERADA' and generated_at is not null)
  )
);

create index if not exists matriculas_plano_unico_config_turma_status_idx
  on public.matriculas_plano_financeiro_unico_config(
    turma_id, status_financeiro, updated_at desc
  );

create table if not exists internal_academic.nontechnical_condition_codes (
  turma_id uuid primary key references public.turmas(id) on delete cascade,
  code_hash text not null,
  revision integer not null default 1 check (revision > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists internal_academic.nontechnical_condition_attempts (
  turma_id uuid not null references public.turmas(id) on delete cascade,
  aluno_id uuid not null references public.parceiros(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (turma_id, actor_id)
);

alter table public.matriculas_plano_financeiro_unico_config enable row level security;
revoke all on table public.matriculas_plano_financeiro_unico_config
  from public, anon, authenticated;
grant all on table public.matriculas_plano_financeiro_unico_config to service_role;
revoke all on table internal_academic.nontechnical_condition_codes
  from public, anon, authenticated, service_role;
revoke all on table internal_academic.nontechnical_condition_attempts
  from public, anon, authenticated, service_role;

comment on table public.matriculas_plano_financeiro_unico_config is
  'Condição pendente e identidade efetiva do plano único; títulos continuam congelados no snapshot de geração.';
comment on column public.matriculas_plano_financeiro_unico_config.desconto_comercial_valor is
  'Redução comercial do total nominal. Não se confunde com desconto fixo de pontualidade por parcela.';

create or replace function internal_academic.is_service_financial_actor()
returns boolean
language sql
stable
set search_path = ''
as $function$
  select coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
    or session_user = 'service_role';
$function$;

revoke all on function internal_academic.is_service_financial_actor()
  from public, anon, authenticated, service_role;

create or replace function internal_academic.assert_can_operate_nontechnical_plan_v2(
  p_turma_id uuid,
  p_require_finance boolean default false
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if internal_academic.is_service_financial_actor() then return; end if;
  if auth.uid() is null or not public.can_operate_turma_academics(p_turma_id)
    or (p_require_finance and not public.gestor_has_tab('gestao', 'financeiro'))
  then
    raise exception 'Sem permissão para operar o plano financeiro desta turma.'
      using errcode = '42501';
  end if;
end;
$function$;

revoke all on function internal_academic.assert_can_operate_nontechnical_plan_v2(uuid, boolean)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.assert_can_preview_nontechnical_plan_v2(
  p_polo_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if internal_academic.is_service_financial_actor() then return; end if;
  if auth.uid() is null
    or not public.gestor_has_module('gestao')
    or not public.gestor_has_tab('gestao', 'financeiro')
    or not public.is_gestor_for_polo(p_polo_id)
  then
    raise exception 'Sem permissão para prever o plano financeiro neste polo.'
      using errcode = '42501';
  end if;
end;
$function$;

revoke all on function internal_academic.assert_can_preview_nontechnical_plan_v2(uuid)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.guard_nontechnical_plan_config_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'A condição financeira da matrícula não pode ser excluída.'
      using errcode = '23514';
  end if;
  if not internal_academic.is_service_financial_actor()
    and nullif(pg_catalog.current_setting(
      'app.nontechnical_single_plan_v2', true
    ), '') is null
  then
    raise exception 'Use o fluxo oficial para alterar a condição financeira.'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.status_financeiro = 'GERADA'
    and new is distinct from old
  then
    raise exception 'A condição financeira é imutável após gerar as parcelas.'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE'
    and old.status_financeiro = 'PENDENTE'
    and new.status_financeiro not in ('PENDENTE', 'GERADA')
  then
    raise exception 'Transição financeira inválida.' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function internal_academic.guard_nontechnical_plan_config_v2()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_nontechnical_plan_config_v2
  on public.matriculas_plano_financeiro_unico_config;
create trigger guard_nontechnical_plan_config_v2
before insert or update or delete
on public.matriculas_plano_financeiro_unico_config
for each row execute function internal_academic.guard_nontechnical_plan_config_v2();

commit;
