-- A transfer plan is admission intent, never evidence of a paid/imported C1.
begin;
create table internal_academic.technical_transfer_entry_plans (
  matricula_id uuid primary key references public.matriculas(id),
  transferencia_id uuid not null unique references public.transferencias_academicas(id),
  request_id uuid not null unique,
  actor_id uuid not null,
  initial_cycle integer not null check(initial_cycle in (1,2)),
  installment_count integer not null check(installment_count between 1 and 60),
  first_due_date date not null,
  cycle_two_reason text,
  financial_plan jsonb not null,
  rule_snapshot jsonb not null,
  rule_fingerprint text not null check(rule_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  check(initial_cycle=1 or (cycle_two_reason is not null and length(btrim(cycle_two_reason))>=10))
);
revoke all on internal_academic.technical_transfer_entry_plans from public,anon,authenticated,service_role;
create function internal_academic.guard_transfer_entry_plan_immutable()
returns trigger language plpgsql set search_path='' as $function$
begin raise exception 'O plano de entrada registrado é imutável; revise os itens antes da emissão.' using errcode='23514'; end;
$function$;
create trigger guard_transfer_entry_plan_immutable before update or delete
  on internal_academic.technical_transfer_entry_plans
  for each row execute function internal_academic.guard_transfer_entry_plan_immutable();

create function internal_academic.assert_transfer_entry_access(p_aluno_id uuid,p_turma_id uuid)
returns void language plpgsql stable security definer set search_path='' as $function$
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null
    or not coalesce(public.can_operate_turma_academics(p_turma_id),false)
    or not coalesce(public.gestor_has_tab('gestao','financeiro'),false)
    or not coalesce(public.gestor_has_financeiro_tab('receber'),false)
    or not exists(select 1 from public.turmas t join public.cursos c on c.id=t.curso_id
      where t.id=p_turma_id and t.status='EM_ANDAMENTO'
        and upper(c.modalidade) in ('TECNICO','TÉCNICO') and public.is_gestor_for_polo(t.polo_id))
    or not exists(select 1 from public.parceiros where id=p_aluno_id and tipo='Aluno')
  then raise exception 'Sem permissão acadêmica e financeira para esta entrada.' using errcode='42501'; end if;
end;
$function$;

create function internal_academic.transfer_entry_person_has_history(p_aluno_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  with enrollments as (select id from public.matriculas where aluno_id=p_aluno_id)
  select exists(select 1 from public.contas_receber where cliente_id=p_aluno_id
    or matricula_id in (select id from enrollments))
    or exists(select 1 from internal_proesc.enrollment_sources where matricula_id in (select id from enrollments))
    or exists(select 1 from internal_proesc.obligation_links where matricula_id in (select id from enrollments))
    or exists(select 1 from internal_proesc.enrollment_cycle_evidence where matricula_id in (select id from enrollments))
    or exists(select 1 from internal_academic.technical_external_cycle_coverage where matricula_id in (select id from enrollments))
    or exists(select 1 from internal_academic.technical_manual_cycle_runs where matricula_id in (select id from enrollments));
$function$;

create function internal_academic.normalize_transfer_entry_plan(p_rule jsonb,p_plan jsonb)
returns jsonb language plpgsql stable set search_path='' as $function$
declare v_cycle integer; v_count integer; v_due date; v_reason text;
  v_max integer:=(p_rule#>>'{cobranca,mensalidade,quantidade}')::integer;
  v_today date:=timezone('America/Maceio',now())::date;
begin
  if p_plan is null then return jsonb_build_object('cicloNumero',1,'quantidadeParcelas',v_max,
    'primeiroVencimento',p_rule->>'primeiroVencimentoSugerido','justificativaCiclo2',null); end if;
  if jsonb_typeof(p_plan) is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(p_plan) k
      where k not in ('cicloNumero','quantidadeParcelas','primeiroVencimento','justificativaCiclo2'))
    or jsonb_typeof(p_plan->'cicloNumero') is distinct from 'number'
    or jsonb_typeof(p_plan->'quantidadeParcelas') is distinct from 'number'
    or (p_plan->>'cicloNumero') !~ '^[12]$'
    or (p_plan->>'quantidadeParcelas') !~ '^[1-9][0-9]?$'
    or jsonb_typeof(p_plan->'primeiroVencimento') is distinct from 'string'
    or (p_plan->>'primeiroVencimento') !~ '^\d{4}-\d{2}-\d{2}$'
    or (p_plan ? 'justificativaCiclo2' and jsonb_typeof(p_plan->'justificativaCiclo2') not in ('string','null'))
  then raise exception 'Plano financeiro da entrada inválido.' using errcode='22023'; end if;
  v_cycle:=(p_plan->>'cicloNumero')::integer;
  v_count:=(p_plan->>'quantidadeParcelas')::integer;
  v_due:=(p_plan->>'primeiroVencimento')::date;
  v_reason:=nullif(btrim(p_plan->>'justificativaCiclo2'),'');
  if v_count>v_max or v_count>60 or v_due<v_today or v_due>v_today+1825
    or (v_cycle=2 and coalesce(length(v_reason),0)<10)
    or coalesce(length(v_reason),0)>1000 then
    raise exception 'Revise ciclo, parcelas restantes, vencimento e justificativa de entrada.' using errcode='22023';
  end if;
  return jsonb_build_object('cicloNumero',v_cycle,'quantidadeParcelas',v_count,
    'primeiroVencimento',v_due,'justificativaCiclo2',case when v_cycle=2 then v_reason end);
end;
$function$;

create function public.preview_recebimento_transferencia_tecnica_secure(
  p_aluno_id uuid,p_turma_destino_id uuid,p_financeiro jsonb default null
)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_rule jsonb; v_plan jsonb;
begin
  perform internal_academic.assert_transfer_entry_access(p_aluno_id,p_turma_destino_id);
  if internal_academic.transfer_entry_person_has_history(p_aluno_id) then
    raise exception 'Há histórico financeiro do aluno. A entrada exige conferência de continuidade antes de novas cobranças.' using errcode='23514';
  end if;
  v_rule:=internal_academic.technical_financial_rule(p_turma_destino_id);
  v_plan:=internal_academic.normalize_transfer_entry_plan(v_rule,p_financeiro);
  return jsonb_build_object('versao',1,'regraFingerprint',v_rule->>'fingerprint',
    'quantidadeMaxima',(v_rule#>>'{cobranca,mensalidade,quantidade}')::integer,
    'financeiro',v_plan,'regra',v_rule,'avisos',jsonb_build_array(
      'A entrada registra o plano. Nenhuma cobrança será criada antes da revisão e confirmação no Financeiro.',
      'O ciclo inicial nesta instituição não comprova pagamento ou cobertura na instituição de origem.'));
end;
$function$;
revoke all on function internal_academic.guard_transfer_entry_plan_immutable(),
  internal_academic.assert_transfer_entry_access(uuid,uuid),
  internal_academic.transfer_entry_person_has_history(uuid),
  internal_academic.normalize_transfer_entry_plan(jsonb,jsonb)
  from public,anon,authenticated,service_role;
revoke all on function public.preview_recebimento_transferencia_tecnica_secure(uuid,uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.preview_recebimento_transferencia_tecnica_secure(uuid,uuid,jsonb) to authenticated;
commit;
