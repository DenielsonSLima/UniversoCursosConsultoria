-- Keep the existing authoritative implementations intact, but expose them
-- through Gestao-scoped wrappers. This avoids changing academic calculations.

alter function public.abrir_periodo_letivo(uuid, uuid)
  set schema internal_academic;
alter function internal_academic.abrir_periodo_letivo(uuid, uuid)
  rename to p1_abrir_periodo_letivo_20260719;

alter function public.alterar_status_turma_tecnica(uuid, text, uuid)
  set schema internal_academic;
alter function internal_academic.alterar_status_turma_tecnica(uuid, text, uuid)
  rename to p1_alterar_status_turma_tecnica_20260719;

alter function public.excluir_turma_nao_iniciada(uuid)
  set schema internal_academic;
alter function internal_academic.excluir_turma_nao_iniciada(uuid)
  rename to p1_excluir_turma_nao_iniciada_20260719;

alter function public.fechar_periodo_letivo(uuid, uuid)
  set schema internal_academic;
alter function internal_academic.fechar_periodo_letivo(uuid, uuid)
  rename to p1_fechar_periodo_letivo_20260719;

alter function public.finalizar_turma_academica(uuid, uuid)
  set schema internal_academic;
alter function internal_academic.finalizar_turma_academica(uuid, uuid)
  rename to p1_finalizar_turma_academica_20260719;

alter function public.get_pendencias_fechamento_periodo(uuid)
  set schema internal_academic;
alter function internal_academic.get_pendencias_fechamento_periodo(uuid)
  rename to p1_get_pendencias_fechamento_periodo_20260719;

alter function public.movimentar_matricula_academica(
  uuid, text, text, text, date, date, uuid
) set schema internal_academic;
alter function internal_academic.movimentar_matricula_academica(
  uuid, text, text, text, date, date, uuid
) rename to p1_movimentar_matricula_academica_20260719;

alter function public.reabrir_periodo_letivo(uuid, text, uuid)
  set schema internal_academic;
alter function internal_academic.reabrir_periodo_letivo(uuid, text, uuid)
  rename to p1_reabrir_periodo_letivo_20260719;

alter function public.receber_transferencia_externa(
  uuid, uuid, text, text, text, text, date, uuid
) set schema internal_academic;
alter function internal_academic.receber_transferencia_externa(
  uuid, uuid, text, text, text, text, date, uuid
) rename to p1_receber_transferencia_externa_20260719;

alter function public.remover_matricula_turma(uuid)
  set schema internal_academic;
alter function internal_academic.remover_matricula_turma(uuid)
  rename to p1_remover_matricula_turma_20260719;

alter function public.retornar_matricula_em_nova_turma(
  uuid, uuid, text, text, date, uuid
) set schema internal_academic;
alter function internal_academic.retornar_matricula_em_nova_turma(
  uuid, uuid, text, text, date, uuid
) rename to p1_retornar_matricula_em_nova_turma_20260719;

alter function public.salvar_aproveitamentos_transferencia_externa(
  uuid, jsonb, text
) set schema internal_academic;
alter function internal_academic.salvar_aproveitamentos_transferencia_externa(
  uuid, jsonb, text
) rename to p1_salvar_aproveitamentos_transferencia_externa_20260719;

alter function public.transferir_matricula_academica(
  uuid, text, text, uuid, text, text, date, uuid
) set schema internal_academic;
alter function internal_academic.transferir_matricula_academica(
  uuid, text, text, uuid, text, text, date, uuid
) rename to p1_transferir_matricula_academica_20260719;

alter function public.remove_turma_aula_planejada(uuid)
  set schema internal_academic;
alter function internal_academic.remove_turma_aula_planejada(uuid)
  rename to p1_remove_turma_aula_planejada_20260719;

do $block$
declare
  function_oid regprocedure;
