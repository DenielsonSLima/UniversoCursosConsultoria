begin;

alter table public.comunicacao_chats
  add column if not exists public_request_id uuid;

create unique index if not exists comunicacao_chats_public_request_id_uidx
  on public.comunicacao_chats (public_request_id)
  where origem = 'publico' and public_request_id is not null;

comment on column public.comunicacao_chats.public_request_id is
  'Identificador idempotente fornecido na abertura do atendimento publico.';

create or replace function public.broadcast_public_support_history_changed()
returns trigger
language plpgsql
security definer
set search_path = public, realtime, pg_temp
as $$
declare
  v_access_hash text;
begin
  if tg_table_name = 'comunicacao_mensagens' then
    select chat.public_access_hash
      into v_access_hash
    from public.comunicacao_chats chat
    where chat.id = coalesce(new.chat_id, old.chat_id)
      and chat.origem = 'publico';
  elsif coalesce(new.origem, old.origem) = 'publico' then
    v_access_hash := coalesce(new.public_access_hash, old.public_access_hash);
  end if;

  if v_access_hash is not null then
    perform realtime.send(
      jsonb_build_object('changed', true),
      'history-changed',
      'public-support:' || v_access_hash,
      false
    );
  end if;

  return null;
end;
$$;

revoke all on function public.broadcast_public_support_history_changed()
from public, anon, authenticated;

drop trigger if exists comunicacao_mensagens_public_support_broadcast
  on public.comunicacao_mensagens;
create trigger comunicacao_mensagens_public_support_broadcast
after insert or update or delete on public.comunicacao_mensagens
for each row execute function public.broadcast_public_support_history_changed();

drop trigger if exists comunicacao_chats_public_support_broadcast
  on public.comunicacao_chats;
create trigger comunicacao_chats_public_support_broadcast
after update of status on public.comunicacao_chats
for each row
when (old.status is distinct from new.status)
execute function public.broadcast_public_support_history_changed();

commit;
