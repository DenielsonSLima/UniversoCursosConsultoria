begin;

-- Atribuição de docente e planejamento da grade são operações da Gestão.
-- Não reutilize can_write_academic_record_open: essa guarda pertence ao diário
-- e, em turmas técnicas, exige período aberto e turma EM_ANDAMENTO.
create or replace function internal_academic.can_manage_turma_lesson_planning(
  p_turma_id uuid,
  p_disciplina_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.turmas turma
    join public.turmas_disciplinas vinculo
      on vinculo.turma_id = turma.id
     and vinculo.disciplina_id = p_disciplina_id
    where turma.id = p_turma_id
      and upper(coalesce(turma.status, '')) <> 'FINALIZADA'
      and upper(coalesce(vinculo.bloqueio_diario, 'ABERTO')) <> 'TOTAL'
      and (
        coalesce((select auth.role()), '') = 'service_role'
        or public.can_operate_turma_academics(turma.id)
      )
  );
$function$;

revoke all on function internal_academic.can_manage_turma_lesson_planning(uuid, uuid)
  from public, anon, authenticated;

comment on function internal_academic.can_manage_turma_lesson_planning(uuid, uuid) is
  'Guarda privada do planejamento: Gestão no polo ou service_role, vínculo existente, turma não finalizada e diário sem bloqueio TOTAL.';

-- O cliente informa somente os identificadores. O banco deriva o nome do
-- parceiro e preserva os demais campos do vínculo, inclusive concluida.
create or replace function public.atribuir_docente_disciplinas_turma(
  p_turma_id uuid,
  p_disciplina_ids uuid[],
  p_professor_id uuid
)
returns table (
  disciplina_id uuid,
  professor_id uuid,
  professor_nome text,
  concluida boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_disciplina_ids uuid[];
  v_professor_id uuid;
  v_professor_nome text;
  v_turma_status text;
  v_vinculos_count integer;
begin
  if not public.can_operate_turma_academics(p_turma_id) then
    raise exception 'Sem permissão de Gestão para atribuir docente nesta turma.'
      using errcode = '42501';
  end if;

  select turma.status
  into v_turma_status
  from public.turmas turma
  where turma.id = p_turma_id;

  if not found then
    raise exception 'Turma não encontrada.' using errcode = 'P0002';
  end if;

  if upper(coalesce(v_turma_status, '')) = 'FINALIZADA' then
    raise exception 'Turma finalizada não permite alteração de docente.'
      using errcode = '42501';
  end if;

  if coalesce(cardinality(p_disciplina_ids), 0) = 0
    or array_position(p_disciplina_ids, null) is not null then
    raise exception 'Informe ao menos uma disciplina válida.'
      using errcode = '22023';
  end if;

  select array_agg(normalizada.disciplina_id order by normalizada.primeira_posicao)
  into v_disciplina_ids
  from (
    select solicitada.disciplina_id, min(solicitada.posicao) as primeira_posicao
    from unnest(p_disciplina_ids) with ordinality
      as solicitada(disciplina_id, posicao)
    group by solicitada.disciplina_id
  ) normalizada;

  if p_professor_id is not null then
    select professor.id, btrim(professor.nome)
    into v_professor_id, v_professor_nome
    from public.parceiros professor
    where professor.id = p_professor_id
      and upper(coalesce(professor.tipo, '')) = 'PROFESSOR'
      and upper(coalesce(professor.status, '')) = 'ATIVO';

    if not found then
      raise exception 'Docente ativo não encontrado.' using errcode = '22023';
    end if;
  else
    v_professor_id := null;
    v_professor_nome := null;
  end if;

  -- A ordem estável evita deadlocks entre duas atribuições em lote na turma.
  perform 1
  from public.turmas_disciplinas vinculo
  where vinculo.turma_id = p_turma_id
    and vinculo.disciplina_id = any(v_disciplina_ids)
  order by vinculo.disciplina_id
  for update;

  select count(*)::integer
  into v_vinculos_count
  from public.turmas_disciplinas vinculo
  where vinculo.turma_id = p_turma_id
    and vinculo.disciplina_id = any(v_disciplina_ids);

  if v_vinculos_count <> cardinality(v_disciplina_ids) then
    raise exception 'Uma ou mais disciplinas não pertencem à grade desta turma.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.turmas_disciplinas vinculo
    where vinculo.turma_id = p_turma_id
      and vinculo.disciplina_id = any(v_disciplina_ids)
      and upper(coalesce(vinculo.bloqueio_diario, 'ABERTO')) = 'TOTAL'
  ) then
    raise exception 'Disciplina com diário totalmente bloqueado não permite alteração de docente.'
      using errcode = '42501';
  end if;

  -- O trigger de integridade dos vínculos também usa disciplina -> turma.
  -- Mantemos essa ordem e repetimos estado/autorização sob lock, evitando
  -- deadlock com uma escrita concorrente e corrida com a finalização da turma.
  select turma.status
  into v_turma_status
  from public.turmas turma
  where turma.id = p_turma_id
  for update;

  if not public.can_operate_turma_academics(p_turma_id) then
    raise exception 'Sem permissão de Gestão para atribuir docente nesta turma.'
      using errcode = '42501';
  end if;

  if upper(coalesce(v_turma_status, '')) = 'FINALIZADA' then
    raise exception 'Turma finalizada não permite alteração de docente.'
      using errcode = '42501';
  end if;

  -- O próprio UPDATE publicado no Realtime é o evento canônico. O trigger
  -- legado ainda o espelha na outbox; o cliente ignora somente esse espelho.
  update public.turmas_disciplinas vinculo
  set professor_id = v_professor_id,
      professor_nome = v_professor_nome
  where vinculo.turma_id = p_turma_id
    and vinculo.disciplina_id = any(v_disciplina_ids)
    and (vinculo.professor_id, vinculo.professor_nome)
      is distinct from (v_professor_id, v_professor_nome);

  return query
  select
    vinculo.disciplina_id,
    vinculo.professor_id,
    vinculo.professor_nome,
    vinculo.concluida
  from unnest(v_disciplina_ids) with ordinality
    as solicitada(disciplina_id, posicao)
  join public.turmas_disciplinas vinculo
    on vinculo.turma_id = p_turma_id
   and vinculo.disciplina_id = solicitada.disciplina_id
  order by solicitada.posicao;
