begin;

-- Mantém compatibilidade com os seis grupos legados da Secretaria enquanto
-- novos perfis passam a salvar cada operação visível individualmente.
create or replace function public.gestor_has_tab(p_module text, p_tab text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.gestor_has_module(p_module)
    and case
      when jsonb_typeof(public.gestor_effective_permissions() -> 'tabs' -> p_module) = 'array' then exists (
        select 1
        from jsonb_array_elements_text(
          public.gestor_effective_permissions() -> 'tabs' -> p_module
        ) tab_value(value)
        where tab_value.value = p_tab
          or (
            p_module = 'secretaria'
            and (
              (p_tab = 'carteirinhas' and tab_value.value in (
                'carteirinha', 'cracha-estagio', 'cracha-periodo-eleitoral'
              ))
              or (p_tab = 'declaracoes' and tab_value.value in (
                'declaracao-matricula', 'declaracao-frequencia', 'boletim',
                'atestado-conclusao', 'declaracao-irpf'
              ))
              or (p_tab = 'historico' and tab_value.value in (
                'historico-escolar', 'certificados', 'historico-emissoes'
              ))
              or (p_tab = 'solicitacoes' and tab_value.value in (
                'solicitacoes', 'rematricula', 'termo-estagio', 'transferencia'
              ))
              or (p_tab = 'recebimentos' and tab_value.value = 'consulta-financeira')
              or (p_tab = 'fichas' and tab_value.value in (
                'pasta-identificacao', 'ficha-matricula'
              ))
            )
          )
      )
      when p_module = 'financeiro' then public.gestor_has_financeiro_tab(p_tab)
      else true
    end;
$$;

revoke execute on function public.gestor_has_tab(text, text) from public, anon;
grant execute on function public.gestor_has_tab(text, text) to authenticated, service_role;

-- A emissão é validada pela operação exata. Os nomes antigos continuam
-- aceitos somente para perfis já cadastrados.
create or replace function public.can_manage_secretaria_document(
  p_documento text,
  p_polo_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.role()), '') = 'service_role'
    or (
      case
        when p_documento = 'carteirinha' then
          public.gestor_has_tab('secretaria', 'carteirinha')
          or public.gestor_has_tab('secretaria', 'carteirinhas')
        when p_documento = 'cracha_estagio' then
          public.gestor_has_tab('secretaria', 'cracha-estagio')
          or public.gestor_has_tab('secretaria', 'carteirinhas')
        when p_documento = 'cracha_periodo_eleitoral' then
          public.gestor_has_tab('secretaria', 'cracha-periodo-eleitoral')
          or public.gestor_has_tab('secretaria', 'carteirinhas')
        when p_documento = 'declaracao_matricula' then
          public.gestor_has_tab('secretaria', 'declaracao-matricula')
          or public.gestor_has_tab('secretaria', 'declaracoes')
          or public.gestor_has_module('parceiros')
        when p_documento = 'declaracao_frequencia' then
          public.gestor_has_tab('secretaria', 'declaracao-frequencia')
          or public.gestor_has_tab('secretaria', 'declaracoes')
        when p_documento = 'boletim' then
          public.gestor_has_tab('secretaria', 'boletim')
          or public.gestor_has_tab('secretaria', 'declaracoes')
        when p_documento = 'atestado_conclusao_tecnico' then
          public.gestor_has_tab('secretaria', 'atestado-conclusao')
          or public.gestor_has_tab('secretaria', 'declaracoes')
        when p_documento = 'declaracao_irpf' then
          public.gestor_has_tab('secretaria', 'declaracao-irpf')
          or public.gestor_has_tab('secretaria', 'declaracoes')
          or public.gestor_has_module('parceiros')
        when p_documento = 'historico_escolar' then
          public.gestor_has_tab('secretaria', 'historico-escolar')
          or public.gestor_has_tab('secretaria', 'historico')
        when p_documento in (
          'certificado_tecnico', 'certificado_ead',
          'certificado_livre', 'certificado_especializacao'
        ) then
          public.gestor_has_tab('secretaria', 'certificados')
          or public.gestor_has_tab('secretaria', 'historico')
        when p_documento = 'rematricula' then
          public.gestor_has_tab('secretaria', 'rematricula')
          or public.gestor_has_tab('secretaria', 'solicitacoes')
        when p_documento = 'termo_estagio' then
          public.gestor_has_tab('secretaria', 'termo-estagio')
          or public.gestor_has_tab('secretaria', 'solicitacoes')
        when p_documento = 'transferencia' then
          public.gestor_has_tab('secretaria', 'transferencia')
          or public.gestor_has_tab('secretaria', 'solicitacoes')
        when p_documento = 'pasta_identificacao' then
          public.gestor_has_tab('secretaria', 'pasta-identificacao')
          or public.gestor_has_tab('secretaria', 'fichas')
        when p_documento = 'ficha_matricula' then
          public.gestor_has_tab('secretaria', 'ficha-matricula')
          or public.gestor_has_tab('secretaria', 'fichas')
        else false
      end
      and case
        when p_polo_id is null then public.gestor_has_all_polos()
        else public.is_gestor_for_polo(p_polo_id)
      end
    );
