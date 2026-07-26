-- Congela o layout junto com os dados cadastrais na mesma transação da emissão
-- e remove a ampliação automática de acesso para perfis restritos da Secretaria.

create or replace function public.emitir_ficha_validacao_portal(
  p_documento text,
  p_matricula_id uuid,
  p_periodo_referencia text default null,
  p_emitido_por uuid default null,
  p_registrar_reemissao boolean default false,
  p_dados_emissao jsonb default '{}'::jsonb
)
returns table(
  codigo text,
  documento text,
  emitido_em timestamptz,
  ultima_emissao_em timestamptz,
  validade_ate timestamptz,
  status text,
  quantidade_emissoes integer,
  reutilizado boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_polo_id uuid;
  v_issue record;
begin
  if p_documento not in ('pasta_identificacao', 'ficha_matricula') then
    raise exception 'Documento incompatível com a emissão de ficha cadastral.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_dados_emissao, '{}'::jsonb)) <> 'object' then
    raise exception 'O snapshot da ficha deve ser um objeto JSON.'
      using errcode = '22023';
  end if;

  select t.polo_id
  into v_polo_id
  from public.matriculas m
  join public.turmas t on t.id = m.turma_id
  where m.id = p_matricula_id;

  if not found then
    raise exception 'Matrícula não localizada.';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.can_manage_secretaria_document(p_documento, v_polo_id)
  then
    raise exception 'Acesso à emissão desta ficha não autorizado.'
      using errcode = '42501';
  end if;

  select issued.*
  into v_issue
  from public.emitir_documento_validacao_portal(
    p_documento,
    p_matricula_id,
    p_periodo_referencia,
    null,
    null,
    p_emitido_por,
    p_registrar_reemissao
  ) as issued;

  if v_issue.codigo is null then
    raise exception 'A emissão não retornou um código de validação.';
  end if;

  update public.documentos_validacao as validation
  set dados_emissao =
    coalesce(validation.dados_emissao, '{}'::jsonb)
    || coalesce(p_dados_emissao, '{}'::jsonb)
  where validation.codigo = v_issue.codigo;

  if not found then
    raise exception 'O snapshot não pôde ser associado ao documento emitido.';
  end if;

  codigo := v_issue.codigo;
  documento := v_issue.documento;
  emitido_em := v_issue.emitido_em;
  ultima_emissao_em := v_issue.ultima_emissao_em;
  validade_ate := v_issue.validade_ate;
  status := v_issue.status;
  quantidade_emissoes := v_issue.quantidade_emissoes;
  reutilizado := v_issue.reutilizado;
  return next;
end;
$function$;

revoke all on function public.emitir_ficha_validacao_portal(
  text, uuid, text, uuid, boolean, jsonb
) from public, anon;
grant execute on function public.emitir_ficha_validacao_portal(
  text, uuid, text, uuid, boolean, jsonb
) to authenticated, service_role;

drop function if exists public.atualizar_snapshot_ficha_portal(text, jsonb);

update public.perfis_acesso as profile
set permissoes = jsonb_set(
  profile.permissoes,
  '{tabs,secretaria}',
  (
    select coalesce(jsonb_agg(item.value), '[]'::jsonb)
    from jsonb_array_elements(
      coalesce(profile.permissoes #> '{tabs,secretaria}', '[]'::jsonb)
    ) as item(value)
    where item.value <> to_jsonb('fichas'::text)
  ),
  true
)
where coalesce(profile.permissoes #> '{tabs,secretaria}', '[]'::jsonb) ? 'fichas'
  and not (
    coalesce(profile.permissoes #> '{tabs,secretaria}', '[]'::jsonb) ? 'declaracoes'
    and coalesce(profile.permissoes #> '{tabs,secretaria}', '[]'::jsonb) ? 'historico'
  );

update public.usuarios_sistema as access_user
set permissoes = jsonb_set(
  access_user.permissoes,
  '{tabs,secretaria}',
  (
    select coalesce(jsonb_agg(item.value), '[]'::jsonb)
    from jsonb_array_elements(
      coalesce(access_user.permissoes #> '{tabs,secretaria}', '[]'::jsonb)
    ) as item(value)
    where item.value <> to_jsonb('fichas'::text)
  ),
  true
)
where access_user.perfil_acesso_id is null
  and coalesce(access_user.permissoes #> '{tabs,secretaria}', '[]'::jsonb) ? 'fichas'
  and not (
    coalesce(access_user.permissoes #> '{tabs,secretaria}', '[]'::jsonb) ? 'declaracoes'
    and coalesce(access_user.permissoes #> '{tabs,secretaria}', '[]'::jsonb) ? 'historico'
  );
