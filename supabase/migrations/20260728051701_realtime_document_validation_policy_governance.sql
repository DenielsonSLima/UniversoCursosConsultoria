-- Ledger remoto: 20260728051701.
-- Governança de leitura e Realtime para políticas públicas documentais.
--
-- A escrita continua exclusivamente nas RPCs SECURITY DEFINER versionadas.
-- Realtime publica somente a política vigente. O histórico contém ator_id e
-- permanece acessível exclusivamente pela projeção audit-safe da RPC.

alter table public.documentos_validacao_politicas
  enable row level security;

-- Remove políticas de escrita legadas. Os privilégios já haviam sido
-- revogados no P1, mas retirar as policies fecha também futuras concessões
-- acidentais e torna explícito que a tabela é somente leitura para clientes.
drop policy if exists "portal_documentos_validacao_politicas_insert"
  on public.documentos_validacao_politicas;
drop policy if exists "portal_documentos_validacao_politicas_update"
  on public.documentos_validacao_politicas;
drop policy if exists "portal_documentos_validacao_politicas_delete"
  on public.documentos_validacao_politicas;
drop policy if exists "portal_documentos_validacao_politicas_write"
  on public.documentos_validacao_politicas;

drop policy if exists "portal_documentos_validacao_politicas_read"
  on public.documentos_validacao_politicas;
drop policy if exists "gestores_consultam_politicas_validacao"
  on public.documentos_validacao_politicas;

create policy "gestores_consultam_politicas_validacao"
  on public.documentos_validacao_politicas
  for select
  to authenticated
  using (
    (select public.gestor_has_any_module(
      array['cadastros', 'secretaria']::text[]
    ))
  );

revoke all on table public.documentos_validacao_politicas
  from public, anon, authenticated;
grant select on table public.documentos_validacao_politicas
  to authenticated;

-- service_role conserva somente a leitura direta. Atualizações permanecem
-- obrigatoriamente na RPC v2 para gerar versão e histórico atômicos.
revoke insert, update, delete, truncate, references, trigger
  on table public.documentos_validacao_politicas
  from service_role;
grant select on table public.documentos_validacao_politicas
  to service_role;

-- O histórico bruto não pode ser consultado por PostgREST nem enviado pelo
-- WAL a clientes autenticados, pois contém o identificador interno do ator.
-- Remover também a policy faz a RLS falhar fechada mesmo se um GRANT direto
-- for concedido acidentalmente no futuro.
drop policy if exists "gestores_consultam_historico_politicas_validacao"
  on public.documentos_validacao_politicas_historico;

revoke all on table public.documentos_validacao_politicas_historico
  from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.documentos_validacao_politicas_historico
  from service_role;
grant select on table public.documentos_validacao_politicas_historico
  to service_role;

-- A chave primária é documento. Usá-la como replica identity permite que
-- UPDATE/DELETE identifiquem a política sem expor a linha antiga completa.
alter table public.documentos_validacao_politicas
  replica identity using index documentos_validacao_politicas_pkey;

do $publication$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'A publicação supabase_realtime não está disponível.'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'documentos_validacao_politicas'
  ) then
    alter publication supabase_realtime
      add table public.documentos_validacao_politicas;
  end if;

  -- Remove também uma inscrição pré-existente: manter a tabela fora da
  -- publicação evita que o payload bruto de INSERT exponha ator_id.
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'documentos_validacao_politicas_historico'
  ) then
    alter publication supabase_realtime
      drop table public.documentos_validacao_politicas_historico;
  end if;
end;
$publication$;

create or replace function
  public.listar_historico_politica_validacao_documento(p_documento text)
returns table (
  documento text,
  versao integer,
  prefixo text,
  campos_publicos text[],
  consulta_publica_ativa boolean,
  validacao_publica boolean,
  validade_dias integer,
  ator_role text,
  motivo text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_documento text := nullif(btrim(coalesce(p_documento, '')), '');
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.gestor_has_any_global_module(
      array['cadastros', 'secretaria']::text[]
    )
  then
    raise exception 'Consulta ao histórico de políticas não autorizada.'
      using errcode = '42501';
  end if;

  if v_documento is null then
    raise exception 'Informe o tipo de documento.'
      using errcode = '22023';
  end if;

  return query
  select
    history.documento,
    history.versao,
    history.prefixo,
    history.campos_publicos,
    history.consulta_publica_ativa,
    history.validacao_publica,
    history.validade_dias,
    history.ator_role,
    history.motivo,
    history.created_at
  from public.documentos_validacao_politicas_historico history
  where history.documento = v_documento
  order by history.versao desc, history.created_at desc;
end;
$function$;

revoke all on function
  public.listar_historico_politica_validacao_documento(text)
  from public, anon;
grant execute on function
  public.listar_historico_politica_validacao_documento(text)
  to authenticated, service_role;

comment on function
  public.listar_historico_politica_validacao_documento(text) is
  'Lista versões auditáveis da política sem expor o identificador pessoal do ator.';