end;
$function$;

revoke all on function public.atribuir_docente_disciplinas_turma(uuid, uuid[], uuid)
  from public, anon;
grant execute on function public.atribuir_docente_disciplinas_turma(uuid, uuid[], uuid)
  to authenticated, service_role;

comment on function public.atribuir_docente_disciplinas_turma(uuid, uuid[], uuid) is
  'Atribui ou remove um docente em uma ou várias disciplinas da turma, derivando o nome no banco e retornando os vínculos canônicos.';

-- A implementação canônica de sessões é mantida; somente a guarda equivocada
-- do diário é substituída pela guarda própria de planejamento da Gestão.
create or replace function public.salvar_encontro_turma(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_titulo text,
  p_carga_horaria numeric,
  p_data_aula date,
  p_aula_id uuid default null
)
returns setof public.aulas_turma
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_data_anterior date;
  v_total_anterior numeric;
  v_sessoes_anteriores integer;
  v_sessoes_esperadas integer;
  v_tem_lancamentos boolean;
begin
  if not internal_academic.can_manage_turma_lesson_planning(
    p_turma_id,
    p_disciplina_id
  ) then
    raise exception 'Sem permissão para alterar este encontro de aula.'
      using errcode = '42501';
  end if;

  if nullif(trim(p_titulo), '') is null then
    raise exception 'Informe o conteúdo da aula.' using errcode = '22023';
  end if;

  if p_data_aula is null then
    raise exception 'Informe a data da aula.' using errcode = '22023';
  end if;

  if p_carga_horaria is null or p_carga_horaria <= 0 then
    raise exception 'A carga horária precisa ser maior que zero.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_turma_id::text),
    hashtext(p_disciplina_id::text)
  );

  v_sessoes_esperadas := case when p_carga_horaria = 8 then 2 else 1 end;

  if p_aula_id is not null then
    select aula.data_aula
    into v_data_anterior
    from public.aulas_turma aula
    where aula.id = p_aula_id
      and aula.turma_id = p_turma_id
      and aula.disciplina_id = p_disciplina_id;

    if not found then
      raise exception 'Encontro de aula não encontrado.' using errcode = 'P0002';
    end if;

    select coalesce(sum(aula.carga_horaria), 0), count(*)
    into v_total_anterior, v_sessoes_anteriores
    from public.aulas_turma aula
    where aula.turma_id = p_turma_id
      and aula.disciplina_id = p_disciplina_id
      and aula.data_aula = v_data_anterior;

    select exists (
      select 1
      from public.aulas_turma aula
      where aula.turma_id = p_turma_id
        and aula.disciplina_id = p_disciplina_id
        and aula.data_aula = v_data_anterior
        and (
          exists (
            select 1
            from public.diario_frequencia frequencia
            where frequencia.aula_id = aula.id
          )
          or exists (
            select 1
            from public.diario_praticas pratica
            where pratica.aula_id = aula.id
          )
        )
    ) into v_tem_lancamentos;

    if v_tem_lancamentos
      and (
        v_total_anterior <> p_carga_horaria
        or v_sessoes_anteriores <> v_sessoes_esperadas
      ) then
      raise exception
        'A carga ou os turnos não podem ser alterados depois de lançada a frequência ou prática.';
    end if;

    if v_total_anterior = p_carga_horaria
      and v_sessoes_anteriores = v_sessoes_esperadas then
      update public.aulas_turma aula
      set titulo = trim(p_titulo),
          data_aula = p_data_aula,
          carga_horaria = case
            when p_carga_horaria = 8 then 4
            else p_carga_horaria
          end,
          sessao = case
            when p_carga_horaria = 8 then aula.sessao
            else 'U'
          end
      where aula.turma_id = p_turma_id
        and aula.disciplina_id = p_disciplina_id
        and aula.data_aula = v_data_anterior;
    else
      delete from public.aulas_turma aula
      where aula.turma_id = p_turma_id
        and aula.disciplina_id = p_disciplina_id
        and aula.data_aula = v_data_anterior;

      if p_carga_horaria = 8 then
        insert into public.aulas_turma (
          turma_id,
          disciplina_id,
          titulo,
          carga_horaria,
          data_aula,
          sessao
        ) values
          (p_turma_id, p_disciplina_id, trim(p_titulo), 4, p_data_aula, 'M'),
          (p_turma_id, p_disciplina_id, trim(p_titulo), 4, p_data_aula, 'T');
      else
        insert into public.aulas_turma (
          turma_id,
          disciplina_id,
          titulo,
          carga_horaria,
          data_aula,
          sessao
        ) values (
          p_turma_id,
          p_disciplina_id,
          trim(p_titulo),
          p_carga_horaria,
          p_data_aula,
          'U'
        );
      end if;
    end if;
  else
    if p_carga_horaria = 8 then
      insert into public.aulas_turma (
        turma_id,
        disciplina_id,
        titulo,
        carga_horaria,
        data_aula,
        sessao
      ) values
        (p_turma_id, p_disciplina_id, trim(p_titulo), 4, p_data_aula, 'M'),
        (p_turma_id, p_disciplina_id, trim(p_titulo), 4, p_data_aula, 'T');
    else
      insert into public.aulas_turma (
        turma_id,
        disciplina_id,
        titulo,
        carga_horaria,
        data_aula,
        sessao
      ) values (
        p_turma_id,
        p_disciplina_id,
        trim(p_titulo),
        p_carga_horaria,
        p_data_aula,
        'U'
      );
    end if;
  end if;

  return query
  select aula.*
  from public.aulas_turma aula
  where aula.turma_id = p_turma_id
    and aula.disciplina_id = p_disciplina_id
    and aula.data_aula = p_data_aula
  order by
    case aula.sessao when 'M' then 1 when 'T' then 2 when 'N' then 3 else 4 end,
    aula.created_at,
    aula.id;