begin
  foreach function_oid in array array[
    'internal_academic.p1_abrir_periodo_letivo_20260719(uuid,uuid)'::regprocedure,
    'internal_academic.p1_alterar_status_turma_tecnica_20260719(uuid,text,uuid)'::regprocedure,
    'internal_academic.p1_excluir_turma_nao_iniciada_20260719(uuid)'::regprocedure,
    'internal_academic.p1_fechar_periodo_letivo_20260719(uuid,uuid)'::regprocedure,
    'internal_academic.p1_finalizar_turma_academica_20260719(uuid,uuid)'::regprocedure,
    'internal_academic.p1_get_pendencias_fechamento_periodo_20260719(uuid)'::regprocedure,
    'internal_academic.p1_movimentar_matricula_academica_20260719(uuid,text,text,text,date,date,uuid)'::regprocedure,
    'internal_academic.p1_reabrir_periodo_letivo_20260719(uuid,text,uuid)'::regprocedure,
    'internal_academic.p1_receber_transferencia_externa_20260719(uuid,uuid,text,text,text,text,date,uuid)'::regprocedure,
    'internal_academic.p1_remover_matricula_turma_20260719(uuid)'::regprocedure,
    'internal_academic.p1_retornar_matricula_em_nova_turma_20260719(uuid,uuid,text,text,date,uuid)'::regprocedure,
    'internal_academic.p1_salvar_aproveitamentos_transferencia_externa_20260719(uuid,jsonb,text)'::regprocedure,
    'internal_academic.p1_transferir_matricula_academica_20260719(uuid,text,text,uuid,text,text,date,uuid)'::regprocedure,
    'internal_academic.p1_remove_turma_aula_planejada_20260719(uuid)'::regprocedure
  ] loop
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      function_oid
    );
  end loop;
end;
$block$;

create or replace function public.abrir_periodo_letivo(
  p_periodo_letivo_id uuid,
  p_responsavel_id uuid default null
)
returns public.periodos_letivos
language plpgsql security definer set search_path = ''
as $function$
declare v_turma_id uuid;
begin
  select pl.turma_id into v_turma_id
  from public.periodos_letivos pl where pl.id = p_periodo_letivo_id;
  if not public.can_operate_turma_academics(v_turma_id) then
    raise exception 'Sem permissão de Gestão para abrir este período.' using errcode = '42501';
  end if;
  return internal_academic.p1_abrir_periodo_letivo_20260719(
    p_periodo_letivo_id, p_responsavel_id
  );
end;
$function$;

create or replace function public.alterar_status_turma_tecnica(
  p_turma_id uuid,
  p_status_novo text,
  p_responsavel_id uuid default null
)
returns public.turmas
language plpgsql security definer set search_path = ''
as $function$
begin
  if not public.can_operate_turma_academics(p_turma_id) then
    raise exception 'Sem permissão de Gestão para alterar esta turma.' using errcode = '42501';
  end if;
  return internal_academic.p1_alterar_status_turma_tecnica_20260719(
    p_turma_id, p_status_novo, p_responsavel_id
  );
end;
$function$;

