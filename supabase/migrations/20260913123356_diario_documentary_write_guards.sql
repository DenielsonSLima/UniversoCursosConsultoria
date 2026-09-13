-- Claims permit exactly one immutable-source INSERT, not ordinary edit access.
create or replace function public.enforce_diario_notas_context()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and internal_academic.is_diario_documentary_write_claim(
      'diario_notas',to_jsonb(new)) then return new; end if;
  if not internal_academic.can_write_student_in_diary(
      new.turma_id,new.disciplina_id,null,new.aluno_id) then
    raise exception 'Nota sem matrícula ativa ou liberada para o diário.' using errcode='23514';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_diario_frequencia_context()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and internal_academic.is_diario_documentary_write_claim(
      'diario_frequencia',to_jsonb(new)) then return new; end if;
  if not internal_academic.can_write_student_in_diary(
      new.turma_id,new.disciplina_id,null,new.aluno_id)
    or not internal_academic.is_aula_in_academic_context(
      new.turma_id,new.disciplina_id,new.aula_id) then
    raise exception 'Frequência fora do contexto acadêmico válido.' using errcode='23514';
  end if;
  return new;
end;
$$;

-- Do not let a normal REST INSERT borrow provenance from a different enrollment.
create function internal_academic.guard_diario_documentary_provenance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and internal_academic.is_diario_documentary_write_claim(
      tg_table_name,to_jsonb(new)) then return new; end if;
  if new.origem_resultado_historico_id is not null
    or (tg_op = 'UPDATE' and old.origem_resultado_historico_id is not null) then
    raise exception 'A transcrição documental exige uma operação acadêmica auditada.' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function internal_academic.guard_diario_documentary_provenance()
  from public,anon,authenticated,service_role;
create trigger guard_diario_notas_documentary_provenance
  before insert or update on public.diario_notas
  for each row execute function internal_academic.guard_diario_documentary_provenance();
create trigger guard_diario_frequencia_documentary_provenance
  before insert or update on public.diario_frequencia
  for each row execute function internal_academic.guard_diario_documentary_provenance();

create or replace function internal_academic.guard_diario_historical_operational_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old_turma uuid; v_old_disciplina uuid; v_old_aluno uuid;
  v_new_turma uuid; v_new_disciplina uuid; v_new_aluno uuid;
  v_scope record;
begin
  if tg_op = 'INSERT' and internal_academic.is_diario_documentary_write_claim(
      tg_table_name,to_jsonb(new)) then return new; end if;
  if tg_op in ('UPDATE','DELETE') then
    v_old_turma := old.turma_id;
    v_old_disciplina := old.disciplina_id;
    v_old_aluno := old.aluno_id;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    v_new_turma := new.turma_id;
    v_new_disciplina := new.disciplina_id;
    v_new_aluno := new.aluno_id;
  end if;

  for v_scope in
    select distinct s.turma_id, s.disciplina_id
    from (values (v_old_turma, v_old_disciplina), (v_new_turma, v_new_disciplina))
      s(turma_id, disciplina_id)
    where s.turma_id is not null and s.disciplina_id is not null
    order by s.turma_id, s.disciplina_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'diario-history:' || v_scope.turma_id::text || ':' || v_scope.disciplina_id::text, 0
    ));
  end loop;

  if exists (
    select 1 from internal_academic.diario_resultados_importados h
    join (values (v_old_turma, v_old_disciplina, v_old_aluno),
      (v_new_turma, v_new_disciplina, v_new_aluno)) s(turma_id, disciplina_id, aluno_id)
      on s.turma_id = h.turma_id and s.disciplina_id = h.disciplina_id and s.aluno_id = h.aluno_id
    where h.ativo
  ) then
    raise exception 'Este aluno possui diário histórico nesta disciplina. Revise a fonte histórica antes de lançar dados regulares.'
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function internal_academic.guard_diario_historical_operational_write()
  from public, anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION internal_academic.start_dependency_on_diary_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_attempt record;
BEGIN
  IF TG_OP = 'INSERT' AND internal_academic.is_diario_documentary_write_claim(
      TG_TABLE_NAME,to_jsonb(NEW)) THEN RETURN NEW; END IF;
  FOR v_attempt IN
    SELECT
      tentativa.id,
      tentativa.componente_id
    FROM public.matricula_disciplina_tentativas tentativa
    JOIN public.matricula_componentes componente
      ON componente.id = tentativa.componente_id
    JOIN public.matriculas matricula
      ON matricula.id = componente.matricula_id
    WHERE tentativa.turma_id = NEW.turma_id
      AND tentativa.disciplina_id = NEW.disciplina_id
      AND matricula.aluno_id = NEW.aluno_id
      AND tentativa.status = 'LIBERADA'
    FOR UPDATE OF tentativa
  LOOP
    UPDATE public.matricula_disciplina_tentativas
    SET
      status = 'EM_CURSO',
      updated_at = now()
    WHERE id = v_attempt.id;

    UPDATE public.matricula_componentes
    SET
      status = 'EM_CURSO',
      updated_at = now()
    WHERE id = v_attempt.componente_id;

    INSERT INTO public.matricula_dependencia_eventos (
      componente_id,
      tentativa_id,
      evento,
      actor_id,
      payload
    ) VALUES (
      v_attempt.componente_id,
      v_attempt.id,
      'STATUS_ALTERADO',
      auth.uid(),
      jsonb_build_object(
        'statusAnterior',
        'LIBERADA',
        'statusNovo',
        'EM_CURSO',
        'origem',
        TG_TABLE_NAME
      )
    );
  END LOOP;

  RETURN NEW;
END;
$function$
;
