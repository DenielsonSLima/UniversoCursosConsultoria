begin;

-- O escopo de atendimento usa identidade canônica e permissões explícitas;
-- ter apenas a aba de mensagens não dá acesso a outros polos ou setores.
create or replace function public.comunicacao_normalizar_setor(p_setor text)
returns text language sql immutable set search_path = '' as $$
  select case lower(btrim(coalesce(p_setor, '')))
    when '' then 'atendimento_geral'
    when 'suporte' then 'atendimento_geral'
    when 'atendimento_geral' then 'atendimento_geral'
    when 'financeira' then 'financeiro'
    when 'financeiro' then 'financeiro'
    when 'pedagógica' then 'pedagogico_coordenacao'
    when 'pedagogica' then 'pedagogico_coordenacao'
    when 'pedag_gica' then 'pedagogico_coordenacao'
    when 'pedagogico_coordenacao' then 'pedagogico_coordenacao'
    when 'secretaria' then 'secretaria'
    when 'comercial_matriculas' then 'comercial_matriculas'
    else null
  end;
$$;

create or replace function public.comunicacao_gestor_can_access(
  p_setor text, p_polo_id uuid
)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    auth.uid() is not null
    and public.is_gestor()
    and public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')
    and exists (
      select 1 from public.usuarios_sistema u
      where u.auth_user_id = auth.uid()
        and public.is_active_status(u.status)
        and (
          coalesce(u.pode_visualizar_todos_setores, false)
          or (
            p_polo_id is not null
            and (
              coalesce(u.pode_visualizar_todos_polos, false)
              or u.polo_comunicacao_id = p_polo_id
            )
            and public.comunicacao_normalizar_setor(p_setor) is not null
            and (
              coalesce(u.setor_comunicacao, 'todos') = 'todos'
              or public.comunicacao_normalizar_setor(u.setor_comunicacao)
                = public.comunicacao_normalizar_setor(p_setor)
            )
          )
        )
    ), false
  );
$$;

create or replace function public.can_access_comunicacao_chat(p_chat_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.comunicacao_chats c where c.id = p_chat_id
      and (
        c.remetente_id = public.current_aluno_id()
        or c.remetente_id = public.current_professor_id()
        or public.comunicacao_gestor_can_access(c.setor, c.polo_id)
      )
  );
$$;

create or replace function public.can_manage_comunicacao_chat(p_chat_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.comunicacao_chats c where c.id = p_chat_id
      and public.comunicacao_gestor_can_access(c.setor, c.polo_id)
  );
$$;

create or replace function public.guard_comunicacao_chat_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_partner public.parceiros%rowtype;
  v_category text;
  v_manager boolean;
