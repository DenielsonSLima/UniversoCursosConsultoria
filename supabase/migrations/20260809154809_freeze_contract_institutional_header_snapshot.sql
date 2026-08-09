-- Lote 2026-08-09: o editor do Contrato usa o cabeçalho institucional
-- completo. Novas emissões precisam congelar a mesma identidade antes de
-- renderizar e arquivar o documento. Históricos existentes não são alterados.

begin;

create or replace function public.enriquecer_snapshot_identidade_visual_contrato(
  p_snapshot jsonb
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_polo_id uuid;
  v_brand record;
  v_institution jsonb;
  v_watermark jsonb;
begin
  if jsonb_typeof(coalesce(p_snapshot, '{}'::jsonb)) <> 'object' then
    raise exception 'O snapshot do contrato é inválido.' using errcode = '22023';
  end if;

  begin
    v_polo_id := nullif(btrim(p_snapshot #>> '{instituicao,poloId}'), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'O polo do snapshot do contrato é inválido.' using errcode = '22023';
  end;

  if v_polo_id is null then
    raise exception 'O polo do snapshot do contrato não foi informado.' using errcode = '22023';
  end if;

  select
    coalesce(nullif(btrim(company.nome_fantasia), ''), nullif(btrim(pole.nome), '')) as nome,
    coalesce(nullif(btrim(company.cnpj), ''), nullif(btrim(pole.cnpj), '')) as cnpj,
    coalesce(nullif(btrim(company.razao_social), ''), nullif(btrim(pole.nome), '')) as razao_social,
    coalesce(nullif(btrim(company.endereco), ''), nullif(btrim(pole.endereco), '')) as endereco,
    coalesce(nullif(btrim(company.numero), ''), nullif(btrim(pole.numero), '')) as numero,
    nullif(btrim(company.complemento), '') as complemento,
    coalesce(nullif(btrim(company.bairro), ''), nullif(btrim(pole.bairro), '')) as bairro,
    coalesce(nullif(btrim(company.cidade), ''), nullif(btrim(pole.cidade), '')) as cidade,
    coalesce(nullif(btrim(company.uf), ''), nullif(btrim(pole.estado), '')) as uf,
    coalesce(nullif(btrim(company.cep), ''), nullif(btrim(pole.cep), '')) as cep,
    coalesce(nullif(btrim(company.telefone), ''), nullif(btrim(pole.telefone), '')) as telefone,
    coalesce(nullif(btrim(company.email), ''), nullif(btrim(pole.email), '')) as email,
    coalesce(nullif(btrim(company.logo_url), ''), nullif(btrim(pole.logo_url), '')) as logo_url,
    coalesce(nullif(btrim(pole.watermark_url), ''), nullif(btrim(company.watermark_url), '')) as watermark_url,
    coalesce(pole.watermark_opacity, company.watermark_opacity, 0.10) as watermark_opacity,
    coalesce(pole.watermark_scale, company.watermark_scale, 50) as watermark_scale,
    coalesce(pole.watermark_rotate, true) as watermark_rotate,
    (coalesce(pole.is_matriz, false) or company.tipo = 'Matriz') as is_matriz
  into v_brand
  from public.polos as pole
  left join public.empresas as company on company.id = pole.company_id
  where pole.id = v_polo_id;

  if not found then
    raise exception 'O polo do contrato não foi localizado para congelar o cabeçalho institucional.'
      using errcode = 'P0002';
  end if;

  v_institution := coalesce(p_snapshot -> 'instituicao', '{}'::jsonb) || jsonb_build_object(
    'nome', coalesce(v_brand.nome, ''),
    'nomeFantasia', coalesce(v_brand.nome, ''),
    'razaoSocial', coalesce(v_brand.razao_social, ''),
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
    'logoUrl', v_brand.logo_url,
    'isMatriz', v_brand.is_matriz,
    'presentationVersion', 'CONTRATO_A4_INSTITUCIONAL_V2'
  );

  v_watermark := coalesce(p_snapshot -> 'marcaDagua', '{}'::jsonb) || jsonb_build_object(
    'url', v_brand.watermark_url,
    'opacidade', v_brand.watermark_opacity,
    'escala', v_brand.watermark_scale,
    'rotacionar', v_brand.watermark_rotate,
    'texto', coalesce(v_brand.nome, '')
  );

  return jsonb_set(
    jsonb_set(p_snapshot, '{instituicao}', v_institution, true),
    '{marcaDagua}',
    v_watermark,
    true
  );
end;
$function$;

revoke all on function public.enriquecer_snapshot_identidade_visual_contrato(jsonb)
  from public, anon, authenticated, service_role;

-- O emissor base já é interno e bloqueado para papéis clientes. Inserimos a
-- captura imediatamente antes do renderer; assim templateSnapshot,
-- contractSnapshot, renderedDocument e a resposta usam a mesma identidade.
do $patch_contract_issuer$
declare
  v_oid oid;
  v_definition text;
  v_needle text := E'    v_rendered := public.renderizar_contrato_aluno_documento(\n';
  v_replacement text := E'    v_snapshot := public.enriquecer_snapshot_identidade_visual_contrato(v_snapshot);\n\n'
    || E'    v_rendered := public.renderizar_contrato_aluno_documento(\n';
begin
  select procedure.oid
  into v_oid
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'preparar_emissao_contrato_aluno_base_secure'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      = 'p_polo_id uuid, p_modo text, p_matricula_ids uuid[], p_mensagem_personalizada text, p_idempotency_key uuid';

  if v_oid is null then
    raise exception 'O emissor base canônico do Contrato do Aluno não foi localizado.';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(v_oid);
  if position('enriquecer_snapshot_identidade_visual_contrato' in v_definition) = 0 then
    if position(v_needle in v_definition) = 0 then
      raise exception 'O ponto seguro de captura do snapshot contratual mudou; migration não aplicada.';
    end if;
    execute replace(v_definition, v_needle, v_replacement);
  end if;
end;
$patch_contract_issuer$;

revoke all on function public.preparar_emissao_contrato_aluno_base_secure(
  uuid, text, uuid[], text, uuid
) from public, anon, authenticated, service_role;

comment on function public.enriquecer_snapshot_identidade_visual_contrato(jsonb) is
  'Congela o cabeçalho institucional e a geometria da marca antes de uma nova emissão de Contrato do Aluno; não altera históricos.';

commit;
