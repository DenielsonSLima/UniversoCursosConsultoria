-- O relatório de empréstimos é A4 paisagem. Entrega somente a arte
-- horizontal configurada no template institucional, sem promover a marca
-- retrato como fallback visual.
-- Aplicada no ambiente remoto sob a versão 20260811122418.

BEGIN;

CREATE OR REPLACE FUNCTION public.preparar_relatorio_emprestimos_financeiros_secure(
  p_polo_id uuid,
  p_status_scope text DEFAULT 'TODOS'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_scope text := upper(btrim(coalesce(p_status_scope, 'TODOS')));
  v_items jsonb := '[]'::jsonb;
  v_polo jsonb;
  v_company jsonb;
  v_landscape jsonb := '{}'::jsonb;
BEGIN
  IF p_polo_id IS NULL THEN
    RAISE EXCEPTION 'Informe o polo responsável para exportar empréstimos.';
  END IF;
  IF auth.role() <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(p_polo_id)
       AND public.gestor_has_effective_financeiro_tab('emprestimos')
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao relatório de empréstimos.' USING ERRCODE = '42501';
  END IF;
  IF v_scope NOT IN ('TODOS', 'ATIVOS', 'FINALIZADOS') THEN
    RAISE EXCEPTION 'Escopo de situação inválido para o relatório de empréstimos.';
  END IF;

  SELECT template.conteudo
  INTO v_landscape
  FROM public.documentos_templates template
  WHERE template.id = concat('watermark_landscape_', p_polo_id)
     OR template.id IN (
       SELECT concat('watermark_landscape_', matriz.id)
       FROM public.polos matriz
       WHERE matriz.is_matriz
     )
  ORDER BY (template.id = concat('watermark_landscape_', p_polo_id)) DESC
  LIMIT 1;
  v_landscape := coalesce(v_landscape, '{}'::jsonb);

  SELECT jsonb_build_object(
    'id', polo.id,
    'nome', polo.nome,
    'nomeFantasia', polo.nome,
    'cnpj', polo.cnpj,
    'cidade', polo.cidade,
    'estado', polo.estado,
    'uf', polo.estado,
    'status', polo.status,
    'is_matriz', polo.is_matriz,
    'logoUrl', coalesce(polo.logo_url, empresa.logo_url),
    'endereco', coalesce(polo.endereco, empresa.endereco),
    'numero', coalesce(polo.numero, empresa.numero),
    'complemento', coalesce(polo.complemento, empresa.complemento),
    'bairro', coalesce(polo.bairro, empresa.bairro),
    'cep', coalesce(polo.cep, empresa.cep),
    'telefone', coalesce(polo.telefone, empresa.telefone),
    'email', coalesce(polo.email, empresa.email),
    'watermark_url', polo.watermark_url,
    'watermark_opacity', polo.watermark_opacity,
    'watermark_scale', polo.watermark_scale,
    'watermark_rotate', polo.watermark_rotate,
    'landscape_watermark_url', nullif(v_landscape ->> 'url', ''),
    'landscape_watermark_opacity', coalesce(
      nullif(v_landscape ->> 'opacity', '')::numeric,
      0.04
    ),
    'landscape_watermark_scale', coalesce(
      nullif(v_landscape ->> 'scale', '')::numeric,
      50
    ),
    'landscape_watermark_rotate', coalesce(
      nullif(v_landscape ->> 'rotate', '')::boolean,
      true
    )
  ), jsonb_build_object(
    'id', empresa.id,
    'nomeFantasia', empresa.nome_fantasia,
    'razaoSocial', empresa.razao_social,
    'cnpj', empresa.cnpj,
    'endereco', empresa.endereco,
    'numero', empresa.numero,
    'complemento', empresa.complemento,
    'bairro', empresa.bairro,
    'cidade', empresa.cidade,
    'uf', empresa.uf,
    'cep', empresa.cep,
    'telefone', empresa.telefone,
    'email', empresa.email,
    'logoUrl', empresa.logo_url
  )
  INTO v_polo, v_company
  FROM public.polos polo
  JOIN public.empresas empresa ON empresa.id = polo.company_id
  WHERE polo.id = p_polo_id;
  IF v_polo IS NULL THEN
    RAISE EXCEPTION 'Polo responsável não encontrado.';
  END IF;

  SELECT coalesce(jsonb_agg(item ORDER BY ordinalidade), '[]'::jsonb)
  INTO v_items
  FROM jsonb_array_elements(public.listar_emprestimos_financeiros_polo_secure(p_polo_id))
    WITH ORDINALITY AS registros(item, ordinalidade)
  WHERE v_scope = 'TODOS'
    OR (v_scope = 'ATIVOS' AND item ->> 'status' = 'ATIVO')
    OR (v_scope = 'FINALIZADOS' AND item ->> 'status' IN ('QUITADO', 'CANCELADO'));

  RETURN jsonb_build_object(
    'issuedAt', now(),
    'statusScope', v_scope,
    'total', jsonb_array_length(v_items),
    'polo', v_polo,
    'company', v_company,
    'items', v_items
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.preparar_relatorio_emprestimos_financeiros_secure(
  uuid, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.preparar_relatorio_emprestimos_financeiros_secure(
  uuid, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.preparar_relatorio_emprestimos_financeiros_secure(
  uuid, text
) IS 'Retorna snapshot canônico, ordenado e autorizado para exportação vetorial de empréstimos, incluindo apenas a marca-d’água configurada para paisagem.';

COMMIT;
