-- Run via MCP Supabase. Exercises current T42 states and previews without issuance.
begin read only;
do $verify_t42$
declare
  v_states jsonb;
  v_count integer;
  v_state jsonb;
  v_row record;
  v_preview jsonb;
begin
  select jsonb_agg(internal_academic.technical_manual_cycle_state(enrollment.id))
  into v_states from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  where class.codigo = 'ENF-T42-INT-MAT';
  if jsonb_array_length(v_states) <> 35 then
    raise exception 'O conjunto auditado T42 mudou; revisar a aplicação.';
  end if;
  select count(*) into v_count from jsonb_array_elements(v_states) state
  where state ->> 'estado' = 'ELEGIVEL' and state ->> 'podeGerar' = 'true'
    and state ->> 'proximoCicloNumero' = '2'
    and state ->> 'criterioElegibilidade' = 'HISTORICO_EXTERNO';
  if v_count <> 27 then raise exception 'Esperadas 27 matrículas elegíveis.'; end if;
  select count(*) into v_count from jsonb_array_elements(v_states) state
  where state ->> 'estado' in ('JA_GERADO', 'PROTEGIDO_EXISTENTE')
    and state ->> 'podeGerar' = 'false';
  if v_count <> 6 then raise exception 'Os seis ciclos emitidos devem permanecer protegidos.'; end if;
  select count(*) into v_count from jsonb_array_elements(v_states) state
  where state ->> 'estado' = 'BLOQUEADO'
    and state -> 'bloqueio' ->> 'codigo' = 'STATUS_ACADEMICO'
    and state ->> 'podeGerar' = 'false';
  if v_count <> 2 then raise exception 'As duas matrículas trancadas devem continuar bloqueadas.'; end if;

  for v_row in select enrollment.id from public.matriculas enrollment
    join public.turmas class on class.id = enrollment.turma_id
    where class.codigo = 'ENF-T42-INT-MAT'
  loop
    v_state := internal_academic.technical_manual_cycle_state(v_row.id);
    if v_state ->> 'estado' = 'ELEGIVEL' then
      v_preview := internal_academic.technical_manual_cycle_preview(
        v_row.id, 2, (timezone('America/Maceio', now()))::date + 30
      );
      if v_preview -> 'preview' ->> 'cicloNumero' is distinct from '2'
        or (v_preview -> 'preview' ->> 'quantidadeItens')::integer is distinct from 13
      then raise exception 'Prévia do segundo ciclo incompatível.'; end if;
    end if;
    begin
      perform internal_academic.technical_manual_cycle_preview(v_row.id, 1, current_date + 30);
      raise exception 'O primeiro ciclo não pode ser gerado.' using errcode = 'P9001';
    exception when invalid_parameter_value then null;
    end;
    begin
      perform internal_academic.technical_manual_cycle_preview(v_row.id, 3, current_date + 30);
      raise exception 'O terceiro ciclo não pode ser gerado.' using errcode = 'P9001';
    exception when invalid_parameter_value then null;
    end;
  end loop;
end;
$verify_t42$;


do $authorization_check$
declare v_id uuid;
begin
  select enrollment.id into v_id from public.matriculas enrollment
  join public.turmas class on class.id=enrollment.turma_id
  where class.codigo='ENF-T42-INT-MAT' limit 1;
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.jwt.claim.role', '', true);
  begin
    perform public.preview_ciclo_financeiro_tecnico_manual_secure(v_id, 2, current_date + 30);
    raise exception 'A prévia exige autorização financeira.' using errcode='P9001';
  exception when insufficient_privilege then null;
  end;
  if has_function_privilege('anon',
    'internal_academic.technical_manual_cycle_state(uuid)', 'EXECUTE')
  or has_function_privilege('authenticated',
    'internal_academic.technical_manual_cycle_policy_projection(uuid)', 'EXECUTE')
  then raise exception 'Helpers internos não podem ser expostos.'; end if;
end;
$authorization_check$;
rollback;
