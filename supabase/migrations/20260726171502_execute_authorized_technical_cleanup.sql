-- Limpeza física excepcional, autorizada pelo responsável em 2026-07-26.
-- O conjunto foi congelado e arquivado em maintenance_archive antes deste passo.

alter table public.aluno_vacinas
  disable trigger guard_aluno_vacinas_trigger;
alter table public.matriculas_estagios
  disable trigger enforce_estagio_operacional_trigger;
alter table public.matricula_movimentacoes
  disable trigger protect_technical_audit_delete_movimentacao;
alter table public.transferencias_academicas
  disable trigger protect_technical_audit_delete_transferencia;
alter table public.fechamentos_academicos
  disable trigger protect_technical_closing_audit_trigger;
alter table public.matriculas
  disable trigger protect_technical_enrollment_delete_trigger;
alter table public.diario_frequencia
  disable trigger bloquear_diario_frequencia_periodo_fechado;
alter table public.diario_frequencia
  disable trigger bloquear_frequencia_por_diario;
alter table public.diario_notas
  disable trigger bloquear_diario_notas_periodo_fechado;
alter table public.diario_notas
  disable trigger bloquear_notas_por_diario;
alter table public.diario_observacoes
  disable trigger bloquear_diario_observacoes_periodo_fechado;
alter table public.diario_observacoes
  disable trigger bloquear_observacoes_por_diario;
alter table public.diario_praticas
  disable trigger bloquear_diario_praticas_periodo_fechado;
alter table public.diario_praticas
  disable trigger bloquear_praticas_por_diario;
alter table public.aulas_turma
  disable trigger bloquear_aulas_turma_por_diario;
alter table public.atividades_extra_classe
  disable trigger bloquear_atividades_por_diario;
alter table public.atividades_extra_classe
  disable trigger prevent_atividade_extra_delete_with_responses_trigger;
alter table public.periodos_letivos
  disable trigger protect_technical_period_structure_trigger;
alter table public.turmas_disciplinas
  disable trigger protect_technical_class_discipline_binding_trigger;
alter table public.turmas
  disable trigger protect_technical_turma_delete_trigger;

