-- Banco isolado para executar as migrations reais. Dependências externas ao
-- vínculo são reduzidas; isto não substitui o smoke da RPC no ambiente alvo.
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema internal_academic;
create schema extensions;
create extension pgcrypto with schema extensions;

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.actor', true), '')::uuid;
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('test.role', true), ''));
$$;
create function public.can_operate_turma_academics(uuid) returns boolean
language sql stable as $$
  select coalesce(current_setting('test.allowed', true) = 'true', false);
$$;
create function public.can_write_turma(uuid) returns boolean language sql stable as $$
  select public.can_operate_turma_academics($1);
$$;
create function public.gestor_has_tab(text, text) returns boolean language sql stable as $$
  select coalesce(current_setting('test.allowed', true) = 'true', false);
$$;

create table public.cursos (id uuid primary key, nome text, modalidade text);
create table public.turmas (
  id uuid primary key, curso_id uuid references public.cursos, polo_id uuid,
  nome text, status text, data_inicio date,
  valor_matricula numeric, valor_rematricula numeric, valor_parcela numeric,
  dia_vencimento_padrao integer, desconto_pontualidade numeric,
  juros_atraso numeric, multa_atraso numeric, multa_atraso_percentual numeric
);
create table public.parceiros (id uuid primary key, tipo text);
create table public.matriculas (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid references public.parceiros, turma_id uuid references public.turmas,
  status text, fluxo_operacional text default 'REGULAR',
  valor_matricula_individual numeric, valor_rematricula_individual numeric,
  valor_parcela_individual numeric, dia_vencimento_individual integer,
  data_primeiro_vencimento_financeiro date, financeiro_herdado boolean,
  gerar_cobranca_inicial boolean, gerar_cobranca_futura boolean, sincronizar_asaas boolean,
  desconto_pontualidade_individual numeric, juros_atraso_individual numeric,
  multa_atraso_individual numeric, multa_atraso_percentual_individual numeric,
  updated_at timestamptz default now(), unique (aluno_id, turma_id)
);
create table public.matriculas_tecnicas_financeiro_config (
  matricula_id uuid primary key references public.matriculas,
  turma_id uuid, aluno_id uuid, status_financeiro text, primeiro_vencimento date,
  ativar_em timestamptz, regra_revisao integer, regra_fingerprint text,
  titulo_matricula_id uuid, last_error text
);
create table public.contas_receber (
  id uuid primary key default gen_random_uuid(), matricula_id uuid,
  status text, valor numeric, valor_pago numeric, referencia_bancaria text
);
create table public.matricula_movimentacoes (
  id uuid primary key default gen_random_uuid(), matricula_id uuid, aluno_id uuid,
  tipo text check (tipo in ('MATRICULA', 'REATIVACAO')), status_anterior text,
  status_novo text, turma_destino_id uuid, motivo text, responsavel_id uuid
);
create table internal_academic.transition_authorizations (
  transaction_id text, backend_pid integer, entity text, record_id uuid, new_status text
);
create table internal_academic.technical_financial_requests (
  request_id uuid primary key, operation text, actor_id uuid, payload_hash text, response jsonb
);
create function internal_academic.authorize_enrollment_status(uuid, text)
returns void language sql as $$
  insert into internal_academic.transition_authorizations values (
    pg_current_xact_id()::text, pg_backend_pid(), 'MATRICULA_STATUS', $1, $2);
$$;
create function internal_academic.authorize_enrollment_upsert(uuid, uuid, text)
returns void language sql as $$
  insert into internal_academic.transition_authorizations values (
    pg_current_xact_id()::text, pg_backend_pid(), 'MATRICULA_INSERT', $2, $3);
$$;
create function internal_academic.authorize_regular_technical_admission(uuid, uuid, uuid, text)
returns void language plpgsql as $$ begin return; end; $$;
create function internal_academic.resolve_responsavel(uuid default null)
returns uuid language sql as $$
  select '00000000-0000-4000-8000-000000000099'::uuid;
$$;
create function public.assert_aluno_sem_matricula_curso_duplicada(uuid, uuid, uuid)
returns void language plpgsql as $$ begin return; end; $$;
create function public.sync_aluno_polo_scope(uuid, uuid)
returns void language plpgsql as $$ begin return; end; $$;
create function public.registrar_turma_financeiro_auditoria(uuid, text, jsonb, text)
returns void language plpgsql as $$ begin return; end; $$;
create function internal_academic.assert_expected_technical_rule(uuid, integer, text)
returns jsonb language sql as $$
  select jsonb_build_object('revisao', 1, 'fingerprint', 'fixture',
    'primeiroVencimentoSugerido', current_date + 10);
$$;
create function internal_academic.normalize_technical_first_due(date, date)
returns date language sql as $$ select greatest($1, $2); $$;
create function internal_academic.technical_financial_row(uuid)
returns jsonb language sql as $$
  select jsonb_build_object('matriculaId', m.id, 'statusAcademico', m.status,
    'situacaoFinanceira', f.status_financeiro)
  from public.matriculas m
  join public.matriculas_tecnicas_financeiro_config f on f.matricula_id = m.id
  where m.id = $1;
$$;

-- A projeção financeira da ativação só cria configuração ausente, como o
-- helper de produção; não gera conta a receber nem muda configuração existente.
create function internal_academic.ensure_technical_financial_pending(uuid)
returns boolean language plpgsql as $$
begin
  insert into public.matriculas_tecnicas_financeiro_config
    (matricula_id, turma_id, aluno_id, status_financeiro)
  select id, turma_id, aluno_id, 'PENDENTE' from public.matriculas where id = $1
  on conflict do nothing;
  return found;
end;
$$;
create function public.criar_financeiro_ao_matricular()
returns trigger language plpgsql as $$
begin
  perform internal_academic.ensure_technical_financial_pending(new.id);
  return new;
end;
$$;
create trigger criar_financeiro_ao_matricular_trigger
after insert or update of status on public.matriculas
for each row when (new.status = 'ATIVO')
execute function public.criar_financeiro_ao_matricular();

create table public.documentos_aluno (id uuid primary key, aluno_id uuid, versao_atual_id uuid);
create table public.documentos_aluno_versoes (id uuid primary key, status text);
create table public.documentos_aluno_recebimentos_sem_anexo (documento_id uuid, revogado_em timestamptz);
create table public.documentos_aluno_lotes (aluno_id uuid, status text, criado_em timestamptz);
create table public.usuarios_sistema (auth_user_id uuid, nome text);
create table public.matricula_liberacoes_diario (
  id uuid primary key, matricula_id uuid, motivo text, liberado_em timestamptz,
  liberado_por uuid, revogado_em timestamptz
);
create function public.documento_aluno_regra_estado(uuid)
returns text language sql stable as $$ select 'OBRIGATORIO'::text; $$;
create function public.matricula_tecnica_pagamento_confirmado(uuid)
returns boolean language sql stable as $$
  select exists(select 1 from public.contas_receber where matricula_id=$1 and status='PAGO');
$$;
create function public.matricula_possui_vinculo_financeiro(uuid)
returns boolean language sql stable as $$
  select exists(select 1 from public.contas_receber where matricula_id=$1);
$$;
