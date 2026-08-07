create or replace function public.whatsapp_pause_flow_on_human_routing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'aberta'
     and new.status_atendimento = 'pendente_setor'
     and (
       old.status_atendimento is distinct from new.status_atendimento
       or old.setor is distinct from new.setor
       or old.polo_id is distinct from new.polo_id
     )
  then
    insert into public.whatsapp_flow_sessions (
      conversa_id,
      telefone,
      aluno_id,
      status,
      attempts,
      handoff_required,
      data,
      updated_at
    )
    values (
      new.id,
      new.telefone,
      new.aluno_id,
      'handoff',
      0,
      true,
      jsonb_build_object(
        'handoffReason',
        'ticket_routed',
        'routedSetor',
        new.setor,
        'routedPoloId',
        new.polo_id
      ),
      now()
    )
    on conflict (conversa_id) do update
    set
      telefone = excluded.telefone,
      aluno_id = coalesce(
        excluded.aluno_id,
        whatsapp_flow_sessions.aluno_id
      ),
      status = 'handoff',
      attempts = 0,
      handoff_required = true,
      data = coalesce(
        whatsapp_flow_sessions.data,
        '{}'::jsonb
      ) || excluded.data,
      updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_whatsapp_pause_flow_on_human_routing
  on public.whatsapp_conversas;

create trigger trg_whatsapp_pause_flow_on_human_routing
after update of status, status_atendimento, setor, polo_id
on public.whatsapp_conversas
for each row
execute function public.whatsapp_pause_flow_on_human_routing();

revoke all on function public.whatsapp_pause_flow_on_human_routing()
  from public, anon, authenticated;
grant execute on function public.whatsapp_pause_flow_on_human_routing()
  to service_role;
