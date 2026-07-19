begin;

create or replace function public.whatsapp_apply_message_status(
  p_message_id text,
  p_status text,
  p_payload jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_updated boolean := false;
begin
  if nullif(btrim(p_message_id), '') is null then
    return false;
  end if;

  update public.whatsapp_mensagens as message
  set status = p_status,
      raw_payload = coalesce(message.raw_payload, '{}'::jsonb)
        || jsonb_build_object('last_status_payload', coalesce(p_payload, '{}'::jsonb))
  where message.meta_message_id = p_message_id
    and case lower(coalesce(p_status, ''))
      when 'sent' then 10
      when 'delivered' then 20
      when 'read' then 30
      when 'failed' then 40
      else 0
    end >= case lower(coalesce(message.status, ''))
      when 'sent' then 10
      when 'delivered' then 20
      when 'read' then 30
      when 'failed' then 40
      else 0
    end;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.whatsapp_apply_message_status(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.whatsapp_apply_message_status(text, text, jsonb)
  to service_role;

comment on function public.whatsapp_apply_message_status(text, text, jsonb) is
  'Aplica status monotônico sem remover os metadados originais usados em previews de mídia.';

commit;