$$;

revoke all on function public.can_manage_secretaria_document(text, uuid)
  from public, anon;
grant execute on function public.can_manage_secretaria_document(text, uuid)
  to authenticated, service_role;

-- Uma conta só é descartável quando não possui operação auditada nem qualquer
-- registro público ligado ao seu usuário do portal ou identidade Auth.
create or replace function public.usuario_sistema_tem_atividade(
  p_usuario_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_auth_id uuid;
  v_reference record;
  v_reference_id uuid;
  v_has_reference boolean;
begin
  select lower(nullif(btrim(usuario.email), ''))
  into v_email
  from public.usuarios_sistema usuario
  where usuario.id = p_usuario_id;

  if v_email is null then
    return false;
  end if;

  select identidade.id
  into v_auth_id
  from auth.users identidade
  where lower(coalesce(identidade.email, '')) = v_email
  order by identidade.created_at desc
  limit 1;

  if exists (
    select 1
    from public.sistema_eventos evento
    where lower(coalesce(evento.actor_email, '')) = v_email
      or evento.actor_id in (p_usuario_id, v_auth_id)
  ) then
    return true;
  end if;

  for v_reference in
    select
      namespace.nspname as schema_name,
      relation.relname as table_name,
      attribute.attname as column_name,
      constraint_record.confrelid = 'auth.users'::regclass as references_auth
    from pg_catalog.pg_constraint constraint_record
    join pg_catalog.pg_class relation
      on relation.oid = constraint_record.conrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = relation.oid
     and attribute.attnum = constraint_record.conkey[1]
    where constraint_record.contype = 'f'
      and namespace.nspname = 'public'
      and cardinality(constraint_record.conkey) = 1
      and constraint_record.confrelid in (
        'public.usuarios_sistema'::regclass,
        'auth.users'::regclass
      )
      and relation.relname <> 'usuarios_sistema'
  loop
    v_reference_id := case
      when v_reference.references_auth then v_auth_id
      else p_usuario_id
    end;

    if v_reference_id is null then
      continue;
    end if;

    execute format(
      'select exists (select 1 from %I.%I where %I = $1)',
      v_reference.schema_name,
      v_reference.table_name,
      v_reference.column_name
    )
    into v_has_reference
    using v_reference_id;

    if coalesce(v_has_reference, false) then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

revoke all on function public.usuario_sistema_tem_atividade(uuid)
  from public, anon, authenticated;
grant execute on function public.usuario_sistema_tem_atividade(uuid)
  to service_role;

create or replace function public.proteger_exclusao_usuario_sistema()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(nullif(btrim(coalesce(old.email, '')), ''));
  v_actor_email text := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
begin
  if v_email is not null and v_email = v_actor_email then
    raise exception 'Você não pode excluir o próprio usuário.'
      using errcode = '42501';
  end if;

  if public.usuario_sistema_tem_atividade(old.id) then
    raise exception
      'Este usuário possui histórico de atividades e deve ser apenas inativado.'
      using errcode = '23503';
  end if;

  if v_email is not null
    and not exists (
      select 1
      from public.usuarios_sistema outro
      where outro.id <> old.id
        and lower(coalesce(outro.email, '')) = v_email
    )
    and not exists (
      select 1
      from public.parceiros parceiro
      where lower(coalesce(parceiro.email, '')) = v_email
    )
  then
    delete from auth.users identidade
    where lower(coalesce(identidade.email, '')) = v_email;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_proteger_exclusao_usuario_sistema
  on public.usuarios_sistema;
create trigger trg_proteger_exclusao_usuario_sistema
before delete on public.usuarios_sistema
for each row
execute function public.proteger_exclusao_usuario_sistema();

revoke all on function public.proteger_exclusao_usuario_sistema()
  from public, anon, authenticated;
grant execute on function public.proteger_exclusao_usuario_sistema()
  to service_role;

commit;