end;
$function$;

revoke all on function public.salvar_encontro_turma(uuid, uuid, text, numeric, date, uuid)
  from public, anon;
grant execute on function public.salvar_encontro_turma(uuid, uuid, text, numeric, date, uuid)
  to authenticated, service_role;

create or replace function public.remover_encontro_turma(p_aula_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_turma_id uuid;
  v_disciplina_id uuid;
  v_data_aula date;
  v_count integer;
begin
  select aula.turma_id, aula.disciplina_id, aula.data_aula
  into v_turma_id, v_disciplina_id, v_data_aula
  from public.aulas_turma aula
  where aula.id = p_aula_id;

  if not found then
    return false;
  end if;

  if not internal_academic.can_manage_turma_lesson_planning(
    v_turma_id,
    v_disciplina_id
  ) then
    raise exception 'Sem permissão para remover este encontro de aula.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_turma_id::text),
    hashtext(v_disciplina_id::text)
  );

  delete from public.aulas_turma aula
  where aula.turma_id = v_turma_id
    and aula.disciplina_id = v_disciplina_id
    and aula.data_aula = v_data_aula;
  get diagnostics v_count = row_count;

  return v_count > 0;
end;
$function$;

revoke all on function public.remover_encontro_turma(uuid)
  from public, anon;