do $cleanup$
declare
  v_run_id uuid;
  v_baseline jsonb;
  v_ead_after jsonb;
  v_documentos_validacao integer := 0;
  v_movimentacoes integer := 0;
  v_transferencias integer := 0;
  v_certificados integer := 0;
  v_fechamentos integer := 0;
  v_matriculas integer := 0;
  v_alunos integer := 0;
  v_turmas integer := 0;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  select r.id, r.baseline
    into v_run_id, v_baseline
  from maintenance_archive.cleanup_runs r
  where r.label = 'limpeza_tecnica_antes_turma_40_20260726'
    and r.completed_at is null
  order by r.created_at desc
  limit 1
  for update;

  if v_run_id is null then
    raise exception 'Manifesto de limpeza não encontrado ou já concluído.';
  end if;

  if (
    select count(*)
    from maintenance_archive.cleanup_rows r
    where r.run_id = v_run_id
  ) <> 21 then
    raise exception 'Backup incompleto: quantidade inesperada de lotes.';
  end if;

  if (
    select coalesce(sum((r.source_key ->> 'count')::integer), 0)
    from maintenance_archive.cleanup_rows r
    where r.run_id = v_run_id
  ) <> 2915 then
    raise exception 'Backup incompleto: quantidade inesperada de registros.';
  end if;

  if (
    select count(*)
    from public.parceiros p
    where p.id in (
      select (item ->> 'id')::uuid
      from maintenance_archive.cleanup_rows r
      cross join lateral jsonb_array_elements(r.payload) item
      where r.run_id = v_run_id
        and r.source_table = 'parceiros'
    )
  ) <> 171 then
    raise exception 'Manifesto de alunos divergiu do banco.';
  end if;

  if (
    select count(*)
    from public.matriculas m
    where m.id in (
      select (item ->> 'id')::uuid
      from maintenance_archive.cleanup_rows r
      cross join lateral jsonb_array_elements(r.payload) item
      where r.run_id = v_run_id
        and r.source_table = 'matriculas'
    )
  ) <> 173 then
    raise exception 'Manifesto de matrículas divergiu do banco.';
  end if;

  if (
    select count(*)
    from public.turmas t
    where t.id in (
      select (item ->> 'id')::uuid
      from maintenance_archive.cleanup_rows r
      cross join lateral jsonb_array_elements(r.payload) item
      where r.run_id = v_run_id
        and r.source_table = 'turmas'
    )
  ) <> 8 then
    raise exception 'Manifesto de turmas divergiu do banco.';
  end if;

  if exists (
    select 1
    from maintenance_archive.cleanup_rows r
    cross join lateral jsonb_array_elements(r.payload) item
    join public.parceiros p on p.id = (item ->> 'id')::uuid
    join public.matriculas m on m.aluno_id = p.id
    join public.turmas t on t.id = m.turma_id
    join public.cursos c on c.id = t.curso_id
    where r.run_id = v_run_id
      and r.source_table = 'parceiros'
      and c.modalidade <> 'TECNICO'
  ) then
    raise exception 'Abortado: aluno alvo adquiriu vínculo EAD ou Superior.';
  end if;

  if exists (
    select 1
    from maintenance_archive.cleanup_rows r
    cross join lateral jsonb_array_elements(r.payload) item
    join public.matriculas m on m.id = (item ->> 'id')::uuid
    join public.turmas t on t.id = m.turma_id
    join public.cursos c on c.id = t.curso_id
    where r.run_id = v_run_id
      and r.source_table = 'matriculas'
      and (
        c.modalidade <> 'TECNICO'
        or t.id = 'c735d106-cd41-474e-adb4-7e71ea5f3aca'::uuid
      )
  ) then
    raise exception 'Abortado: matrícula fora do escopo técnico autorizado.';
  end if;

  if exists (
    select 1
    from maintenance_archive.cleanup_rows r
    cross join lateral jsonb_array_elements(r.payload) item
    join public.turmas t on t.id = (item ->> 'id')::uuid
    join public.cursos c on c.id = t.curso_id
    where r.run_id = v_run_id
      and r.source_table = 'turmas'
      and (
        c.modalidade <> 'TECNICO'
        or coalesce(
          (regexp_match(t.codigo, '-T([0-9]+)-'))[1]::integer,
          0
        ) >= 40
      )
  ) then
    raise exception 'Abortado: turma preservada entrou no conjunto de exclusão.';
  end if;

  if exists (
    select 1
    from public.contas_receber cr
    where cr.cliente_id in (
      select (item ->> 'id')::uuid
      from maintenance_archive.cleanup_rows r
      cross join lateral jsonb_array_elements(r.payload) item
      where r.run_id = v_run_id and r.source_table = 'parceiros'
    )
      or cr.matricula_id in (
        select (item ->> 'id')::uuid
        from maintenance_archive.cleanup_rows r
        cross join lateral jsonb_array_elements(r.payload) item
        where r.run_id = v_run_id and r.source_table = 'matriculas'
      )
      or cr.turma_id in (
        select (item ->> 'id')::uuid
        from maintenance_archive.cleanup_rows r
        cross join lateral jsonb_array_elements(r.payload) item
        where r.run_id = v_run_id and r.source_table = 'turmas'
      )
  ) then
    raise exception 'Abortado: o conjunto passou a possuir contas a receber.';
  end if;

  if exists (
    select 1
    from auth.users u
    where lower(u.email) in (
      select lower(p.email)
      from public.parceiros p
      where p.id in (
        select (item ->> 'id')::uuid
        from maintenance_archive.cleanup_rows r
        cross join lateral jsonb_array_elements(r.payload) item
        where r.run_id = v_run_id and r.source_table = 'parceiros'
      )
        and p.email is not null
    )
  ) then
    raise exception 'Abortado: aluno alvo adquiriu conta Auth.';
  end if;

  delete from public.certificados_academicos x
  where x.id in (
    select (item ->> 'id')::uuid
    from maintenance_archive.cleanup_rows r
    cross join lateral jsonb_array_elements(r.payload) item
    where r.run_id = v_run_id
      and r.source_table = 'certificados_academicos'
  );
  get diagnostics v_certificados = row_count;

  delete from public.documentos_validacao x
  where x.id in (
    select (item ->> 'id')::uuid
    from maintenance_archive.cleanup_rows r
    cross join lateral jsonb_array_elements(r.payload) item
    where r.run_id = v_run_id
      and r.source_table = 'documentos_validacao'
  );
  get diagnostics v_documentos_validacao = row_count;

  delete from public.matricula_movimentacoes x
  where x.id in (
    select (item ->> 'id')::uuid
    from maintenance_archive.cleanup_rows r
    cross join lateral jsonb_array_elements(r.payload) item
    where r.run_id = v_run_id
      and r.source_table = 'matricula_movimentacoes'
  );
  get diagnostics v_movimentacoes = row_count;

  delete from public.transferencias_academicas x
  where x.id in (
    select (item ->> 'id')::uuid
    from maintenance_archive.cleanup_rows r
    cross join lateral jsonb_array_elements(r.payload) item
    where r.run_id = v_run_id
      and r.source_table = 'transferencias_academicas'
  );
  get diagnostics v_transferencias = row_count;

  delete from public.fechamentos_academicos x
  where x.id in (
    select (item ->> 'id')::uuid
    from maintenance_archive.cleanup_rows r
    cross join lateral jsonb_array_elements(r.payload) item
    where r.run_id = v_run_id
      and r.source_table = 'fechamentos_academicos'
  );
  get diagnostics v_fechamentos = row_count;

  delete from public.matriculas x
  where x.id in (
    select (item ->> 'id')::uuid
    from maintenance_archive.cleanup_rows r
    cross join lateral jsonb_array_elements(r.payload) item
    where r.run_id = v_run_id
      and r.source_table = 'matriculas'
  );
  get diagnostics v_matriculas = row_count;

  delete from public.parceiros x
  where x.id in (
    select (item ->> 'id')::uuid
    from maintenance_archive.cleanup_rows r
    cross join lateral jsonb_array_elements(r.payload) item
    where r.run_id = v_run_id
      and r.source_table = 'parceiros'
  );
  get diagnostics v_alunos = row_count;

  delete from public.turmas x
  where x.id in (
    select (item ->> 'id')::uuid
    from maintenance_archive.cleanup_rows r
    cross join lateral jsonb_array_elements(r.payload) item
    where r.run_id = v_run_id
      and r.source_table = 'turmas'
  );
  get diagnostics v_turmas = row_count;

  if (v_matriculas, v_alunos, v_turmas)
    is distinct from (173, 171, 8) then
    raise exception
      'Resultado principal inesperado: matrículas %, alunos %, turmas %.',
      v_matriculas, v_alunos, v_turmas;
  end if;

  if exists (
    select 1
    from public.matriculas m
    join public.turmas t on t.id = m.turma_id
    join public.cursos c on c.id = t.curso_id
    where c.modalidade = 'TECNICO'
      and t.id <> 'c735d106-cd41-474e-adb4-7e71ea5f3aca'::uuid
  ) then
    raise exception 'Validação falhou: restou matrícula técnica fora da T40.';
  end if;

  if (
    select count(*)
    from public.matriculas m
    where m.turma_id = 'c735d106-cd41-474e-adb4-7e71ea5f3aca'::uuid
  ) <> 43 then
    raise exception 'Validação falhou: a T40 não manteve suas 43 matrículas.';
  end if;

  if (
    select count(*)
    from public.turmas t
    join public.cursos c on c.id = t.curso_id
    where c.modalidade = 'TECNICO'
  ) <> 6 then
    raise exception 'Validação falhou: quantidade de turmas técnicas preservadas.';
  end if;

  if (
    select count(*)
    from public.parceiros p
    where p.id in (
      select m.aluno_id
      from public.matriculas m
      where m.turma_id = 'c735d106-cd41-474e-adb4-7e71ea5f3aca'::uuid
      union
      select unnest(array[
        'bbc7fadc-02f3-4d95-ae81-afb9ac7ac305'::uuid,
        '210247bc-6212-4388-92cc-b63baf865e16'::uuid,
        '7145349d-6145-4b9b-95f7-35a418449a1d'::uuid,
        '084ac56d-ea10-41ba-b6cb-f3d9b1270f9f'::uuid
      ])
    )
  ) <> 47 then
    raise exception 'Validação falhou: cadastro preservado ausente.';
  end if;

  select jsonb_build_object(
    'ead_cursos', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(
          string_agg(to_jsonb(x)::text, '|' order by id::text),
          ''
        ))
      )
      from public.cursos x
      where modalidade = 'EAD'
    ),
    'ead_turmas', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(
          string_agg(to_jsonb(x)::text, '|' order by id::text),
          ''
        ))
      )
      from public.turmas x
      where curso_id in (
        select id from public.cursos where modalidade = 'EAD'
      )
    ),
    'ead_matriculas', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(
          string_agg(to_jsonb(x)::text, '|' order by id::text),
          ''
        ))
      )
      from public.matriculas x
      where turma_id in (
        select t.id
        from public.turmas t
        join public.cursos c on c.id = t.curso_id
        where c.modalidade = 'EAD'
      )
    ),
    'ead_progresso', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(
          string_agg(to_jsonb(x)::text, '|' order by id::text),
          ''
        ))
      )
      from public.ead_aluno_progresso x
    )
  ) into v_ead_after;

  if v_ead_after -> 'ead_cursos'
      is distinct from v_baseline -> 'ead_cursos'
    or v_ead_after -> 'ead_turmas'
      is distinct from v_baseline -> 'ead_turmas'
    or v_ead_after -> 'ead_matriculas'
      is distinct from v_baseline -> 'ead_matriculas'
    or v_ead_after -> 'ead_progresso'
      is distinct from v_baseline -> 'ead_progresso' then
    raise exception 'Validação falhou: uma sentinela EAD foi alterada.';
  end if;

  update maintenance_archive.cleanup_runs
  set result = jsonb_build_object(
        'deleted', jsonb_build_object(
          'alunos', v_alunos,
          'matriculas', v_matriculas,
          'turmas', v_turmas,
          'documentos_validacao', v_documentos_validacao,
          'movimentacoes', v_movimentacoes,
          'transferencias', v_transferencias,
          'certificados', v_certificados,
          'fechamentos', v_fechamentos
        ),
        'preserved', jsonb_build_object(
          'turma40_matriculas', 43,
          'alunos_manifesto', 47,
          'turmas_tecnicas', 6
        ),
        'ead_after', v_ead_after
      ),
      completed_at = now()
  where id = v_run_id;
