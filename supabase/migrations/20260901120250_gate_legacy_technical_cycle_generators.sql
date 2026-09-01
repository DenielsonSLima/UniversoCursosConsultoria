begin;

-- Preserva a implementação automática anterior para turmas ainda não
-- migradas, mas retira seu acesso direto. A API pública passa primeiro pela
-- política manual e retorna sem efeitos para qualquer opt-in.
alter function public.gerar_parcelas_matricula(uuid)
  rename to generate_technical_installments_automatic_legacy;
alter function public.generate_technical_installments_automatic_legacy(uuid)
  set schema internal_academic;

revoke all on function
  internal_academic.generate_technical_installments_automatic_legacy(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.gerar_parcelas_matricula(
  p_matricula_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_manual boolean;
begin
  select exists (
    select 1
    from public.matriculas enrollment
    join public.turmas class on class.id = enrollment.turma_id
    join public.cursos course on course.id = class.curso_id
    join internal_academic.technical_manual_cycle_policies policy
      on policy.turma_id = class.id
     and policy.active
     and policy.generation_mode = 'MANUAL'
    where enrollment.id = p_matricula_id
      and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'TÉCNICO')
  ) into v_manual;

  if v_manual then
    return 0;
  end if;
  return internal_academic.generate_technical_installments_automatic_legacy(
    p_matricula_id
  );
end;
$function$;

revoke all on function public.gerar_parcelas_matricula(uuid)
  from public, anon, authenticated;
grant execute on function public.gerar_parcelas_matricula(uuid)
  to service_role;

alter function public.gerar_rematricula_apos_parcelas(uuid)
  rename to generate_technical_reenrollment_automatic_legacy;
alter function public.generate_technical_reenrollment_automatic_legacy(uuid)
  set schema internal_academic;

revoke all on function
  internal_academic.generate_technical_reenrollment_automatic_legacy(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.gerar_rematricula_apos_parcelas(
  p_matricula_id uuid
)
returns public.contas_receber
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_manual boolean;
begin
  select exists (
    select 1
    from public.matriculas enrollment
    join public.turmas class on class.id = enrollment.turma_id
    join public.cursos course on course.id = class.curso_id
    join internal_academic.technical_manual_cycle_policies policy
      on policy.turma_id = class.id
     and policy.active
     and policy.generation_mode = 'MANUAL'
    where enrollment.id = p_matricula_id
      and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'TÉCNICO')
  ) into v_manual;

  if v_manual then
    return null;
  end if;
  return internal_academic.generate_technical_reenrollment_automatic_legacy(
    p_matricula_id
  );
end;
$function$;

revoke all on function public.gerar_rematricula_apos_parcelas(uuid)
  from public, anon, authenticated;
grant execute on function public.gerar_rematricula_apos_parcelas(uuid)
  to service_role;

comment on function public.gerar_parcelas_matricula(uuid) is
  'Compatibilidade automática legada; política MANUAL sempre retorna sem criar cobranças.';
comment on function public.gerar_rematricula_apos_parcelas(uuid) is
  'Compatibilidade automática legada; política MANUAL sempre retorna sem criar cobranças.';

create or replace function public.processar_ativacoes_financeiras_tecnicas_agendadas(
  p_limite integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item record;
  v_processed integer := 0;
  v_failed integer := 0;
  v_row jsonb;
begin
  if p_limite not between 1 and 500 then
    raise exception 'Limite inválido.' using errcode = '22023';
  end if;
  if not pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
    'scheduled-technical-finance-worker', 0
  )) then
    return jsonb_build_object(
      'processados', 0, 'falhas', 0, 'ocupado', true
    );
  end if;
  perform set_config('app.technical_financial_request_id', '', true);
  perform set_config('app.technical_financial_origin', 'SCHEDULED_WORKER', true);

  for v_item in
    select config.matricula_id
    from public.matriculas_tecnicas_financeiro_config config
    join public.matriculas enrollment on enrollment.id = config.matricula_id
    where config.status_financeiro = 'AGENDADA'
      and config.ativar_em <= now()
      and not exists (
        select 1
        from internal_academic.technical_manual_cycle_policies policy
        where policy.turma_id = enrollment.turma_id
          and policy.active
          and policy.generation_mode = 'MANUAL'
      )
    order by config.ativar_em, config.matricula_id
    limit p_limite
  loop
    begin
      v_row := internal_academic.activate_technical_financial_enrollment(
        v_item.matricula_id, 'AGORA', null, true
      );
      if v_row -> 'financeiro' ->> 'status' = 'GERADA' then
        v_processed := v_processed + 1;
      else
        v_failed := v_failed + 1;
      end if;
    exception when others then
      v_failed := v_failed + 1;
      update public.matriculas_tecnicas_financeiro_config config
      set status_financeiro = 'PENDENTE', ativar_em = null,
          last_error = pg_catalog.left(sqlerrm, 500),
          tentativas = config.tentativas + 1
      where config.matricula_id = v_item.matricula_id;
    end;
  end loop;
  return jsonb_build_object(
    'processados', v_processed, 'falhas', v_failed, 'ocupado', false
  );
end;
$function$;

revoke all on function public.processar_ativacoes_financeiras_tecnicas_agendadas(
  integer
) from public, anon, authenticated, service_role;
grant execute on function public.processar_ativacoes_financeiras_tecnicas_agendadas(
  integer
) to service_role;

notify pgrst, 'reload schema';
commit;