create or replace function public.excluir_turma_nao_iniciada(p_turma_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
begin
  if not public.can_operate_turma_academics(p_turma_id) then
    raise exception 'Sem permissão de Gestão para excluir esta turma.' using errcode = '42501';
  end if;
  return internal_academic.p1_excluir_turma_nao_iniciada_20260719(p_turma_id);
end;
$function$;

create or replace function public.fechar_periodo_letivo(
  p_periodo_letivo_id uuid,
  p_responsavel_id uuid default null
)
returns public.periodos_letivos
language plpgsql security definer set search_path = ''
as $function$
declare v_turma_id uuid;
begin
  select pl.turma_id into v_turma_id
  from public.periodos_letivos pl where pl.id = p_periodo_letivo_id;
  if not public.can_operate_turma_academics(v_turma_id) then
    raise exception 'Sem permissão de Gestão para fechar este período.' using errcode = '42501';
  end if;
  return internal_academic.p1_fechar_periodo_letivo_20260719(
    p_periodo_letivo_id, p_responsavel_id
  );
end;
$function$;

create or replace function public.finalizar_turma_academica(
  p_turma_id uuid,
  p_responsavel_id uuid default null
)
returns public.turmas
language plpgsql security definer set search_path = ''
as $function$
begin
  if not public.can_operate_turma_academics(p_turma_id) then
    raise exception 'Sem permissão de Gestão para finalizar esta turma.' using errcode = '42501';
  end if;
  return internal_academic.p1_finalizar_turma_academica_20260719(
    p_turma_id, p_responsavel_id
  );
end;
$function$;

create or replace function public.get_pendencias_fechamento_periodo(
  p_periodo_letivo_id uuid
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
declare v_turma_id uuid;
begin
  select pl.turma_id into v_turma_id
  from public.periodos_letivos pl where pl.id = p_periodo_letivo_id;
  if not public.can_operate_turma_academics(v_turma_id) then
    raise exception 'Sem permissão de Gestão para consultar o fechamento.' using errcode = '42501';
  end if;
  return internal_academic.p1_get_pendencias_fechamento_periodo_20260719(
    p_periodo_letivo_id
  );
end;
$function$;

create or replace function public.movimentar_matricula_academica(
  p_matricula_id uuid,
  p_tipo text,
  p_motivo text,
  p_observacao text default null,
  p_data_movimentacao date default null,
  p_data_retorno_prevista date default null,
  p_responsavel_id uuid default null
)
returns public.matriculas
language plpgsql security definer set search_path = ''
as $function$
declare v_turma_id uuid;
begin
  select m.turma_id into v_turma_id
  from public.matriculas m where m.id = p_matricula_id;
  if not public.can_operate_turma_academics(v_turma_id) then
    raise exception 'Sem permissão de Gestão para movimentar esta matrícula.' using errcode = '42501';
  end if;
  return internal_academic.p1_movimentar_matricula_academica_20260719(
    p_matricula_id, p_tipo, p_motivo, p_observacao,
    p_data_movimentacao, p_data_retorno_prevista, p_responsavel_id
  );
end;
$function$;

create or replace function public.reabrir_periodo_letivo(
  p_periodo_letivo_id uuid,
  p_motivo text,
  p_responsavel_id uuid default null
)
returns public.periodos_letivos
language plpgsql security definer set search_path = ''
as $function$
declare v_turma_id uuid;
begin
  select pl.turma_id into v_turma_id
  from public.periodos_letivos pl where pl.id = p_periodo_letivo_id;
  if not public.can_operate_turma_academics(v_turma_id) then
    raise exception 'Sem permissão de Gestão para reabrir este período.' using errcode = '42501';
  end if;
  return internal_academic.p1_reabrir_periodo_letivo_20260719(
    p_periodo_letivo_id, p_motivo, p_responsavel_id
  );
end;
$function$;

create or replace function public.receber_transferencia_externa(
  p_aluno_id uuid,
  p_turma_destino_id uuid,
  p_instituicao_origem text,
  p_curso_origem text,
  p_motivo text,
  p_observacao text default null,
  p_data_transferencia date default null,
  p_responsavel_id uuid default null
)
returns public.matriculas
language plpgsql security definer set search_path = ''
as $function$
begin
  if not public.can_operate_turma_academics(p_turma_destino_id) then
    raise exception 'Sem permissão de Gestão para receber esta transferência.' using errcode = '42501';
  end if;
  return internal_academic.p1_receber_transferencia_externa_20260719(
    p_aluno_id, p_turma_destino_id, p_instituicao_origem, p_curso_origem,
    p_motivo, p_observacao, p_data_transferencia, p_responsavel_id
  );
end;
$function$;

create or replace function public.remover_matricula_turma(p_matricula_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare v_turma_id uuid;
begin
  select m.turma_id into v_turma_id
  from public.matriculas m where m.id = p_matricula_id;
  if not public.can_operate_turma_academics(v_turma_id) then
    raise exception 'Sem permissão de Gestão para remover esta matrícula.' using errcode = '42501';
  end if;
  return internal_academic.p1_remover_matricula_turma_20260719(p_matricula_id);
end;
$function$;

create or replace function public.retornar_matricula_em_nova_turma(
  p_matricula_origem_id uuid,
  p_turma_destino_id uuid,
  p_motivo text,
  p_observacao text default null,
  p_data_retorno date default null,
  p_responsavel_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare v_turma_origem_id uuid;
begin
  select m.turma_id into v_turma_origem_id
  from public.matriculas m where m.id = p_matricula_origem_id;
  if not public.can_operate_turma_academics(v_turma_origem_id)
    or not public.can_operate_turma_academics(p_turma_destino_id) then
    raise exception 'Sem permissão de Gestão nas turmas de origem e destino.' using errcode = '42501';
  end if;
  return internal_academic.p1_retornar_matricula_em_nova_turma_20260719(
    p_matricula_origem_id, p_turma_destino_id, p_motivo,
    p_observacao, p_data_retorno, p_responsavel_id
  );
end;
$function$;

create or replace function public.salvar_aproveitamentos_transferencia_externa(
  p_matricula_id uuid,
  p_itens jsonb,
  p_observacao text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare v_turma_id uuid;
begin
  select m.turma_id into v_turma_id
  from public.matriculas m where m.id = p_matricula_id;
  if not public.can_operate_turma_academics(v_turma_id) then
    raise exception 'Sem permissão de Gestão para salvar aproveitamentos.' using errcode = '42501';
  end if;
  return internal_academic.p1_salvar_aproveitamentos_transferencia_externa_20260719(
    p_matricula_id, p_itens, p_observacao
  );
end;
$function$;

create or replace function public.transferir_matricula_academica(
  p_matricula_id uuid,
  p_tipo text,
  p_motivo text,
  p_turma_destino_id uuid default null,
  p_instituicao_destino text default null,
  p_observacao text default null,
  p_data_transferencia date default null,
  p_responsavel_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare v_turma_origem_id uuid;
begin
  select m.turma_id into v_turma_origem_id
  from public.matriculas m where m.id = p_matricula_id;
  if not public.can_operate_turma_academics(v_turma_origem_id)
    or (
      p_turma_destino_id is not null
      and not public.can_operate_turma_academics(p_turma_destino_id)
    ) then
    raise exception 'Sem permissão de Gestão nas turmas da transferência.' using errcode = '42501';
  end if;
  return internal_academic.p1_transferir_matricula_academica_20260719(
    p_matricula_id, p_tipo, p_motivo, p_turma_destino_id,
    p_instituicao_destino, p_observacao, p_data_transferencia, p_responsavel_id
  );
end;
$function$;

create or replace function public.remove_turma_aula_planejada(p_aula_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare
  v_turma_id uuid;
  v_disciplina_id uuid;
begin
  select a.turma_id, a.disciplina_id
    into v_turma_id, v_disciplina_id
  from public.aulas_turma a
  where a.id = p_aula_id;
  if not public.can_operate_turma_academics(v_turma_id)
    and not public.can_write_academic_record_open(v_turma_id, v_disciplina_id) then
    raise exception 'Sem permissão para remover esta aula.' using errcode = '42501';
  end if;
  return internal_academic.p1_remove_turma_aula_planejada_20260719(p_aula_id);
end;
$function$;

do $block$
declare function_oid regprocedure;
begin
  foreach function_oid in array array[
    'public.abrir_periodo_letivo(uuid,uuid)'::regprocedure,
    'public.alterar_status_turma_tecnica(uuid,text,uuid)'::regprocedure,
    'public.excluir_turma_nao_iniciada(uuid)'::regprocedure,
    'public.fechar_periodo_letivo(uuid,uuid)'::regprocedure,
    'public.finalizar_turma_academica(uuid,uuid)'::regprocedure,
    'public.get_pendencias_fechamento_periodo(uuid)'::regprocedure,
    'public.movimentar_matricula_academica(uuid,text,text,text,date,date,uuid)'::regprocedure,
    'public.reabrir_periodo_letivo(uuid,text,uuid)'::regprocedure,
    'public.receber_transferencia_externa(uuid,uuid,text,text,text,text,date,uuid)'::regprocedure,
    'public.remover_matricula_turma(uuid)'::regprocedure,
    'public.retornar_matricula_em_nova_turma(uuid,uuid,text,text,date,uuid)'::regprocedure,
    'public.salvar_aproveitamentos_transferencia_externa(uuid,jsonb,text)'::regprocedure,
    'public.transferir_matricula_academica(uuid,text,text,uuid,text,text,date,uuid)'::regprocedure,
    'public.remove_turma_aula_planejada(uuid)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon', function_oid);
    execute format('grant execute on function %s to authenticated, service_role', function_oid);
  end loop;
end;
$block$;