end;
$cleanup$;

alter table public.turmas
  enable trigger protect_technical_turma_delete_trigger;
alter table public.turmas_disciplinas
  enable trigger protect_technical_class_discipline_binding_trigger;
alter table public.periodos_letivos
  enable trigger protect_technical_period_structure_trigger;
alter table public.atividades_extra_classe
  enable trigger prevent_atividade_extra_delete_with_responses_trigger;
alter table public.atividades_extra_classe
  enable trigger bloquear_atividades_por_diario;
alter table public.aulas_turma
  enable trigger bloquear_aulas_turma_por_diario;
alter table public.diario_praticas
  enable trigger bloquear_praticas_por_diario;
alter table public.diario_praticas
  enable trigger bloquear_diario_praticas_periodo_fechado;
alter table public.diario_observacoes
  enable trigger bloquear_observacoes_por_diario;
alter table public.diario_observacoes
  enable trigger bloquear_diario_observacoes_periodo_fechado;
alter table public.diario_notas
  enable trigger bloquear_notas_por_diario;
alter table public.diario_notas
  enable trigger bloquear_diario_notas_periodo_fechado;
alter table public.diario_frequencia
  enable trigger bloquear_frequencia_por_diario;
alter table public.diario_frequencia
  enable trigger bloquear_diario_frequencia_periodo_fechado;
alter table public.matriculas
  enable trigger protect_technical_enrollment_delete_trigger;
alter table public.fechamentos_academicos
  enable trigger protect_technical_closing_audit_trigger;
alter table public.transferencias_academicas
  enable trigger protect_technical_audit_delete_transferencia;
alter table public.matricula_movimentacoes
  enable trigger protect_technical_audit_delete_movimentacao;
alter table public.matriculas_estagios
  enable trigger enforce_estagio_operacional_trigger;
alter table public.aluno_vacinas
  enable trigger guard_aluno_vacinas_trigger;
