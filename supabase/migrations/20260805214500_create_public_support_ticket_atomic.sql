-- Cria o chamado público e sua primeira mensagem na mesma transação.
-- A trava pelo requestId faz retries devolverem o protocolo já confirmado.
begin;

create or replace function public.create_public_support_ticket_idempotent(
  p_request_id uuid,
  p_requester_id uuid,
  p_requester_name text,
  p_requester_type text,
  p_polo_id uuid,
  p_sector text,
  p_subject text,
  p_protocol text,
  p_message text,
  p_notify_reply boolean,
  p_access_hash text,
  p_expires_at timestamptz
)
returns table (
  id uuid,
  status text,
  protocolo text,
  created_at timestamptz,
  public_access_hash text,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chat_id uuid;
  v_status text;
  v_protocol text;
  v_created_at timestamptz;
  v_stored_access_hash text;
begin
  if p_requester_name is null or length(btrim(p_requester_name)) < 2
     or p_requester_type not in ('Aluno', 'Visitante')
     or p_polo_id is null
     or p_sector is null or length(btrim(p_sector)) < 2
     or p_subject is null or length(btrim(p_subject)) not between 2 and 180
     or p_protocol is null or length(btrim(p_protocol)) < 8
     or p_message is null or length(btrim(p_message)) not between 1 and 4000
     or p_access_hash is null or p_access_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at is null or p_expires_at <= now()
  then
    raise exception 'Dados inválidos para abertura do atendimento público.'
      using errcode = '22023';
  end if;

  if p_request_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('public-support-request:' || p_request_id::text, 0)
    );

    select
      chat.id,
      chat.status,
      chat.protocolo,
      chat.created_at,
      chat.public_access_hash
    into
      v_chat_id,
      v_status,
      v_protocol,
      v_created_at,
      v_stored_access_hash
    from public.comunicacao_chats as chat
    where chat.origem = 'publico'
      and chat.public_request_id = p_request_id
    limit 1;

    if v_chat_id is not null then
      if v_stored_access_hash is distinct from p_access_hash then
        raise exception 'A solicitação já existe com outra credencial.'
          using errcode = '23505';
      end if;

      return query select
        v_chat_id,
        v_status,
        v_protocol,
        v_created_at,
        v_stored_access_hash,
        false;
      return;
    end if;
  end if;

  insert into public.comunicacao_chats (
    remetente_id,
    remetente_nome,
    remetente_tipo,
    status,
    origem,
    polo_id,
    setor,
    assunto,
    protocolo,
    ultimo_texto,
    ultima_data,
    notificar_resposta,
    public_access_hash,
    public_access_expires_at,
    public_request_id
  ) values (
    p_requester_id,
    btrim(p_requester_name),
    p_requester_type,
    'pendente',
    'publico',
    p_polo_id,
    btrim(p_sector),
    btrim(p_subject),
    btrim(p_protocol),
    btrim(p_message),
    now(),
    coalesce(p_notify_reply, false),
    p_access_hash,
    p_expires_at,
    p_request_id
  )
  returning
    comunicacao_chats.id,
    comunicacao_chats.status,
    comunicacao_chats.protocolo,
    comunicacao_chats.created_at,
    comunicacao_chats.public_access_hash
  into
    v_chat_id,
    v_status,
    v_protocol,
    v_created_at,
    v_stored_access_hash;

  insert into public.comunicacao_mensagens (
    chat_id,
    remetente_id,
    remetente_nome,
    remetente_tipo,
    conteudo
  ) values (
    v_chat_id,
    p_requester_id,
    btrim(p_requester_name),
    'aluno',
    btrim(p_message)
  );

  return query select
    v_chat_id,
    v_status,
    v_protocol,
    v_created_at,
    v_stored_access_hash,
    true;
end;
$$;

comment on function public.create_public_support_ticket_idempotent(
  uuid, uuid, text, text, uuid, text, text, text, text, boolean, text, timestamptz
) is
  'Cria atomicamente chamado público e mensagem inicial; retries com o mesmo requestId devolvem o protocolo confirmado.';

revoke all on function public.create_public_support_ticket_idempotent(
  uuid, uuid, text, text, uuid, text, text, text, text, boolean, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_public_support_ticket_idempotent(
  uuid, uuid, text, text, uuid, text, text, text, text, boolean, text, timestamptz
) to service_role;

commit;
