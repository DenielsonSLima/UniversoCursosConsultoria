create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema auth;
create schema extensions;
create schema internal_academic;
create schema internal_finance;
create schema internal_proesc;
grant usage on schema auth to anon, authenticated, service_role;

create function auth.jwt() returns jsonb language sql stable as $function$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000500"}'::jsonb);
$function$;
create function auth.uid() returns uuid language sql stable as $function$
  select (auth.jwt() ->> 'sub')::uuid;
$function$;
-- PGlite não embute pgcrypto. Este digest determinístico exercita tamanho,
-- canonicalização, replay e CAS; não valida a implementação criptográfica real.
create function extensions.digest(p_data bytea, p_algorithm text)
returns bytea language sql immutable as $function$
  select decode(
    md5(encode(p_data, 'hex')) || md5(encode(p_data, 'escape') || p_algorithm),
    'hex'
  );
$function$;

create table public.empresas (id uuid primary key);
create table public.polos (
  id uuid primary key,
  company_id uuid not null references public.empresas(id),
  nome text not null,
  status text not null
);
create table public.parceiros (
  id uuid primary key,
  nome text not null,
  polo_id uuid references public.polos(id),
  status text not null,
  auth_user_id uuid
);
create table public.cursos (
  id uuid primary key,
  modalidade text not null
);
create table public.turmas (
  id uuid primary key,
  codigo text not null,
  nome text not null,
  curso_id uuid not null references public.cursos(id),
  polo_id uuid not null references public.polos(id),
  status text not null
);
create table public.matriculas (
  id uuid primary key,
  aluno_id uuid not null references public.parceiros(id),
  turma_id uuid not null references public.turmas(id),
  status text not null
);
create table public.contas_receber (
  id uuid primary key,
  polo_id uuid references public.polos(id),
  cliente_id uuid references public.parceiros(id),
  matricula_id uuid references public.matriculas(id),
  turma_id uuid references public.turmas(id),
  valor numeric(15,2) not null,
  valor_pago numeric(15,2),
  data_vencimento date not null,
  data_pagamento date,
  status text not null,
  descricao text,
  parcela_numero integer,
  tipo_lancamento text,
  gateway_status text,
  gateway_submission_status text,
  regra_financeira_dependencia_snapshot jsonb,
  regra_financeira_tecnica_snapshot jsonb,
  regra_financeira_plano_unico_snapshot jsonb,
  updated_at timestamptz not null default now()
);
create table public.usuarios_sistema (
  id uuid primary key,
  nome text not null,
  status text not null,
  auth_user_id uuid
);
create table public.finance_realtime_events (
  id bigint generated always as identity primary key,
  source_table text,
  event_type text,
  entity_id uuid,
  polo_id uuid,
  aluno_id uuid,
  turma_id uuid,
  created_at timestamptz not null default now()
);
create table internal_proesc.obligation_links (
  receivable_id uuid references public.contas_receber(id)
);
create table public.receivable_manual_settlements (
  receivable_id uuid references public.contas_receber(id),
  state text not null
);
create table public.banese_cancellation_outbox (
  receivable_id uuid references public.contas_receber(id),
  state text not null
);
create table public.matriculas_plano_financeiro_unico (
  matricula_id uuid primary key references public.matriculas(id),
  turma_id uuid not null,
  aluno_id uuid not null,
  regra_snapshot jsonb not null
);
create table public.turmas_plano_financeiro_unico (
  turma_id uuid primary key references public.turmas(id),
  desconto_pontualidade numeric not null,
  juros_atraso_percentual numeric not null,
  multa_atraso numeric not null,
  fingerprint text not null
);

create function public.is_gestor() returns boolean language sql stable as $function$
  select true;
$function$;
create function public.is_financeiro_for_polo(p_polo_id uuid)
returns boolean language sql stable as $function$
  select auth.uid() is not null and public.is_gestor()
    and p_polo_id = '00000000-0000-0000-0000-000000000010'::uuid;
$function$;
create function public.gestor_has_effective_financeiro_tab(p_tab text)
returns boolean language sql stable as $function$ select p_tab = 'receber'; $function$;
-- Replica ACL real: o helper granular só é chamado por RPCs/predicados definer.
revoke all on function public.gestor_has_effective_financeiro_tab(text)
  from public, anon, authenticated;
grant execute on function public.gestor_has_effective_financeiro_tab(text)
  to service_role;
create function public.gestor_has_any_global_module(p_modules text[])
returns boolean language sql stable as $function$ select 'financeiro' = any(p_modules); $function$;
create function public.gestor_has_any_module_for_polo(p_modules text[], p_polo_id uuid)
returns boolean language sql stable as $function$
  select p_polo_id = '00000000-0000-0000-0000-000000000010'::uuid
    and 'financeiro' = any(p_modules);
$function$;
create function public.emit_caixa_realtime_event()
returns trigger language plpgsql as $function$
begin
  insert into public.finance_realtime_events (
    source_table, event_type, entity_id, polo_id, turma_id
  ) values (tg_table_name, tg_op, new.id, new.polo_id, new.turma_id);
  return new;