begin
  -- Atendimento público usa a Edge autenticada por service_role e bearer
  -- específico do chamado. O visitante não ganha acesso à Data API.
  if coalesce(auth.role(), '') = 'service_role' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    if not public.comunicacao_gestor_can_access(old.setor, old.polo_id) then
      raise exception 'Exclusão de atendimento não autorizada.' using errcode = '42501';
    end if;
    -- Autorize a remoção das mensagens enquanto o pai ainda existe. O CASCADE
    -- posterior não deve precisar inferir escopo a partir de um chat removido.
    delete from public.comunicacao_mensagens where chat_id = old.id;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.origem = 'publico'
      or new.public_access_hash is not null
      or new.public_access_expires_at is not null
      or new.public_request_id is not null
    then
      raise exception 'Atendimento público exige o canal autorizado.' using errcode = '42501';
    end if;
    select p.* into v_partner from public.parceiros p
    where p.id = new.remetente_id and p.tipo in ('Aluno', 'Professor')
      and public.is_active_status(p.status);
    if not found then
      raise exception 'Remetente ativo não encontrado.' using errcode = '42501';
    end if;
    new.remetente_nome := v_partner.nome;
    new.remetente_tipo := v_partner.tipo;
    -- Compatibilidade com professor e abertura interna que omitiam roteamento.
    new.polo_id := coalesce(new.polo_id, v_partner.polo_id,
      case when cardinality(v_partner.polo_ids) = 1 then v_partner.polo_ids[1] end);
    if new.categoria_id is not null then
      select c.nome into v_category from public.comunicacao_categorias c
        where c.id = new.categoria_id and coalesce(c.ativo, false);
      if not found then
        raise exception 'Categoria de atendimento inválida.' using errcode = '22023';
      end if;
    end if;
    new.setor := case when nullif(btrim(new.setor), '') is null
      then coalesce(public.comunicacao_normalizar_setor(v_category), 'atendimento_geral')
      else public.comunicacao_normalizar_setor(new.setor) end;
    if new.setor is null then
      raise exception 'Setor de atendimento inválido.' using errcode = '22023';
    end if;
    if new.remetente_id is distinct from public.current_aluno_id()
      and new.remetente_id is distinct from public.current_professor_id()
    then
      if not public.comunicacao_gestor_can_access(new.setor, new.polo_id)
        or (new.polo_id is not null
          and v_partner.polo_id is distinct from new.polo_id
          and not coalesce(new.polo_id = any(v_partner.polo_ids), false))
      then
        raise exception 'Remetente fora do atendimento autorizado.' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  if not public.can_access_comunicacao_chat(old.id) then
    raise exception 'Atendimento não autorizado.' using errcode = '42501';
  end if;
  if new.id is distinct from old.id
    or new.remetente_id is distinct from old.remetente_id
    or new.remetente_nome is distinct from old.remetente_nome
    or new.remetente_tipo is distinct from old.remetente_tipo
    or new.origem is distinct from old.origem
    or new.public_access_hash is distinct from old.public_access_hash
    or new.public_access_expires_at is distinct from old.public_access_expires_at
    or new.public_request_id is distinct from old.public_request_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Identidade e acesso do atendimento são imutáveis.' using errcode = '42501';
  end if;
  v_manager := public.comunicacao_gestor_can_access(old.setor, old.polo_id);
  if not v_manager then
    if (to_jsonb(new) - array['ultimo_texto', 'ultima_data', 'updated_at',
      'deleted_by_aluno', 'notificar_resposta']) is distinct from
      (to_jsonb(old) - array['ultimo_texto', 'ultima_data', 'updated_at',
      'deleted_by_aluno', 'notificar_resposta'])
    then
      raise exception 'O titular não pode alterar o roteamento do atendimento.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.categoria_id is distinct from old.categoria_id then
    if new.categoria_id is not null then
      select c.nome into v_category from public.comunicacao_categorias c
        where c.id = new.categoria_id and coalesce(c.ativo, false);
      if not found then
        raise exception 'Categoria de atendimento inválida.' using errcode = '22023';
      end if;
    end if;
    new.setor := coalesce(public.comunicacao_normalizar_setor(v_category), 'atendimento_geral');
  end if;
  if not public.comunicacao_gestor_can_access(new.setor, new.polo_id) then
    raise exception 'Destino do atendimento fora do escopo autorizado.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.comunicacao_normalizar_setor(text) from public, anon;
revoke all on function public.comunicacao_gestor_can_access(text, uuid) from public, anon;
revoke all on function public.can_access_comunicacao_chat(uuid) from public, anon;
revoke all on function public.can_manage_comunicacao_chat(uuid) from public, anon;
revoke all on function public.guard_comunicacao_chat_scope() from public, anon, authenticated;
grant execute on function public.comunicacao_normalizar_setor(text),
  public.comunicacao_gestor_can_access(text, uuid),
  public.can_access_comunicacao_chat(uuid), public.can_manage_comunicacao_chat(uuid)
  to authenticated, service_role;

drop trigger if exists a10_guard_comunicacao_chat_scope on public.comunicacao_chats;
create trigger a10_guard_comunicacao_chat_scope
before insert or update or delete on public.comunicacao_chats
for each row execute function public.guard_comunicacao_chat_scope();