grant execute on function public.remover_encontro_turma(uuid)
  to authenticated, service_role;

-- Compatibilidade: o endpoint anterior de remoção continua disponível, mas
-- não pode conservar a antiga alternativa de autorização do professor.
create or replace function public.remove_turma_aula_planejada(p_aula_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_turma_id uuid;
  v_disciplina_id uuid;
  v_deleted_count integer := 0;
begin
  select aula.turma_id, aula.disciplina_id
  into v_turma_id, v_disciplina_id
  from public.aulas_turma aula
  where aula.id = p_aula_id;

  if not found then
    return false;
  end if;

  if not internal_academic.can_manage_turma_lesson_planning(
    v_turma_id,
    v_disciplina_id
  ) then
    raise exception 'Sem permissão para remover esta aula.'
      using errcode = '42501';
  end if;

  delete from public.aulas_turma aula
  where aula.id = p_aula_id;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count = 1;
end;
$function$;

revoke all on function public.remove_turma_aula_planejada(uuid)
  from public, anon;
grant execute on function public.remove_turma_aula_planejada(uuid)
  to authenticated, service_role;

create or replace function public.definir_horario_encontro_turma(
  p_aula_id uuid,
  p_hora_inicio time,
  p_hora_fim time
)
returns public.aulas_turma
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_aula public.aulas_turma%rowtype;
begin
  select aula.*
  into v_aula
  from public.aulas_turma aula
  where aula.id = p_aula_id
  for update;

  if not found then
    raise exception 'Encontro de aula não encontrado.' using errcode = 'P0002';
  end if;

  if not internal_academic.can_manage_turma_lesson_planning(
    v_aula.turma_id,
    v_aula.disciplina_id
  ) then
    raise exception 'Sem permissão para ajustar o horário deste encontro.'
      using errcode = '42501';
  end if;

  if (p_hora_inicio is null) <> (p_hora_fim is null)
    or (p_hora_inicio is not null and p_hora_fim <= p_hora_inicio) then
    raise exception 'Informe início e fim do horário em ordem válida.'
      using errcode = '22023';
  end if;

  update public.aulas_turma aula
  set hora_inicio = p_hora_inicio,
      hora_fim = p_hora_fim
  where aula.id = p_aula_id
  returning aula.* into v_aula;

  return v_aula;
end;
$function$;

revoke all on function public.definir_horario_encontro_turma(uuid, time, time)
  from public, anon;
grant execute on function public.definir_horario_encontro_turma(uuid, time, time)
  to authenticated, service_role;

-- Fecha o endpoint legado que ainda aceitava Cadastros via can_write_turma,
-- mantendo a implementação de composição atrás do wrapper autorizado.
alter function public.atualizar_horario_encontro_gestor(uuid, numeric, date)
  set schema internal_academic;
alter function internal_academic.atualizar_horario_encontro_gestor(uuid, numeric, date)
  rename to p1_atualizar_horario_encontro_gestor_20260808;

revoke all on function internal_academic.p1_atualizar_horario_encontro_gestor_20260808(uuid, numeric, date)
  from public, anon, authenticated, service_role;

create function public.atualizar_horario_encontro_gestor(
  p_aula_id uuid,
  p_carga_horaria numeric,
  p_data_aula date
)
returns setof public.aulas_turma
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_turma_id uuid;
  v_disciplina_id uuid;
begin
  select aula.turma_id, aula.disciplina_id
  into v_turma_id, v_disciplina_id
  from public.aulas_turma aula
  where aula.id = p_aula_id;

  if not found then
    raise exception 'Encontro de aula não encontrado.' using errcode = 'P0002';
  end if;

  if not internal_academic.can_manage_turma_lesson_planning(
    v_turma_id,
    v_disciplina_id
  ) then
    raise exception 'Somente a Gestão pode ajustar data e carga horária do encontro.'
      using errcode = '42501';
  end if;

  return query
  select encontro.*
  from internal_academic.p1_atualizar_horario_encontro_gestor_20260808(
    p_aula_id,
    p_carga_horaria,
    p_data_aula
  ) encontro;
end;
$function$;

revoke all on function public.atualizar_horario_encontro_gestor(uuid, numeric, date)
  from public, anon;
grant execute on function public.atualizar_horario_encontro_gestor(uuid, numeric, date)
  to authenticated, service_role;

comment on function public.atualizar_horario_encontro_gestor(uuid, numeric, date) is
  'Ajusta data e carga do encontro somente para Gestão no polo, em turma não finalizada e disciplina sem bloqueio TOTAL.';

commit;
