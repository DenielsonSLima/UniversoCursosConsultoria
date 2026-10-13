-- Local-only PGlite fixtures. No connection string or production data.
create role anon;
create role authenticated;
create role service_role;
create schema internal_academic;
create schema internal_financial_correction;
create schema test_contract;

create table public.cursos(id uuid primary key, modalidade text);
create table public.turmas(id uuid primary key, curso_id uuid, polo_id uuid,
  primeiro_vencimento_padrao date, test_rule jsonb);
create table public.matriculas(id uuid primary key, turma_id uuid, aluno_id uuid,
  data_primeiro_vencimento_financeiro date);
create table public.matriculas_tecnicas_financeiro_config(matricula_id uuid primary key,
  primeiro_vencimento date, override_ativo boolean, test_rule jsonb);
create table internal_academic.technical_transfer_entry_plans(matricula_id uuid primary key,
  initial_cycle integer, installment_count integer, first_due_date date,
  rule_snapshot jsonb, financial_plan jsonb);
create table internal_academic.technical_manual_cycle_runs(matricula_id uuid,
  turma_id uuid, cycle_number integer, state text, item_count integer,
  expected_installment_count integer, reviewed_items jsonb, receivable_ids uuid[],
  request_id uuid,
  primary key(matricula_id, cycle_number));
create table internal_academic.technical_financial_requests(request_id uuid primary key,
  operation text, response jsonb);
create table public.contas_receber(id uuid primary key, matricula_id uuid, turma_id uuid,
  origem_cronograma_id text, valor numeric, data_vencimento date, status text,
  regra_financeira_tecnica_snapshot jsonb, test_waived boolean default false,
  test_integrity boolean default true);
create table test_contract.scope(allowed_polo uuid, imported boolean default false,
  internal_transfer boolean default false);

-- Dependency boundaries: production authorizer/resolver/ledger guard have
-- their own contracts. Here the new loader is exercised against each outcome.
create function public.can_manage_secretaria_document(text, uuid)
returns boolean language sql stable as $$
  select exists(select 1 from test_contract.scope where allowed_polo=$2);
$$;
create function internal_academic.technical_financial_effective_rule(uuid)
returns jsonb language sql stable as $$
  select case when c.override_ativo then c.test_rule else t.test_rule end
  from public.matriculas m join public.turmas t on t.id=m.turma_id
  join public.matriculas_tecnicas_financeiro_config c on c.matricula_id=m.id where m.id=$1;
$$;
create function internal_academic.transfer_financial_origin(uuid)
returns uuid language sql stable as $$
  select case when internal_transfer then $1 else null end from test_contract.scope limit 1;
$$;
create function internal_academic.technical_imported_cycle_exists(uuid, integer)
returns boolean language sql stable as $$ select imported from test_contract.scope limit 1; $$;
create function internal_academic.assert_manual_cycle_reviewed_receivable(public.contas_receber)
returns void language plpgsql as $$ begin
  if not $1.test_integrity then raise exception 'Invalid canonical ledger proof' using errcode='23514'; end if;
end $$;
create function internal_financial_correction.local_waiver_complete(public.contas_receber)
returns boolean language sql stable as $$ select $1.test_waived; $$;

-- Minimal emitter for applying the actual guarded wiring migration.
create function public.preparar_emissao_contrato_aluno_base_secure(uuid,text,uuid[],text,uuid)
returns jsonb language plpgsql as $function$
declare v_target record; v_snapshot jsonb; v_rendered jsonb;
begin
    v_rendered := public.renderizar_contrato_aluno_documento(
      '{}'::jsonb, v_snapshot, null::text, null::timestamptz);
    return v_rendered;
end;
$function$;
