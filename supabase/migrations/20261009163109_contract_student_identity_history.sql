begin;

-- Projeção de leitura. Nunca altera snapshots, arquivos de assinatura, código,
-- datas ou contadores. Modelos e condições continuam os da emissão original.
CREATE OR REPLACE FUNCTION internal_academic.project_contract_identity_emission(p_emission jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
declare
  v_data jsonb := p_emission -> 'dados_emissao';
  v_snapshot jsonb := p_emission #> '{dados_emissao,contractSnapshot}';
  v_template jsonb := p_emission #> '{dados_emissao,templateSnapshot}';
  v_student jsonb;
  v_live jsonb := p_emission -> 'aluno';
  v_rendered jsonb;
begin
  if p_emission ->> 'documento' is distinct from 'contrato_aluno'
    or jsonb_typeof(v_snapshot) is distinct from 'object'
    or jsonb_typeof(v_template) is distinct from 'object'
    or jsonb_typeof(v_snapshot -> 'aluno') is distinct from 'object'
    or nullif(btrim(v_template ->> 'corpo'), '') is null then
    return p_emission;
  end if;
  -- A versão já entregue à assinatura não recebe nova apresentação: o hash do
  -- documento é parte do processo mesmo antes da conclusão das assinaturas.
  if exists (
    select 1 from public.assinatura_eletronica_envelopes envelope
    where envelope.documento_validacao_id = (p_emission ->> 'id')::uuid
  ) then
    return p_emission;
  end if;
  v_student := v_snapshot -> 'aluno';
  -- Contratos novos congelam o tipo, inclusive null. Não se sobrepõe um tipo
  -- histórico conhecido com futuras mudanças do cadastro.
  if v_student ? 'tipoDocumento' then
    return jsonb_set(p_emission, '{dados_emissao,renderedDocument}',
      public.repaginar_render_contrato_v3(
        v_data -> 'renderedDocument', v_snapshot #>> '{instituicao,presentationVersion}'
      ));
  end if;
  v_student := v_student || jsonb_build_object('tipoDocumento', v_live -> 'tipo_documento');
  if not (v_student ? 'rgUfEmissao') then
    v_student := v_student || jsonb_build_object('rgUfEmissao', v_live -> 'rg_uf_emissao');
  end if;
  if not (v_student ? 'rgDataEmissao') then
    v_student := v_student || jsonb_build_object('rgDataEmissao', v_live -> 'rg_data_emissao');
  end if;
  v_snapshot := jsonb_set(v_snapshot, '{aluno}', v_student);
  v_rendered := public.renderizar_contrato_aluno_documento(
    v_template, v_snapshot, p_emission ->> 'codigo',
    (p_emission ->> 'validade_ate')::timestamptz
  );
  v_rendered := public.repaginar_render_contrato_v3(
    v_rendered, v_snapshot #>> '{instituicao,presentationVersion}'
  );
  return jsonb_set(p_emission, '{dados_emissao}', v_data || jsonb_build_object(
    'contractSnapshot', v_snapshot,
    'renderedDocument', v_rendered
  ));
end;
$function$;

REVOKE ALL ON FUNCTION internal_academic.project_contract_identity_emission(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal_academic.project_contract_identity_emission(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.search_secretaria_emissions_secure(p_polo_id uuid, p_documento text DEFAULT NULL::text, p_turma_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_search text := lower(extensions.unaccent(btrim(coalesce(p_search, ''))));
  v_result jsonb;
begin
  if auth.role() <> 'service_role'
     and not (
       p_polo_id is not null
       and public.is_gestor_for_polo(p_polo_id)
       and (
         public.gestor_has_tab('secretaria', 'historico-emissoes')
         or coalesce(
           public.gestor_effective_permissions() -> 'tabs' -> 'secretaria',
           '[]'::jsonb
         ) ? 'historico'
       )
     )
  then
    raise exception 'Historico de emissoes da Secretaria nao autorizado.'
      using errcode = '42501';
  end if;

  with filtered as materialized (
    select
      document_row.ultima_emissao_em,
      document_row.id,
      to_jsonb(document_row)
      || jsonb_build_object(
        'aluno',
        case when student.id is null then null else jsonb_build_object(
          'id', student.id,
          'nome', student.nome,
          'cpf_cnpj', student.cpf_cnpj,
          'rg', student.rg,
          'tipo_documento', student.tipo_documento,
          'rg_uf_emissao', student.rg_uf_emissao,
          'rg_data_emissao', student.rg_data_emissao,
          'data_nascimento', student.data_nascimento,
          'foto_url', student.foto_url,
          'sexo', student.sexo,
          'nacionalidade', student.nacionalidade,
          'naturalidade', student.naturalidade,
          'orgao_emissor', student.orgao_emissor,
          'titulo_eleitor', student.titulo_eleitor,
          'reservista', student.reservista,
          'nome_mae', student.nome_mae,
          'nome_pai', student.nome_pai,
          'escola_ensino_medio', student.escola_ensino_medio,
          'ano_conclusao_ensino_medio', student.ano_conclusao_ensino_medio
        ) end,
        'matricula',
        case when enrollment.id is null then null else jsonb_build_object(
          'id', enrollment.id,
          'status', enrollment.status,
          'turma_id', enrollment.turma_id,
          'turma',
          case when class.id is null then null else jsonb_build_object(
            'id', class.id,
            'nome', class.nome,
            'codigo', class.codigo
          ) end
        ) end
      ) as payload
    from public.documentos_validacao as document_row
    left join public.parceiros as student on student.id = document_row.aluno_id
    left join public.matriculas as enrollment on enrollment.id = document_row.matricula_id
    left join public.turmas as class on class.id = enrollment.turma_id
    where document_row.status = 'ATIVO'
      and document_row.polo_id = p_polo_id
      and (nullif(p_documento, '') is null or p_documento = 'todos' or document_row.documento = p_documento)
      and (p_turma_id is null or enrollment.turma_id = p_turma_id)
      and (
        v_search = ''
        or lower(extensions.unaccent(coalesce(document_row.codigo, ''))) like '%' || v_search || '%'
        or lower(extensions.unaccent(coalesce(document_row.dados_emissao ->> 'studentName', ''))) like '%' || v_search || '%'
        or lower(extensions.unaccent(coalesce(document_row.dados_emissao ->> 'studentCpf', ''))) like '%' || v_search || '%'
      )
  ),
  page_rows as (
    select payload, ultima_emissao_em, id
    from filtered
    order by ultima_emissao_em desc, id
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
  )
  select jsonb_build_object(
    'items',
    coalesce(
      (select jsonb_agg(
        internal_academic.project_contract_identity_emission(payload)
        order by ultima_emissao_em desc, id) from page_rows),
      '[]'::jsonb
    ),
    'total',
    (select count(*) from filtered)
  )
  into v_result;

  return v_result;
end;
$function$;

commit;
