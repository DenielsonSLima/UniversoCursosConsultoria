-- Lote 2026-08-09: congela cabeçalho e marca d'água somente no primeiro
-- snapshot oficial de Pasta/Ficha. Replays e documentos históricos não são
-- preenchidos ou alterados retroativamente.

begin;

create or replace function public.capture_student_registration_brand_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_brand record;
begin
  if new.documento not in ('pasta_identificacao', 'ficha_matricula')
    or jsonb_typeof(coalesce(new.dados_emissao, '{}'::jsonb)) <> 'object'
    or not (new.dados_emissao ? 'documentTemplateSnapshot')
    or coalesce(old.dados_emissao, '{}'::jsonb) ? 'documentTemplateSnapshot'
  then
    return new;
  end if;

  select
    pole.nome,
    pole.cnpj,
    coalesce(nullif(btrim(pole.endereco), ''), nullif(btrim(company.endereco), '')) as endereco,
    coalesce(nullif(btrim(pole.numero), ''), nullif(btrim(company.numero), '')) as numero,
    nullif(btrim(company.complemento), '') as complemento,
    coalesce(nullif(btrim(pole.bairro), ''), nullif(btrim(company.bairro), '')) as bairro,
    coalesce(nullif(btrim(pole.cidade), ''), nullif(btrim(company.cidade), '')) as cidade,
    coalesce(nullif(btrim(pole.estado), ''), nullif(btrim(company.uf), '')) as uf,
    coalesce(nullif(btrim(pole.cep), ''), nullif(btrim(company.cep), '')) as cep,
    coalesce(nullif(btrim(pole.telefone), ''), nullif(btrim(company.telefone), '')) as telefone,
    coalesce(nullif(btrim(pole.email), ''), nullif(btrim(company.email), '')) as email,
    coalesce(nullif(btrim(pole.logo_url), ''), nullif(btrim(company.logo_url), '')) as logo_url,
    nullif(btrim(pole.watermark_url), '') as watermark_url,
    coalesce(pole.watermark_opacity, 0.10) as watermark_opacity,
    coalesce(pole.watermark_scale, 50) as watermark_scale,
    coalesce(pole.watermark_rotate, true) as watermark_rotate
  into v_brand
  from public.polos as pole
  left join public.empresas as company on company.id = pole.company_id
  where pole.id = new.polo_id;

  if not found then
    raise exception 'O polo da emissão não foi localizado para congelar a identidade visual.'
      using errcode = 'P0002';
  end if;

  new.dados_emissao := new.dados_emissao || jsonb_build_object(
    'institutionSnapshot', jsonb_build_object(
      'nome', coalesce(v_brand.nome, ''),
      'nomeFantasia', coalesce(v_brand.nome, ''),
      'cnpj', coalesce(v_brand.cnpj, ''),
      'endereco', coalesce(v_brand.endereco, ''),
      'numero', coalesce(v_brand.numero, ''),
      'complemento', coalesce(v_brand.complemento, ''),
      'bairro', coalesce(v_brand.bairro, ''),
      'cidade', coalesce(v_brand.cidade, ''),
      'estado', coalesce(v_brand.uf, ''),
      'uf', coalesce(v_brand.uf, ''),
      'cep', coalesce(v_brand.cep, ''),
      'telefone', coalesce(v_brand.telefone, ''),
      'email', coalesce(v_brand.email, ''),
      'logoUrl', v_brand.logo_url
    ),
    'watermarkSnapshot', jsonb_build_object(
      'watermarkUrl', v_brand.watermark_url,
      'watermarkOpacity', v_brand.watermark_opacity,
      'watermarkScale', v_brand.watermark_scale,
      'watermarkRotate', v_brand.watermark_rotate,
      'label', coalesce(v_brand.nome, '')
    )
  );

  return new;
end;
$function$;

revoke all on function public.capture_student_registration_brand_snapshot() from public, anon, authenticated;

drop trigger if exists capture_student_registration_brand_snapshot
  on public.documentos_validacao;
create trigger capture_student_registration_brand_snapshot
before update of dados_emissao on public.documentos_validacao
for each row
execute function public.capture_student_registration_brand_snapshot();

comment on function public.capture_student_registration_brand_snapshot() is
  'Congela instituição, logo e marca d’água ao criar o snapshot oficial de Pasta/Ficha; não altera replay histórico.';