drop policy if exists portal_comunicacao_chats_access on public.comunicacao_chats;
create policy portal_comunicacao_chats_select on public.comunicacao_chats
for select to authenticated using (
  remetente_id = public.current_aluno_id() or remetente_id = public.current_professor_id()
  or public.comunicacao_gestor_can_access(setor, polo_id)
);
create policy portal_comunicacao_chats_insert on public.comunicacao_chats
for insert to authenticated with check (
  remetente_id = public.current_aluno_id() or remetente_id = public.current_professor_id()
  or public.comunicacao_gestor_can_access(setor, polo_id)
);
create policy portal_comunicacao_chats_update on public.comunicacao_chats
for update to authenticated using (
  remetente_id = public.current_aluno_id() or remetente_id = public.current_professor_id()
  or public.comunicacao_gestor_can_access(setor, polo_id)
) with check (
  remetente_id = public.current_aluno_id() or remetente_id = public.current_professor_id()
  or public.comunicacao_gestor_can_access(setor, polo_id)
);
create policy portal_comunicacao_chats_delete on public.comunicacao_chats
for delete to authenticated using (public.comunicacao_gestor_can_access(setor, polo_id));

comment on function public.comunicacao_gestor_can_access(text, uuid) is
  'Escopo do chat institucional: aba, identidade ativa, polo e setor; abrangência global somente por flags explícitas.';
