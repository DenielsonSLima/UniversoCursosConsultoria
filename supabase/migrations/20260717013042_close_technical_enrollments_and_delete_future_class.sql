begin;

-- Permite encerrar a fase de inscricoes sem contornar a maquina de estados.
-- A permissao online e desligada na mesma transacao que retorna a turma
-- para PLANEJADA, evitando o estado invalido visto pelo trigger.
create or replace function public.alterar_status_turma_tecnica(
  p_turma_id uuid,
  p_status_novo text,
  p_responsavel_id uuid default null
)
returns public.turmas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turma public.turmas%rowtype;
  v_status text := upper(btrim(coalesce(p_status_novo, '')));
  v_first_period uuid;
  v_responsavel uuid;
begin
  v_responsavel := internal_academic.resolve_responsavel(p_responsavel_id);

  perform pg_advisory_xact_lock(
    hashtextextended('technical_turma:' || p_turma_id::text, 0)
  );

  if not public.can_write_turma(p_turma_id) then
    raise exception 'Sem permissão para alterar esta turma.';
  end if;

  select t.*
    into v_turma
  from public.turmas t
  join public.cursos c on c.id = t.curso_id
  where t.id = p_turma_id
    and c.modalidade = 'TECNICO'
  for update of t;

  if not found then
    raise exception 'Turma técnica não encontrada.';
  end if;

  if v_turma.status = 'FINALIZADA' then
    raise exception 'Turma finalizada não retorna a uma fase operacional.';
  end if;

  if v_status = 'PLANEJADA' then
    if v_turma.status <> 'INSCRICOES_ABERTAS' then
      raise exception 'Somente turma com inscrições abertas pode fechar inscrições.';
    end if;
  elsif v_status = 'INSCRICOES_ABERTAS' then
    if v_turma.status <> 'PLANEJADA' then
      raise exception 'Somente turma planejada pode abrir inscrições.';
    end if;
    if not coalesce(v_turma.permitir_inscricoes_online, false) then
      raise exception 'Habilite as inscrições online antes de abrir inscrições.';
    end if;
    if v_turma.data_inicio_inscricao is not null
      and (pg_catalog.timezone('America/Maceio', now()))::date < v_turma.data_inicio_inscricao then
      raise exception 'A data de início das inscrições ainda não chegou.';
    end if;
    if v_turma.data_fim_inscricao is not null
      and (pg_catalog.timezone('America/Maceio', now()))::date > v_turma.data_fim_inscricao then
      raise exception 'O período de inscrições terminou.';
    end if;
  elsif v_status = 'EM_ANDAMENTO' then
    if v_turma.status not in ('PLANEJADA', 'INSCRICOES_ABERTAS') then
      raise exception 'A fase atual não permite iniciar a turma.';
    end if;
    if v_turma.data_inicio is null
      or v_turma.data_previsao_termino is null
      or v_turma.data_previsao_termino < v_turma.data_inicio then
      raise exception 'Configure datas válidas para a turma antes do início.';
    end if;
    if (pg_catalog.timezone('America/Maceio', now()))::date < v_turma.data_inicio then
      raise exception 'A turma só pode começar na data inicial configurada.';
    end if;
    if not exists (
      select 1
      from public.periodos_letivos pl
      where pl.turma_id = p_turma_id
    ) then
      raise exception 'A turma não possui períodos letivos.';
    end if;

    perform pl.id
    from public.periodos_letivos pl
    where pl.turma_id = p_turma_id
    order by pl.id
    for update;

    if exists (
      select 1
      from public.modulos m
      where m.curso_id = v_turma.curso_id
        and not exists (
          select 1
          from public.periodos_letivos pl
          where pl.turma_id = p_turma_id
            and pl.modulo_id = m.id
        )
    ) or exists (
      select 1
      from public.periodos_letivos pl
      left join public.modulos m
        on m.id = pl.modulo_id
       and m.curso_id = v_turma.curso_id
      where pl.turma_id = p_turma_id
        and m.id is null
    ) then
      raise exception 'Cada módulo do curso deve possuir exatamente um período válido.';
    end if;

    if exists (
      select 1
      from public.periodos_letivos pl
      where pl.turma_id = p_turma_id
        and (
          pl.data_inicio is null
          or pl.data_fim is null
          or pl.data_fim < pl.data_inicio
          or pl.status <> 'PLANEJADO'
          or pl.data_inicio < v_turma.data_inicio
          or pl.data_fim > v_turma.data_previsao_termino
        )
    ) then
      raise exception 'Todos os períodos devem estar planejados e dentro das datas da turma.';
    end if;

    if (
      select min(pl.data_inicio)
      from public.periodos_letivos pl
      where pl.turma_id = p_turma_id
    ) <> v_turma.data_inicio
      or (
        select max(pl.data_fim)
        from public.periodos_letivos pl
        where pl.turma_id = p_turma_id
      ) <> v_turma.data_previsao_termino then
      raise exception 'Os períodos devem cobrir integralmente as datas da turma.';
    end if;

    if exists (
      select 1
      from (
        select
          pl.data_inicio,
          lag(pl.data_fim) over (order by pl.ordem) as previous_end
        from public.periodos_letivos pl
        where pl.turma_id = p_turma_id
      ) schedule
      where schedule.previous_end is not null
        and schedule.data_inicio <> schedule.previous_end + 1
    ) then
      raise exception 'Os períodos devem ser sequenciais, sem lacunas ou sobreposição.';
    end if;

    select pl.id
      into v_first_period
    from public.periodos_letivos pl
    where pl.turma_id = p_turma_id
    order by pl.ordem
    limit 1;
  else
    raise exception 'Fase técnica inválida: %.', v_status;
  end if;

  perform internal_academic.authorize_transition(
    'TURMA_STATUS',
    p_turma_id,
    v_status
  );

  update public.turmas
  set status = v_status,
      permitir_inscricoes_online = case
        when v_status = 'PLANEJADA' then false
        else permitir_inscricoes_online
      end
  where id = p_turma_id
  returning * into v_turma;

  if v_status = 'EM_ANDAMENTO' then
    perform internal_academic.authorize_transition(
      'PERIODO_STATUS',
      v_first_period,
      'ABERTO'
    );
    update public.periodos_letivos
    set status = 'ABERTO',
        updated_at = now()
    where id = v_first_period;
  end if;

  return v_turma;
