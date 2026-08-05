-- CPF e Turnstile não comprovam identidade. Novos chamados abertos sem sessão
-- devem permanecer como visitantes e nunca herdar a autorização do aluno.
--
-- Esta proteção atua somente em novas inserções. Registros históricos não são
-- reescritos, preservando a atribuição necessária para auditoria.
begin;

create or replace function public.enforce_public_support_visitor_chat()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.origem = 'publico' then
    new.remetente_id := null;
    new.remetente_tipo := 'Visitante';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_public_support_visitor_chat
  on public.comunicacao_chats;

create trigger trg_enforce_public_support_visitor_chat
before insert on public.comunicacao_chats
for each row
when (new.origem = 'publico')
execute function public.enforce_public_support_visitor_chat();

create or replace function public.enforce_public_support_visitor_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.remetente_id is not null
     and lower(coalesce(new.remetente_tipo, '')) = 'aluno'
     and exists (
       select 1
       from public.comunicacao_chats as chat
       where chat.id = new.chat_id
         and chat.origem = 'publico'
     )
  then
    new.remetente_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_public_support_visitor_message
  on public.comunicacao_mensagens;

create trigger trg_enforce_public_support_visitor_message
before insert on public.comunicacao_mensagens
for each row
execute function public.enforce_public_support_visitor_message();

revoke all on function public.enforce_public_support_visitor_chat()
  from public, anon, authenticated;
revoke all on function public.enforce_public_support_visitor_message()
  from public, anon, authenticated;

commit;