create or replace function public.can_upload_anexo_storage_object(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_chat_id uuid;
  v_actor_type text;
  v_actor_id text;
begin
  if split_part(p_name, '/', 1) <> 'comunicacao'
    or split_part(p_name, '/', 2) <> 'chats'
    or split_part(p_name, '/', 3) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then return false; end if;
  v_chat_id := split_part(p_name, '/', 3)::uuid;
  v_actor_type := split_part(p_name, '/', 4);
  v_actor_id := split_part(p_name, '/', 5);
  if not public.can_access_comunicacao_chat(v_chat_id) then return false; end if;
  return case v_actor_type
    when 'aluno' then v_actor_id = coalesce(public.current_aluno_id()::text, '')
    when 'professor' then v_actor_id = coalesce(public.current_professor_id()::text, '')
    when 'gestor' then public.can_manage_comunicacao_chat(v_chat_id)
    else false end;
end;
$$;

create or replace function public.can_read_anexo_storage_object(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.comunicacao_mensagens m
    where public.can_access_comunicacao_chat(m.chat_id)
      and (m.anexo_path = p_name or (
        m.anexo_path is null and m.anexo_url is not null
        and (m.anexo_url = p_name
          or right(m.anexo_url, length('/anexos/' || p_name)) = '/anexos/' || p_name)
      ))
  );
$$;

create or replace function public.can_delete_anexo_storage_object(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_chat_id uuid;
begin
  if split_part(p_name, '/', 1) = 'comunicacao'
    and split_part(p_name, '/', 2) = 'chats'
    and split_part(p_name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    v_chat_id := split_part(p_name, '/', 3)::uuid;
    if public.can_manage_comunicacao_chat(v_chat_id) then return true; end if;
  end if;
  -- Caminhos legados só podem ser removidos pelo gestor do chat vinculado.
  return exists (
    select 1 from public.comunicacao_mensagens m
    where public.can_manage_comunicacao_chat(m.chat_id)
      and (m.anexo_path = p_name or m.anexo_url = p_name
        or right(m.anexo_url, length('/anexos/' || p_name)) = '/anexos/' || p_name)
  );
end;
$$;

revoke all on function public.can_upload_anexo_storage_object(text),
  public.can_read_anexo_storage_object(text), public.can_delete_anexo_storage_object(text)
  from public, anon;
grant execute on function public.can_upload_anexo_storage_object(text),
  public.can_read_anexo_storage_object(text), public.can_delete_anexo_storage_object(text)
  to authenticated, service_role;

drop policy if exists portal_anexos_delete on storage.objects;
create policy portal_anexos_delete on storage.objects for delete to authenticated
using (bucket_id = 'anexos' and (
  public.can_delete_anexo_storage_object(name)
  or (owner = auth.uid() and public.can_upload_anexo_storage_object(name))
));

drop policy if exists portal_comunicacao_mensagens_access on public.comunicacao_mensagens;
drop policy if exists portal_comunicacao_mensagens_select on public.comunicacao_mensagens;
drop policy if exists portal_comunicacao_mensagens_insert on public.comunicacao_mensagens;
drop policy if exists portal_comunicacao_mensagens_update on public.comunicacao_mensagens;
drop policy if exists portal_comunicacao_mensagens_delete on public.comunicacao_mensagens;
create policy portal_comunicacao_mensagens_select on public.comunicacao_mensagens
for select to authenticated using (public.can_access_comunicacao_chat(chat_id));
create policy portal_comunicacao_mensagens_insert on public.comunicacao_mensagens
for insert to authenticated with check (public.can_access_comunicacao_chat(chat_id));
create policy portal_comunicacao_mensagens_update on public.comunicacao_mensagens
for update to authenticated using (public.can_access_comunicacao_chat(chat_id))
with check (public.can_access_comunicacao_chat(chat_id));
create policy portal_comunicacao_mensagens_delete on public.comunicacao_mensagens
for delete to authenticated using (public.can_manage_comunicacao_chat(chat_id));

CREATE OR REPLACE FUNCTION public.guard_comunicacao_mensagem_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_aluno_id uuid := public.current_aluno_id();
  v_professor_id uuid := public.current_professor_id();
  v_gestor_id uuid;
  v_actor_name text;
  v_can_manage boolean;
  v_chat_id uuid;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_chat_id := case when tg_op = 'DELETE' then old.chat_id else new.chat_id end;
  v_can_manage := public.can_manage_comunicacao_chat(v_chat_id);
  if not public.can_access_comunicacao_chat(v_chat_id) then
    raise exception 'Atendimento fora do escopo autorizado.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.chat_id is distinct from old.chat_id
      or new.remetente_id is distinct from old.remetente_id
      or new.remetente_nome is distinct from old.remetente_nome
      or new.remetente_tipo is distinct from old.remetente_tipo
      or new.conteudo is distinct from old.conteudo
      or new.anexo_url is distinct from old.anexo_url
      or new.anexo_path is distinct from old.anexo_path
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Somente o status de leitura da mensagem pode ser alterado.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not v_can_manage then
      raise exception 'Somente o gestor pode excluir mensagens.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if nullif(btrim(coalesce(new.conteudo, '')), '') is null
    or length(new.conteudo) > 10000
  then
    raise exception 'A mensagem deve possuir entre 1 e 10000 caracteres.'
      using errcode = '23514';
  end if;

  if v_aluno_id is not null and exists (
    select 1 from public.comunicacao_chats c
    where c.id = new.chat_id and c.remetente_id = v_aluno_id
  ) then
    select p.nome into v_actor_name
    from public.parceiros p where p.id = v_aluno_id;
    new.remetente_id := v_aluno_id;
    new.remetente_nome := coalesce(nullif(btrim(v_actor_name), ''), 'Aluno');
    new.remetente_tipo := 'aluno';
  elsif v_professor_id is not null and exists (
    select 1 from public.comunicacao_chats c
    where c.id = new.chat_id and c.remetente_id = v_professor_id
  ) then
    select p.nome into v_actor_name
    from public.parceiros p where p.id = v_professor_id;
    new.remetente_id := v_professor_id;
    new.remetente_nome := coalesce(nullif(btrim(v_actor_name), ''), 'Professor');
    new.remetente_tipo := 'professor';
  elsif v_can_manage then
    if lower(coalesce(new.remetente_tipo, '')) = 'sistema' then
      new.remetente_id := null;
      new.remetente_nome := 'Sistema';
      new.remetente_tipo := 'sistema';
    else
      select u.id, u.nome into v_gestor_id, v_actor_name
      from public.usuarios_sistema u
      where lower(u.email) = public.auth_email()
        and public.is_active_status(u.status)
      order by u.created_at desc nulls last
      limit 1;

      if v_gestor_id is null then
        raise exception 'Gestor autenticado não encontrado.'
          using errcode = '42501';
      end if;

      new.remetente_id := v_gestor_id;
      new.remetente_nome := coalesce(nullif(btrim(v_actor_name), ''), 'Gestor');
      new.remetente_tipo := 'gestor';
    end if;
  else
    raise exception 'Usuário sem permissão para enviar mensagem neste atendimento.'
      using errcode = '42501';
  end if;

  if new.anexo_path is not null
    and not public.can_upload_anexo_storage_object(new.anexo_path)
  then
    raise exception 'Anexo fora do atendimento autorizado.'
      using errcode = '42501';
  end if;

  -- Novas mensagens usam exclusivamente paths no bucket privado.
  new.anexo_url := null;
  return new;
end;
$function$;

revoke all on function public.guard_comunicacao_mensagem_write() from public, anon, authenticated;
commit;