end;
$$;

revoke execute on function public.alterar_status_turma_tecnica(uuid, text, uuid)
  from public, anon;
grant execute on function public.alterar_status_turma_tecnica(uuid, text, uuid)
  to authenticated, service_role;

comment on function public.alterar_status_turma_tecnica(uuid, text, uuid) is
  'Opera as fases da turma técnica. PLANEJADA fecha inscrições abertas e desliga a permissão online atomicamente.';

-- A exclusao continua restrita a turmas futuras sem vinculos. Quando a turma
-- tecnica esta apenas com inscricoes abertas, a propria RPC fecha a fase antes
-- do DELETE para satisfazer o trigger de protecao sem abrir uma janela insegura.
create or replace function public.excluir_turma_nao_iniciada(p_turma_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turma public.turmas%rowtype;
  v_tecnico boolean := false;
  v_total_matriculas integer := 0;
  v_total_documentos integer := 0;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('technical_turma:' || p_turma_id::text, 0)
  );

  select t.*
    into v_turma
  from public.turmas t
  where t.id = p_turma_id
  for update;

  if not found then
    raise exception 'Turma não encontrada.';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.can_write_turma(v_turma.id) then
    raise exception 'Você não tem permissão para excluir esta turma.'
      using errcode = '42501';
  end if;

  if v_turma.data_inicio is not null
    and v_turma.data_inicio <= (pg_catalog.timezone('America/Maceio', now()))::date then
    raise exception 'A turma já começou. Preserve o histórico acadêmico e financeiro.';
  end if;

  if public.turma_possui_lancamentos_academicos(v_turma.id) then
    raise exception 'Esta turma possui diário, notas, movimentações ou registros acadêmicos e não pode ser excluída.';
  end if;

  select exists (
    select 1
    from public.cursos c
    where c.id = v_turma.curso_id
      and c.modalidade = 'TECNICO'
  ) into v_tecnico;

  if v_tecnico then
    if v_turma.status not in ('PLANEJADA', 'INSCRICOES_ABERTAS') then
      raise exception 'Somente turma técnica ainda não iniciada pode ser excluída.';
    end if;

    if exists (
      select 1 from public.matriculas m where m.turma_id = v_turma.id
    ) or exists (
      select 1 from public.inscricoes_online i where i.turma_id = v_turma.id
    ) or exists (
      select 1 from public.atividades_extra_classe a where a.turma_id = v_turma.id
    ) or exists (
      select 1 from public.contas_receber cr where cr.turma_id = v_turma.id
    ) then
      raise exception 'A turma técnica possui matrículas, inscrições, cobranças ou atividades vinculadas e não pode ser excluída.';
    end if;

    if v_turma.status = 'INSCRICOES_ABERTAS' then
      perform internal_academic.authorize_transition(
        'TURMA_STATUS',
        v_turma.id,
        'PLANEJADA'
      );

      update public.turmas
      set status = 'PLANEJADA',
          permitir_inscricoes_online = false
      where id = v_turma.id
      returning * into v_turma;
    end if;
  end if;

  select count(*)
    into v_total_matriculas
  from public.matriculas m
  where m.turma_id = v_turma.id;

  delete from public.documentos_validacao dv
  where dv.matricula_id in (
    select m.id
    from public.matriculas m
    where m.turma_id = v_turma.id
  );
  get diagnostics v_total_documentos = row_count;

  delete from public.contas_receber cr
  where cr.turma_id = v_turma.id;

  delete from public.inscricoes_online io
  where io.turma_id = v_turma.id
     or io.matricula_id in (
       select m.id
       from public.matriculas m
       where m.turma_id = v_turma.id
     );

  delete from public.matricula_aproveitamentos ma
  where ma.matricula_id in (
    select m.id
    from public.matriculas m
    where m.turma_id = v_turma.id
  ) or ma.matricula_origem_id in (
    select m.id
    from public.matriculas m
    where m.turma_id = v_turma.id
  );

  delete from public.matricula_movimentacoes mm
  where mm.turma_origem_id = v_turma.id
     or mm.turma_destino_id = v_turma.id
     or mm.matricula_id in (
       select m.id
       from public.matriculas m
       where m.turma_id = v_turma.id
     );

  delete from public.transferencias_academicas ta
  where ta.turma_origem_id = v_turma.id
     or ta.turma_destino_id = v_turma.id
     or ta.matricula_origem_id in (
       select m.id
       from public.matriculas m
       where m.turma_id = v_turma.id
     )
     or ta.matricula_destino_id in (
       select m.id
       from public.matriculas m
       where m.turma_id = v_turma.id
     );

  update public.matriculas m
  set origem_matricula_id = null
  where m.origem_matricula_id in (
    select origem.id
    from public.matriculas origem
    where origem.turma_id = v_turma.id
  );

  delete from public.matriculas m
  where m.turma_id = v_turma.id;

  delete from public.turmas t
  where t.id = v_turma.id;

  return jsonb_build_object(
    'turmaId', v_turma.id,
    'matriculasRemovidas', coalesce(v_total_matriculas, 0),
    'documentosRemovidos', coalesce(v_total_documentos, 0),
    'removed', true
  );
end;
$$;

revoke execute on function public.excluir_turma_nao_iniciada(uuid)
  from public, anon;
grant execute on function public.excluir_turma_nao_iniciada(uuid)
  to authenticated, service_role;

comment on function public.excluir_turma_nao_iniciada(uuid) is
  'Exclui turma futura sem histórico. Turma técnica com inscrições abertas é retornada a PLANEJADA atomicamente antes da exclusão.';

commit;
