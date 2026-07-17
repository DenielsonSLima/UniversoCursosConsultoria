begin;

-- Preserva a implementacao anterior como nucleo da exclusao. O novo wrapper
-- remove primeiro os vinculos puramente operacionais de turmas tecnicas futuras
-- usando a RPC oficial de remocao de matricula, que autoriza os triggers de
-- auditoria e continua bloqueando qualquer lancamento academico.
alter function public.excluir_turma_nao_iniciada(uuid)
  set schema internal_academic;
alter function internal_academic.excluir_turma_nao_iniciada(uuid)
  rename to legacy_excluir_turma_nao_iniciada;

revoke all on function internal_academic.legacy_excluir_turma_nao_iniciada(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.excluir_turma_nao_iniciada(p_turma_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turma public.turmas%rowtype;
  v_tecnico boolean := false;
  v_matricula_id uuid;
  v_remocao_matricula jsonb;
  v_resultado jsonb;
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
      select 1
      from public.atividades_extra_classe atividade
      where atividade.turma_id = v_turma.id
    ) then
      raise exception 'A turma técnica possui atividades vinculadas e não pode ser excluída.';
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

    select count(*)
      into v_total_matriculas
    from public.matriculas m
    where m.turma_id = v_turma.id;

    for v_matricula_id in
      select m.id
      from public.matriculas m
      where m.turma_id = v_turma.id
      order by m.id
      for update
    loop
      v_remocao_matricula := public.remover_matricula_turma(v_matricula_id);
      v_total_documentos := v_total_documentos
        + coalesce((v_remocao_matricula ->> 'documentosRemovidos')::integer, 0);
    end loop;

    -- Inscricoes ainda sem matricula e cobrancas avulsas tambem sao vinculos
    -- operacionais pre-inicio; nao representam historico academico.
    delete from public.inscricoes_online io
    where io.turma_id = v_turma.id;

    delete from public.contas_receber cr
    where cr.turma_id = v_turma.id;
  end if;

  v_resultado := internal_academic.legacy_excluir_turma_nao_iniciada(v_turma.id);

  if v_tecnico then
    v_resultado := v_resultado || jsonb_build_object(
      'matriculasRemovidas', v_total_matriculas,
      'documentosRemovidos', v_total_documentos
    );
  end if;

  return v_resultado;
end;
$$;

revoke execute on function public.excluir_turma_nao_iniciada(uuid)
  from public, anon;
grant execute on function public.excluir_turma_nao_iniciada(uuid)
  to authenticated, service_role;

comment on function public.excluir_turma_nao_iniciada(uuid) is
  'Exclui turma futura sem histórico. Em turmas técnicas, remove matrículas, inscrições e cobranças pré-início pelas rotinas oficiais antes de apagar a turma.';

commit;