-- O emissor rico de Pasta/Ficha precisa alcançar o núcleo genérico para criar
-- a identidade antes de anexar seu snapshot. Separamos esse núcleo do endpoint
-- autenticado e reescrevemos somente essa chamada interna; todos os callers
-- externos passam a ser roteados ao emissor rico.
do $route_registration_issuer$
declare
  v_ficha_oid oid;
  v_definition text;
  v_needle text := 'from public.emitir_documento_validacao_portal(';
  v_replacement text := 'from public.emitir_documento_validacao_portal_base(';
begin
  if to_regprocedure(
    'public.emitir_documento_validacao_portal_base(text,uuid,text,text,timestamptz,uuid,boolean)'
  ) is null then
    execute 'alter function public.emitir_documento_validacao_portal('
      || 'text, uuid, text, text, timestamptz, uuid, boolean) '
      || 'rename to emitir_documento_validacao_portal_base';
  end if;

  select procedure.oid
  into v_ficha_oid
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'emitir_ficha_validacao_portal'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      = 'p_documento text, p_matricula_id uuid, p_periodo_referencia text, p_emitido_por uuid, p_registrar_reemissao boolean, p_dados_emissao jsonb';

  if v_ficha_oid is null then
    raise exception 'A função canônica emitir_ficha_validacao_portal não foi encontrada.';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(v_ficha_oid);
  if position(v_replacement in v_definition) = 0 then
    if position(v_needle in v_definition) = 0 then
      raise exception 'A chamada interna esperada da ficha mudou; roteamento seguro não aplicado.';
    end if;
    execute replace(v_definition, v_needle, v_replacement);
  end if;
end;
$route_registration_issuer$;

revoke all on function public.emitir_documento_validacao_portal_base(
  text, uuid, text, text, timestamptz, uuid, boolean
) from public, anon, authenticated;
grant execute on function public.emitir_documento_validacao_portal_base(
  text, uuid, text, text, timestamptz, uuid, boolean
) to service_role;

