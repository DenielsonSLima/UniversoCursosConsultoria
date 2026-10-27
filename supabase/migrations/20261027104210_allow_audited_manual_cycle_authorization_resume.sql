-- Retomar a mesma operação por outro gestor autorizado preserva o consentimento
-- original. Conteúdo ou identidade divergente continuam bloqueados.
-- Não altera recebíveis, títulos, estados remotos, chaves ou grants.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';

do $migration$
declare
  v_function regprocedure :=
    'public.authorize_technical_manual_receivable_issuance_secure(uuid,uuid)'::regprocedure;
  v_definition text;
  v_expected text;
  v_metadata jsonb;
  v_old text := $old$
    if v_existing.authorized_by is distinct from v_actor
      or v_existing.receivable_fingerprint is distinct from v_fingerprint
    then
      raise exception 'Replay de autorização incompatível.'
        using errcode = 'PT422';
    end if;
$old$;
  v_new text := $new$
    if v_existing.receivable_id is distinct from v_receivable.id
      or v_existing.matricula_id is distinct from v_run.matricula_id
      or v_existing.turma_id is distinct from v_run.turma_id
      or v_existing.cycle_number is distinct from v_run.cycle_number
      or v_receivable.regra_financeira_tecnica_snapshot
        -> 'cicloManual' ->> 'requestId' is distinct from v_run.request_id::text
    then
      raise exception 'A autorização não corresponde à mesma operação do ciclo. A emissão exige revisão.'
        using errcode = 'PT422',
          detail = 'CYCLE_AUTHORIZATION_CONTEXT_MISMATCH';
    end if;
    if v_existing.receivable_fingerprint is distinct from v_fingerprint then
      raise exception 'Os dados da cobrança diferem da autorização original. Revise a operação antes de retomar.'
        using errcode = 'PT422',
          detail = 'CYCLE_AUTHORIZATION_FINGERPRINT_MISMATCH';
    end if;

    -- O consentimento original permanece imutável. O gestor atual já passou
    -- por RBAC, polo, situação acadêmica e prova canônica do recebível.
    -- A mesma request não cria outra operação e não muda seu estado bancário.
    if v_existing.authorized_by is distinct from v_actor and not exists (
      select 1 from public.historico_turma_financeira audit
      where audit.matricula_id = v_run.matricula_id
        and audit.evento = 'CICLO_TECNICO_MANUAL_RETOMADA_OUTRO_GESTOR'
        and audit.regra ->> 'receivableId' = p_receivable_id::text
        and audit.regra ->> 'authorizationRequestId' = p_request_id::text
        and audit.regra ->> 'cycleRequestId' = v_run.request_id::text
        and audit.regra ->> 'resumedBy' = v_actor::text
    ) then
      perform public.registrar_turma_financeiro_auditoria(
        v_run.matricula_id,
        'CICLO_TECNICO_MANUAL_RETOMADA_OUTRO_GESTOR',
        jsonb_build_object(
          'receivableId', p_receivable_id,
          'cycleNumber', v_run.cycle_number,
          'cycleRequestId', v_run.request_id,
          'authorizationRequestId', p_request_id,
          'originalAuthorizedBy', v_existing.authorized_by,
          'resumedBy', v_actor,
          'fingerprint', v_fingerprint
        ),
        'Retomada da mesma operação por gestor autorizado; consentimento e identidade bancária preservados.'
      );
    end if;
$new$;
  v_old_access text := $old_access$
  if not (
    public.gestor_has_financeiro_tab('receber')
    and public.is_gestor_for_polo(v_receivable.polo_id)
  ) then
$old_access$;
  v_new_access text := $new_access$
  if not coalesce((
    public.gestor_has_financeiro_tab('receber')
    and public.is_gestor_for_polo(v_receivable.polo_id)
  ), false) then
$new_access$;
begin
  select pg_catalog.pg_get_functiondef(v_function), to_jsonb(p) - 'prosrc'
    into strict v_definition, v_metadata
  from pg_catalog.pg_proc p where p.oid = v_function;

  -- Comparação exata e única: drift interrompe a migration inteira.
  v_old := trim(both E'\n' from v_old);
  v_new := trim(both E'\n' from v_new);
  v_old_access := trim(both E'\n' from v_old_access);
  v_new_access := trim(both E'\n' from v_new_access);
  if (length(v_definition) - length(replace(v_definition, v_old, '')))
      <> length(v_old)
    or (length(v_definition) - length(replace(v_definition, v_old_access, '')))
      <> length(v_old_access)
    or v_metadata ->> 'prosecdef' is distinct from 'true'
  then
    raise exception 'Unexpected manual-cycle authorization definition; no change applied.'
      using errcode = '23514';
  end if;

  v_expected := replace(replace(v_definition, v_old, v_new),
    v_old_access, v_new_access);
  execute v_expected;

  select pg_catalog.pg_get_functiondef(v_function) into strict v_definition;
  if v_definition is distinct from v_expected
    or v_metadata is distinct from (
      select to_jsonb(p) - 'prosrc' from pg_catalog.pg_proc p
      where p.oid = v_function
    )
  then
    raise exception 'Unexpected authorization metadata or ACL change.'
      using errcode = '23514';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
commit;