end;
$function$;
create function public.data_vencimento_mensal(
  p_base date, p_day integer, p_month_offset integer
) returns date language sql immutable as $function$
  select (p_base + pg_catalog.make_interval(months => p_month_offset))::date;
$function$;
create function internal_academic.technical_financial_effective_rule(p_matricula_id uuid)
returns jsonb language sql stable as $function$
  select jsonb_build_object(
    'origem', 'TURMA',
    'identidade', jsonb_build_object(
      'efetivaFingerprint', repeat('1', 64)
    ),
    'encargos', jsonb_build_object(
      'descontoPontualidade', '5.00',
      'jurosAtrasoPercentual', '1.00',
      'multaAtrasoPercentual', '2.00'
    ),
    'aplicacao', jsonb_build_object(
      'mensalidade', jsonb_build_object('desconto', true, 'multaJuros', true)
    )
  ) where p_matricula_id = '00000000-0000-0000-0000-000000000300'::uuid;
$function$;
create function internal_academic.receivable_operation_capabilities(
  p_receivable public.contas_receber
) returns jsonb language sql stable as $function$
  select jsonb_build_object(
    'sourceSystem', case when p_receivable.gateway_submission_status = 'TEST_CONFLICT'
      then 'CONFLICT' else 'LOCAL' end,
    'canCancel', false
  );
$function$;

insert into public.empresas(id)
values ('00000000-0000-0000-0000-000000000001');
insert into public.polos(id, company_id, nome, status)
values ('00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001', 'Polo Sintetico', 'ATIVO');
insert into public.parceiros(id, nome, polo_id, status)
values ('00000000-0000-0000-0000-000000000100', 'Aluno Sintetico',
  '00000000-0000-0000-0000-000000000010', 'ATIVO');
insert into public.cursos(id, modalidade)
values ('00000000-0000-0000-0000-000000000150', 'TECNICO');
insert into public.turmas(id, codigo, nome, curso_id, polo_id, status)
values ('00000000-0000-0000-0000-000000000200', 'T-SQL', 'Turma Sintetica',
  '00000000-0000-0000-0000-000000000150',
  '00000000-0000-0000-0000-000000000010', 'ATIVO');
insert into public.matriculas(id, aluno_id, turma_id, status)
values ('00000000-0000-0000-0000-000000000300',
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000200', 'ATIVA');
insert into public.usuarios_sistema(id, nome, status, auth_user_id)
values ('00000000-0000-0000-0000-000000000600', 'Operador Sintetico', 'ATIVO',
  '00000000-0000-0000-0000-000000000500');
insert into public.contas_receber (
  id, polo_id, cliente_id, matricula_id, turma_id, valor, data_vencimento, status,
  descricao, parcela_numero, tipo_lancamento, regra_financeira_tecnica_snapshot
) values
  ('00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000300',
    '00000000-0000-0000-0000-000000000200', 100.00,
    (now() at time zone 'America/Maceio')::date - 30, 'VENCIDO',
    'Mensalidade sintetica 1', 1, 'PARCELA', jsonb_build_object(
      'tipoLancamento', 'MENSALIDADE', 'origem', 'TURMA', 'valorBase', '100.00',
      'descontoPontualidade', '5.00', 'jurosAtrasoPercentual', '1.00',
      'multaAtrasoValor', '10.00', 'aplicarMultaJuros', true
    )),
  ('00000000-0000-0000-0000-000000000402',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000300',
    '00000000-0000-0000-0000-000000000200', 200.00,
    (now() at time zone 'America/Maceio')::date + 30, 'PENDENTE',
    'Mensalidade sintetica 2', 2, 'PARCELA', jsonb_build_object(
      'tipoLancamento', 'MENSALIDADE', 'origem', 'TURMA', 'valorBase', '200.00',
      'descontoPontualidade', '5.00', 'jurosAtrasoPercentual', '1.00',
      'multaAtrasoValor', '10.00', 'aplicarMultaJuros', true
    )),
  ('00000000-0000-0000-0000-000000000403',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000300',
    '00000000-0000-0000-0000-000000000200', 300.00,
    (now() at time zone 'America/Maceio')::date + 60, 'PENDENTE',
    'Mensalidade sintetica fora da selecao', 3, 'PARCELA', jsonb_build_object(
      'tipoLancamento', 'MENSALIDADE', 'origem', 'TURMA', 'valorBase', '300.00',
      'descontoPontualidade', '5.00', 'jurosAtrasoPercentual', '1.00',
      'multaAtrasoValor', '10.00', 'aplicarMultaJuros', true
    )),
  ('00000000-0000-0000-0000-000000000404',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000300',
    '00000000-0000-0000-0000-000000000200', 400.00,
    (now() at time zone 'America/Maceio')::date + 90, 'PENDENTE',
    'Mensalidade sintetica bloqueada', 4, 'PARCELA', jsonb_build_object(
      'tipoLancamento', 'MENSALIDADE', 'origem', 'TURMA', 'valorBase', '400.00',
      'descontoPontualidade', '5.00', 'jurosAtrasoPercentual', '1.00',
      'multaAtrasoValor', '10.00', 'aplicarMultaJuros', true
    ));
update public.contas_receber set valor_pago = 10
where id = '00000000-0000-0000-0000-000000000404'::uuid;