create or replace function public.emitir_documento_validacao_portal(
  p_documento text,
  p_matricula_id uuid,
  p_periodo_referencia text default null,
  p_referencia_externa text default null,
  p_validade_ate timestamptz default null,
  p_emitido_por uuid default null,
  p_registrar_reemissao boolean default false
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
  v_documento text := nullif(btrim(coalesce(p_documento, '')), '');
  v_issue record;
begin
  if v_documento in ('pasta_identificacao', 'ficha_matricula') then
    if nullif(btrim(coalesce(p_referencia_externa, '')), '') is not null
      or p_validade_ate is not null
    then
      raise exception 'Pasta/Ficha não aceita referência externa ou validade informada pelo cliente.'
        using errcode = '22023';
    end if;

    select issued.*
    into v_issue
    from public.emitir_ficha_validacao_portal(
      v_documento,
      p_matricula_id,
      p_periodo_referencia,
      p_emitido_por,
      p_registrar_reemissao,
      '{}'::jsonb
    ) as issued;

    if v_issue.codigo is null or not exists (
      select 1
      from public.documentos_validacao as validation
      where validation.codigo = v_issue.codigo
        and coalesce(validation.dados_emissao, '{}'::jsonb) ? 'documentTemplateSnapshot'
        and coalesce(validation.dados_emissao, '{}'::jsonb) ? 'institutionSnapshot'
        and coalesce(validation.dados_emissao, '{}'::jsonb) ? 'watermarkSnapshot'
    ) then
      raise exception 'A emissão de Pasta/Ficha não produziu o snapshot oficial completo.'
        using errcode = '55000';
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
    return;
  end if;

  return query
  select issued.*
  from public.emitir_documento_validacao_portal_base(
    v_documento,
    p_matricula_id,
    p_periodo_referencia,
    p_referencia_externa,
    p_validade_ate,
    p_emitido_por,
    p_registrar_reemissao
  ) as issued;
end;
$function$;

revoke all on function public.emitir_documento_validacao_portal(
  text, uuid, text, text, timestamptz, uuid, boolean
) from public, anon;
grant execute on function public.emitir_documento_validacao_portal(
  text, uuid, text, text, timestamptz, uuid, boolean
) to authenticated, service_role;

-- Compatibilidade histórica: o nome antigo permanece, porém jamais chama o
-- núcleo privado. Assim clientes publicados também recebem o roteamento rico.
create or replace function public.emitir_documento_validacao(
  p_documento text,
  p_matricula_id uuid,
  p_periodo_referencia text default null,
  p_referencia_externa text default null,
  p_validade_ate timestamptz default null,
  p_emitido_por uuid default null,
  p_registrar_reemissao boolean default false
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
begin
  if p_registrar_reemissao
    and coalesce(
      current_setting('app.document_reissue_authorized', true),
      ''
    ) <> 'on'
  then
    raise exception 'Reemissão exige a RPC idempotente com chave explícita.'
      using errcode = '22023';
  end if;

  return query
  select routed.*
  from public.emitir_documento_validacao_portal(
    p_documento,
    p_matricula_id,
    p_periodo_referencia,
    p_referencia_externa,
    p_validade_ate,
    p_emitido_por,
    p_registrar_reemissao
  ) as routed;
end;
$function$;

revoke all on function public.emitir_documento_validacao(
  text, uuid, text, text, timestamptz, uuid, boolean
) from public, anon;
grant execute on function public.emitir_documento_validacao(
  text, uuid, text, text, timestamptz, uuid, boolean
) to authenticated, service_role;

-- Lotes inversos adquirem primeiro todas as chaves por UUID, numa ordem
-- determinística. O loop de resposta continua seguindo a ordem solicitada.
create or replace function public.reemitir_fichas_validacao_lote_portal(
  p_documento text,
  p_matricula_ids uuid[],
  p_idempotency_key text,
  p_periodo_referencia text default null,
  p_emitido_por uuid default null
)
returns table (
  matricula_id uuid,
  ordem_solicitacao integer,
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
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_lock record;
  v_request record;
  v_issue record;
begin
  if p_documento not in ('pasta_identificacao', 'ficha_matricula') then
    raise exception 'A reemissão transacional em lote é exclusiva das fichas cadastrais.'
      using errcode = '22023';
  end if;

  if char_length(v_key) not between 16 and 90
    or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
  then
    raise exception 'A chave do lote deve ter 16 a 90 caracteres seguros.'
      using errcode = '22023';
  end if;

  if coalesce(cardinality(p_matricula_ids), 0) = 0 then
    raise exception 'Informe ao menos uma matrícula para reemissão.'
      using errcode = '22023';
  end if;

  if cardinality(p_matricula_ids) > 500 then
    raise exception 'O lote pode conter no máximo 500 matrículas.'
      using errcode = '22023';
  end if;

  if (
    select count(*) <> count(distinct requested_id)
    from unnest(p_matricula_ids) as requested(requested_id)
  ) then
    raise exception 'O lote contém matrículas duplicadas.'
      using errcode = '22023';
  end if;

  for v_lock in
    select requested_id
    from unnest(p_matricula_ids) as requested(requested_id)
    order by requested_id::text
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'document-reissue:' || v_key || ':' || v_lock.requested_id::text,
        0
      )
    );
  end loop;

  for v_request in
    select requested_id, request_order::integer
    from unnest(p_matricula_ids) with ordinality
      as requested(requested_id, request_order)
    order by request_order
  loop
    select issued.*
    into v_issue
    from public.reemitir_documento_validacao_portal(
      p_documento,
      v_request.requested_id,
      v_key || ':' || v_request.requested_id::text,
      p_periodo_referencia,
      null,
      p_emitido_por
    ) as issued;

    matricula_id := v_request.requested_id;
    ordem_solicitacao := v_request.request_order;
    codigo := v_issue.codigo;
    documento := v_issue.documento;
    emitido_em := v_issue.emitido_em;
    ultima_emissao_em := v_issue.ultima_emissao_em;
    validade_ate := v_issue.validade_ate;
    status := v_issue.status;
    quantidade_emissoes := v_issue.quantidade_emissoes;
    reutilizado := v_issue.reutilizado;
    return next;
  end loop;
end;
$function$;

revoke all on function public.reemitir_fichas_validacao_lote_portal(
  text, uuid[], text, text, uuid
) from public, anon;
grant execute on function public.reemitir_fichas_validacao_lote_portal(
  text, uuid[], text, text, uuid
) to authenticated, service_role;

commit;
