begin;

create or replace function public.guard_comunicacao_mensagem_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aluno_id uuid := public.current_aluno_id();
  v_professor_id uuid := public.current_professor_id();
  v_gestor_id uuid;
  v_actor_name text;
  v_can_manage boolean := public.gestor_has_tab(
    'comunicacao',
    'comunicacao-mensagem'
  );
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return case when tg_op = 'DELETE' then old else new end;
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
$$;

revoke all on function public.guard_comunicacao_mensagem_write()
  from public, anon, authenticated;

drop trigger if exists guard_comunicacao_mensagem_write
  on public.comunicacao_mensagens;
create trigger guard_comunicacao_mensagem_write
before insert or update or delete on public.comunicacao_mensagens
for each row execute function public.guard_comunicacao_mensagem_write();

drop policy if exists portal_comunicacao_mensagens_access
  on public.comunicacao_mensagens;
drop policy if exists portal_comunicacao_mensagens_select
  on public.comunicacao_mensagens;
drop policy if exists portal_comunicacao_mensagens_insert
  on public.comunicacao_mensagens;
drop policy if exists portal_comunicacao_mensagens_update
  on public.comunicacao_mensagens;
drop policy if exists portal_comunicacao_mensagens_delete
  on public.comunicacao_mensagens;

create policy portal_comunicacao_mensagens_select
on public.comunicacao_mensagens
for select to authenticated
using (
  public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')
  or exists (
    select 1 from public.comunicacao_chats c
    where c.id = comunicacao_mensagens.chat_id
      and c.remetente_id in (
        public.current_aluno_id(),
        public.current_professor_id()
      )
  )
);

create policy portal_comunicacao_mensagens_insert
on public.comunicacao_mensagens
for insert to authenticated
with check (
  public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')
  or exists (
    select 1 from public.comunicacao_chats c
    where c.id = comunicacao_mensagens.chat_id
      and c.remetente_id in (
        public.current_aluno_id(),
        public.current_professor_id()
      )
  )
);

create policy portal_comunicacao_mensagens_update
on public.comunicacao_mensagens
for update to authenticated
using (
  public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')
  or exists (
    select 1 from public.comunicacao_chats c
    where c.id = comunicacao_mensagens.chat_id
      and c.remetente_id in (
        public.current_aluno_id(),
        public.current_professor_id()
      )
  )
)
with check (
  public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')
  or exists (
    select 1 from public.comunicacao_chats c
    where c.id = comunicacao_mensagens.chat_id
      and c.remetente_id in (
        public.current_aluno_id(),
        public.current_professor_id()
      )
  )
);

create policy portal_comunicacao_mensagens_delete
on public.comunicacao_mensagens
for delete to authenticated
using (public.gestor_has_tab('comunicacao', 'comunicacao-mensagem'));

commit;
