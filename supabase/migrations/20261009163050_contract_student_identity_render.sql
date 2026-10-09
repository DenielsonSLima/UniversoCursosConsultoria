begin;

-- Resolve somente a apresentação dos tokens civis do aluno. O tipo explícito
-- define CIN/CNI; sem tipo não se deduz CIN a partir do tamanho do número.
CREATE OR REPLACE FUNCTION internal_academic.contract_student_identity_text(p_source text, p_student jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
declare
  v_result text := coalesce(p_source, '');
  v_type text;
  v_normalized text;
  v_cin boolean;
  v_cnh boolean;
  v_cpf text;
  v_digits text;
  v_number text;
  v_label text;
  v_primary_cpf boolean := position('{{aluno.cpf}}' in coalesce(p_source, '')) > 0;
  v_issuer text;
  v_state text;
  v_date text;
  v_entry record;
  v_token_pattern text;
  v_label_pattern text;
  v_key text;
begin
  -- Textos de ausência legados não são números de documento.
  foreach v_key in array array['tipoDocumento', 'cpf', 'rg', 'orgaoExpedidor', 'rgUfEmissao', 'rgDataEmissao'] loop
    if lower(btrim(p_student ->> v_key)) in (
      '', '-', '—', '–', 'não informado', 'nao informado',
      'não informada', 'nao informada', 'n/a', 'null'
    ) then p_student := jsonb_set(p_student, array[v_key], 'null'::jsonb); end if;
  end loop;
  v_type := btrim(coalesce(p_student ->> 'tipoDocumento', ''));
  v_normalized := btrim(regexp_replace(upper(v_type), '[^A-Z0-9]+', ' ', 'g'));
  v_cpf := btrim(coalesce(p_student ->> 'cpf', ''));
  v_cin := v_normalized in ('CIN', 'CNI')
    or v_normalized like '%CARTEIRA DE IDENTIDADE NACIONAL%'
    or v_normalized like '%CARTEIRA NACIONAL DE IDENTIDADE%';
  v_cnh := v_normalized like '%CNH%'
    or v_normalized like '%CARTEIRA NACIONAL DE HABILITA%';
  v_digits := regexp_replace(v_cpf, '[^0-9]', '', 'g');
  if length(v_digits) = 11 then
    v_cpf := substr(v_digits, 1, 3) || '.' || substr(v_digits, 4, 3)
      || '.' || substr(v_digits, 7, 3) || '-' || substr(v_digits, 10, 2);
  end if;
  v_number := case when v_cin then v_cpf
    when v_type <> '' then btrim(coalesce(p_student ->> 'rg', '')) else '' end;
  v_label := case when v_cin then 'CIN' when v_cnh then 'CNH'
    when v_normalized in ('RG', 'RG ANTIGO', 'IDENTIDADE', 'CARTEIRA DE IDENTIDADE')
      or v_normalized like '%REGISTRO GERAL%' then 'RG'
    when v_type <> '' then 'Documento' else '' end;
  -- Máscara visual somente para RG declarado e sem pontuação. Números de
  -- CNH/passaporte e a grafia de RG já formatado permanecem intocados.
  if v_label = 'RG' and v_number ~ '^[0-9]{6,8}[0-9Xx]$' then
    v_number := regexp_replace(substr(v_number, 1, length(v_number) - 1),
      '(\d)(?=(\d{3})+$)', '\1.', 'g') || '-' || upper(right(v_number, 1));
  end if;
  v_issuer := case when v_number <> '' and not v_cin and not v_cnh
    then btrim(coalesce(p_student ->> 'orgaoExpedidor', '')) else '' end;
  v_state := case when v_number <> '' and not v_cin and not v_cnh
    then btrim(coalesce(p_student ->> 'rgUfEmissao', '')) else '' end;
  v_date := case when v_number <> '' and not v_cin and not v_cnh
    then btrim(coalesce(p_student ->> 'rgDataEmissao', '')) else '' end;
  if v_date ~ '^\d{4}-\d{2}-\d{2}$' then
    v_date := substr(v_date, 9, 2) || '/' || substr(v_date, 6, 2) || '/' || substr(v_date, 1, 4);
  end if;

  -- As cláusulas opcionais são retiradas no modelo, antes de inserir valores.
  -- O texto do responsável, cláusulas financeiras e demais tokens não entram.
  for v_entry in select * from (values
    ('cpf', 'CPF(?:/MF)?', case when v_cin and not v_primary_cpf then '' else v_cpf end,
      case when v_cin then 'CIN' else 'CPF' end),
    ('rg', '(?:RG(?:[[:blank:]]*/[[:blank:]]*Documento)?|CIN|CNI|CNH|Documento)',
      case when v_cin and v_primary_cpf then '' else v_number end, v_label),
    ('orgaoExpedidor', '(?:Órgão|Orgao)[[:blank:]]+(?:Expedidor|Emissor)', v_issuer, null),
    ('rgUfEmissao', 'UF(?:[[:blank:]]+(?:de[[:blank:]]+)?(?:Emissão|Emissao|Expedição|Expedicao))?', v_state, null),
    ('rgDataEmissao', 'Data[[:blank:]]+(?:de[[:blank:]]+)?(?:Emissão|Emissao|Expedição|Expedicao)', v_date, null)
  ) as fields(token, label_pattern, value, label) loop
    v_token_pattern := '\{\{aluno\.' || v_entry.token || '\}\}';
    v_label_pattern := '\m' || v_entry.label_pattern
      || '[[:blank:]]*(?:n[º°o.]?[[:blank:]]*)?[:.-]?[[:blank:]]*';
    if coalesce(v_entry.value, '') = '' then
      v_result := regexp_replace(v_result,
        '[,;]?[[:blank:]]*' || v_label_pattern || v_token_pattern, '', 'gi');
    elsif v_entry.label is not null then
      v_result := regexp_replace(v_result,
        '(\m' || v_entry.label_pattern || ')'
        || '([[:blank:]]*(?:n[º°o.]?[[:blank:]]*)?[:.-]?[[:blank:]]*)'
        || '(?=' || v_token_pattern || ')', v_entry.label || '\2', 'gi');
    end if;
    v_result := replace(v_result, '{{aluno.' || v_entry.token || '}}', coalesce(v_entry.value, ''));
  end loop;
  v_result := replace(v_result, '{{aluno.tipoDocumento}}', case when v_number <> '' then v_label else '' end);
  v_result := replace(v_result, '{{aluno.documentoTipo}}', case when v_number <> '' then v_label else '' end);
  v_result := replace(v_result, '{{aluno.documentoNumero}}', v_number);
  return v_result;
end;
$function$;

REVOKE ALL ON FUNCTION internal_academic.contract_student_identity_text(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal_academic.contract_student_identity_text(text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.renderizar_contrato_aluno_documento(p_template jsonb, p_snapshot jsonb, p_codigo_validacao text, p_validade_ate timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_body text := coalesce(p_template ->> 'corpo', '');
  v_footer text := coalesce(p_template ->> 'rodape', '');
  v_header text := coalesce(p_template ->> 'cabecalho', '');
  v_qr_enabled boolean := true;
  v_watermark_enabled boolean := lower(coalesce(p_template #>> '{marcaDagua,habilitada}', 'true')) <> 'false';
  v_condicoes text;
  v_message text := nullif(btrim(regexp_replace(
    coalesce(p_snapshot ->> 'mensagemPersonalizada', ''), '[[:cntrl:]]+', ' ', 'g'
  )), '');
  v_validade_texto text := case
    when p_validade_ate is null then 'Sem vencimento'
    else to_char(p_validade_ate, 'DD/MM/YYYY')
  end;
begin
  v_body := internal_academic.contract_student_identity_text(v_body, p_snapshot -> 'aluno');
  v_header := internal_academic.contract_student_identity_text(v_header, p_snapshot -> 'aluno');
  v_footer := internal_academic.contract_student_identity_text(v_footer, p_snapshot -> 'aluno');
  v_condicoes := concat_ws(
    '; ',
    case when p_snapshot #>> '{financeiro,descontoPontualidadeExibicao}' is not null
      then 'Desconto de pontualidade: ' || (p_snapshot #>> '{financeiro,descontoPontualidadeExibicao}') end,
    case when p_snapshot #>> '{financeiro,jurosAtrasoExibicao}' is not null
      then 'Juros por atraso: ' || (p_snapshot #>> '{financeiro,jurosAtrasoExibicao}') end,
    case when p_snapshot #>> '{financeiro,multaAtrasoExibicao}' is not null
      then 'Multa por atraso: ' || (p_snapshot #>> '{financeiro,multaAtrasoExibicao}') end,
    case when p_snapshot #>> '{financeiro,multaAtrasoPercentual}' is not null
      then 'Multa percentual: ' || (p_snapshot #>> '{financeiro,multaAtrasoPercentual}') || '%' end
  );

  v_body := replace(v_body, '{{aluno.nome}}', coalesce(p_snapshot #>> '{aluno,nome}', 'Não informado'));
  v_body := replace(v_body, '{{aluno.nascimento}}', coalesce(p_snapshot #>> '{aluno,nascimentoExibicao}', 'Não informado'));
  v_body := replace(v_body, '{{aluno.endereco.logradouro}}', coalesce(p_snapshot #>> '{aluno,endereco,logradouro}', 'Não informado'));
  v_body := replace(v_body, '{{aluno.endereco.numero}}', coalesce(p_snapshot #>> '{aluno,endereco,numero}', 'S/N'));
  v_body := replace(v_body, '{{aluno.endereco.cep}}', coalesce(p_snapshot #>> '{aluno,endereco,cep}', 'Não informado'));
  v_body := replace(v_body, '{{aluno.endereco.cidade}}', coalesce(p_snapshot #>> '{aluno,endereco,cidade}', 'Não informado'));
  v_body := replace(v_body, '{{aluno.endereco.uf}}', coalesce(p_snapshot #>> '{aluno,endereco,uf}', ''));
  v_body := replace(v_body, '{{aluno.telefone}}', coalesce(p_snapshot #>> '{aluno,telefone}', 'Não informado'));
  v_body := replace(v_body, '{{aluno.responsavel.nome}}', coalesce(p_snapshot #>> '{aluno,responsavel,nome}', 'Não informado'));
  v_body := replace(v_body, '{{aluno.responsavel.cpf}}', coalesce(p_snapshot #>> '{aluno,responsavel,cpf}', 'Não informado'));
  v_body := replace(v_body, '{{aluno.responsavel.telefone}}', coalesce(p_snapshot #>> '{aluno,responsavel,telefone}', 'Não informado'));
  v_body := replace(v_body, '{{instituicao.nome}}', coalesce(p_snapshot #>> '{instituicao,nome}', 'Não informado'));
  v_body := replace(v_body, '{{instituicao.cnpj}}', coalesce(p_snapshot #>> '{instituicao,cnpj}', 'Não informado'));
  v_body := replace(v_body, '{{instituicao.razaoSocial}}', coalesce(p_snapshot #>> '{instituicao,razaoSocial}', p_snapshot #>> '{instituicao,nome}', 'Não informado'));
  v_body := replace(v_body, '{{instituicao.endereco}}', coalesce(p_snapshot #>> '{instituicao,endereco}', 'Não informado'));
  v_body := replace(v_body, '{{instituicao.numero}}', coalesce(p_snapshot #>> '{instituicao,numero}', 'S/N'));
  v_body := replace(v_body, '{{instituicao.bairro}}', coalesce(p_snapshot #>> '{instituicao,bairro}', 'Não informado'));
  v_body := replace(v_body, '{{instituicao.cidade}}', coalesce(p_snapshot #>> '{instituicao,cidade}', 'Não informado'));
  v_body := replace(v_body, '{{instituicao.uf}}', coalesce(p_snapshot #>> '{instituicao,uf}', p_snapshot #>> '{instituicao,estado}', ''));
  v_body := replace(v_body, '{{instituicao.cep}}', coalesce(p_snapshot #>> '{instituicao,cep}', 'Não informado'));
  v_body := replace(v_body, '{{aluno.responsavel.parentesco}}', coalesce(p_snapshot #>> '{aluno,responsavel,parentesco}', 'Não informado'));
  v_body := replace(v_body, '{{curso.modalidade}}', coalesce(p_snapshot #>> '{curso,modalidade}', 'Não informado'));
  v_body := replace(v_body, '{{curso.cargaHoraria}}', coalesce(p_snapshot #>> '{curso,cargaHoraria}', 'Não informado'));
  v_body := replace(v_body, '{{turma.previsaoTermino}}', coalesce(p_snapshot #>> '{turma,previsaoTerminoExibicao}', 'Não informado'));
  v_body := replace(v_body, '{{regras.minimoAlunosTurma}}', coalesce(p_template #>> '{regrasDinamicas,minimoAlunosTurma}', 'Não informado'));
  v_body := replace(v_body, '{{regras.prazoReembolsoDiasUteis}}', coalesce(p_template #>> '{regrasDinamicas,prazoReembolsoDiasUteis}', 'Não informado'));
  v_body := replace(v_body, '{{regras.prazoRematriculaDias}}', coalesce(p_template #>> '{regrasDinamicas,prazoRematriculaDias}', 'Não informado'));
  v_body := replace(v_body, '{{regras.percentualCancelamento}}', coalesce(p_template #>> '{regrasDinamicas,percentualCancelamento}', 'Não informado'));
  v_body := replace(v_body, '{{regras.frequenciaEstagioObrigatoria}}', coalesce(p_template #>> '{regrasDinamicas,frequenciaEstagioObrigatoria}', 'Não informado'));
  v_body := replace(v_body, '{{regras.frequenciaTeoricaMinima}}', coalesce(p_template #>> '{regrasDinamicas,frequenciaTeoricaMinima}', 'Não informado'));
  v_body := replace(v_body, '{{regras.cargaSaudeColetiva}}', coalesce(p_template #>> '{regrasDinamicas,cargaSaudeColetiva}', 'Não informado'));
  v_body := replace(v_body, '{{regras.honorariosCobrancaPercentual}}', coalesce(p_template #>> '{regrasDinamicas,honorariosCobrancaPercentual}', 'Não informado'));
  v_body := replace(v_body, '{{regras.multaBibliotecaDia}}', coalesce(p_template #>> '{regrasDinamicas,multaBibliotecaDia}', 'Não informado'));
  v_body := replace(v_body, '{{curso.nome}}', coalesce(p_snapshot #>> '{curso,nome}', 'Não informado'));
  v_body := replace(v_body, '{{turma.nome}}', coalesce(p_snapshot #>> '{turma,nome}', 'Não informado'));
  v_body := replace(v_body, '{{turma.inicio}}', coalesce(p_snapshot #>> '{turma,inicioExibicao}', 'Não informado'));
  v_body := replace(v_body, '{{financeiro.valorMatricula}}', coalesce(p_snapshot #>> '{financeiro,valorMatriculaExibicao}', 'Não informado'));
  v_body := replace(v_body, '{{financeiro.valorRematricula}}', coalesce(p_snapshot #>> '{financeiro,valorRematriculaExibicao}', 'Não informado'));
  v_body := replace(v_body, '{{financeiro.quantidadeParcelas}}', coalesce(p_snapshot #>> '{financeiro,quantidadeParcelas}', 'Não informado'));
  v_body := replace(v_body, '{{financeiro.valorParcela}}', coalesce(p_snapshot #>> '{financeiro,valorParcelaExibicao}', 'Não informado'));
  v_body := replace(v_body, '{{financeiro.diaVencimento}}', coalesce(p_snapshot #>> '{financeiro,diaVencimento}', 'Não informado'));
  v_body := replace(v_body, '{{financeiro.primeiroVencimento}}', coalesce(p_snapshot #>> '{financeiro,primeiroVencimentoExibicao}', 'Não informado'));
  v_body := replace(v_body, '{{financeiro.condicoes}}', coalesce(nullif(v_condicoes, ''), 'Condições não informadas'));
  v_body := replace(v_body, '{{emissao.data}}', coalesce(p_snapshot #>> '{emissao,dataExibicao}', to_char(now(), 'DD/MM/YYYY')));
  v_body := replace(v_body, '{{validacao.codigo}}', coalesce(p_codigo_validacao, 'Não informado'));
  v_body := replace(v_body, '{{validacao.validade}}', v_validade_texto);
  if v_message is not null then
    v_body := concat_ws(E'\n\n', v_body, 'Mensagem complementar: ' || v_message);
  end if;

  -- Compatibilidade com snapshots/modelos gravados antes da correção.
  v_footer := replace(v_footer, chr(92) || 'r' || chr(92) || 'n', E'\n');
  v_footer := replace(v_footer, chr(92) || 'n', E'\n');
  v_footer := replace(v_footer, '{{emissao.data}}', coalesce(p_snapshot #>> '{emissao,dataExibicao}', to_char(now(), 'DD/MM/YYYY')));
  v_footer := replace(v_footer, '{{validacao.codigo}}', coalesce(p_codigo_validacao, 'Não informado'));
  v_footer := replace(v_footer, '{{validacao.validade}}', v_validade_texto);
  v_header := replace(v_header, '{{instituicao.nome}}', coalesce(p_snapshot #>> '{instituicao,nome}', 'UNIVERSO CURSOS E CONSULTORIA'));

  if nullif(btrim(v_header), '') is not null and (
    lower(regexp_replace(btrim(v_header), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(btrim(coalesce(p_snapshot #>> '{instituicao,nome}', '')), '[[:space:]]+', ' ', 'g'))
    or lower(regexp_replace(btrim(v_header), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(btrim(coalesce(p_snapshot #>> '{instituicao,nomeFantasia}', '')), '[[:space:]]+', ' ', 'g'))
    or lower(regexp_replace(btrim(v_header), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(btrim(coalesce(p_snapshot #>> '{instituicao,razaoSocial}', '')), '[[:space:]]+', ' ', 'g'))
  ) then
    v_header := '';
  end if;

  return jsonb_build_object(
    'kind', 'CONTRATO_ALUNO',
    'pageSize', 'A4_RETRATO',
    'pages', case
      when p_template ->> 'presentationVersion' = 'CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA'
        then public.paginar_contrato_aluno_minuta_completa(
          v_header,
          coalesce(nullif(p_template ->> 'tituloDocumento', ''), 'Contrato de Prestação de Serviços Educacionais'),
          v_body,
          v_footer
        )
      else public.paginar_texto_documento_canonico(
        v_header,
        coalesce(nullif(p_template ->> 'tituloDocumento', ''), 'Contrato de Prestação de Serviços Educacionais'),
        v_body,
        v_footer
      )
    end,
    'watermark', jsonb_build_object(
      'enabled', v_watermark_enabled,
      'label', coalesce(p_snapshot #>> '{marcaDagua,texto}', p_snapshot #>> '{instituicao,nome}'),
      'image_url', p_snapshot #>> '{marcaDagua,url}',
      'opacity', coalesce(p_snapshot #>> '{marcaDagua,opacidade}', case when p_template #>> '{marcaDagua,intensidade}' = 'MEDIA' then '0.10' else '0.06' end)
    ),
    'qr', jsonb_build_object(
      'enabled', v_qr_enabled,
      'label', coalesce(nullif(p_template #>> '{qr,rotulo}', ''), 'Validar documento'),
      'code', p_codigo_validacao,
      'validation_url', case when p_codigo_validacao is null then null else '/validador?code=' || p_codigo_validacao end,
      'valid_until', p_validade_ate,
      'validity_label', v_validade_texto
    )
  );
end;
$function$;

commit;
