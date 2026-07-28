create or replace function public.gestor_can_read_turma(p_turma_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.role()), '') = 'service_role'
    or public.can_operate_turma_academics(p_turma_id)
    or (
      public.gestor_has_module('relatorios')
      and exists (
        select 1
        from public.turmas turma
        where turma.id = p_turma_id
          and public.is_gestor_for_polo(turma.polo_id)
      )
    );
$$;

comment on function public.gestor_can_read_turma(uuid) is
  'Permite leitura de turmas ao módulo Gestão e, sem conceder escrita, ao módulo Relatórios no escopo de polo autorizado.';

create or replace function public.emit_matricula_gestao_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_polo_id uuid;
  v_old_polo_id uuid;
  v_event_id bigint;
begin
  if tg_op = 'DELETE' then
    select turma.polo_id
      into v_old_polo_id
    from public.turmas turma
    where turma.id = old.turma_id;

    insert into public.gestao_realtime_events (
      source_table, event_type, entity_id, turma_id, polo_id
    )
    values (
      tg_table_name, tg_op, old.id, old.turma_id, v_old_polo_id
    )
    returning id into v_event_id;
  else
    select turma.polo_id
      into v_new_polo_id
    from public.turmas turma
    where turma.id = new.turma_id;

    if tg_op = 'UPDATE' and old.turma_id is distinct from new.turma_id then
      select turma.polo_id
        into v_old_polo_id
      from public.turmas turma
      where turma.id = old.turma_id;

      insert into public.gestao_realtime_events (
        source_table, event_type, entity_id, turma_id, polo_id
      )
      values (
        tg_table_name, tg_op, old.id, old.turma_id, v_old_polo_id
      );
    end if;

    insert into public.gestao_realtime_events (
      source_table, event_type, entity_id, turma_id, polo_id
    )
    values (
      tg_table_name, tg_op, new.id, new.turma_id, v_new_polo_id
    )
    returning id into v_event_id;
  end if;

  if v_event_id % 100 = 0 then
    delete from public.gestao_realtime_events
    where created_at < now() - interval '24 hours';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.emit_turma_gestao_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id bigint;
begin
  if tg_op = 'UPDATE' and old.polo_id is distinct from new.polo_id then
    insert into public.gestao_realtime_events (
      source_table, event_type, entity_id, turma_id, polo_id
    )
    values (
      tg_table_name, tg_op, old.id, old.id, old.polo_id
    );
  end if;

  insert into public.gestao_realtime_events (
    source_table, event_type, entity_id, turma_id, polo_id
  )
  values (
    tg_table_name,
    tg_op,
    case when tg_op = 'DELETE' then old.id else new.id end,
    case when tg_op = 'DELETE' then old.id else new.id end,
    case when tg_op = 'DELETE' then old.polo_id else new.polo_id end
  )
  returning id into v_event_id;

  if v_event_id % 100 = 0 then
    delete from public.gestao_realtime_events
    where created_at < now() - interval '24 hours';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.emit_parceiro_relatorios_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.gestao_realtime_events (
    source_table,
    event_type,
    entity_id,
    turma_id,
    polo_id
  )
  select distinct
    'parceiros',
    tg_op,
    new.id,
    matricula.turma_id,
    turma.polo_id
  from public.matriculas matricula
  join public.turmas turma on turma.id = matricula.turma_id
  where matricula.aluno_id = new.id;

  return new;
end;
$$;

drop trigger if exists parceiros_emit_relatorios_realtime_event
  on public.parceiros;
create trigger parceiros_emit_relatorios_realtime_event
after update of
  nome,
  cpf_cnpj,
  data_nascimento,
  sexo,
  nome_mae,
  raca_cor,
  naturalidade,
  nacionalidade,
  cep,
  endereco,
  cidade,
  uf
on public.parceiros
for each row
when (
  old.nome is distinct from new.nome
  or old.cpf_cnpj is distinct from new.cpf_cnpj
  or old.data_nascimento is distinct from new.data_nascimento
  or old.sexo is distinct from new.sexo
  or old.nome_mae is distinct from new.nome_mae
  or old.raca_cor is distinct from new.raca_cor
  or old.naturalidade is distinct from new.naturalidade
  or old.nacionalidade is distinct from new.nacionalidade
  or old.cep is distinct from new.cep
  or old.endereco is distinct from new.endereco
  or old.cidade is distinct from new.cidade
  or old.uf is distinct from new.uf
)
execute function public.emit_parceiro_relatorios_realtime_event();

drop trigger if exists cursos_emit_relatorios_realtime_event
  on public.cursos;
create trigger cursos_emit_relatorios_realtime_event
after update of nome, modalidade
on public.cursos
for each row
when (
  old.nome is distinct from new.nome
  or old.modalidade is distinct from new.modalidade
)
execute function public.emit_curso_relatorios_realtime_event();

drop trigger if exists polos_emit_relatorios_realtime_event
  on public.polos;
create trigger polos_emit_relatorios_realtime_event
after update of nome, cidade
on public.polos
for each row
when (
  old.nome is distinct from new.nome
  or old.cidade is distinct from new.cidade
)
execute function public.emit_polo_relatorios_realtime_event();

revoke all on function public.emit_matricula_gestao_realtime_event()
  from public, anon, authenticated;
revoke all on function public.emit_turma_gestao_realtime_event()
  from public, anon, authenticated;
revoke all on function public.emit_parceiro_relatorios_realtime_event()
  from public, anon, authenticated;
