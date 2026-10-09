begin;

CREATE OR REPLACE FUNCTION public.preparar_emissao_contrato_aluno_base_secure(p_polo_id uuid, p_modo text, p_matricula_ids uuid[], p_mensagem_personalizada text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_mode text := upper(btrim(coalesce(p_modo, '')));
  v_message text := nullif(btrim(coalesce(p_mensagem_personalizada, '')), '');
  v_ids uuid[];
  v_expected_count integer;
  v_found_count integer;
  v_fingerprint text;
  v_replay public.secretaria_documentos_emissao_requisicoes%rowtype;
  v_target record;
  v_model public.documentos_modelos_configuracoes%rowtype;
  v_issued record;
  v_snapshot jsonb;
  v_rendered jsonb;
  v_validity timestamptz;
  v_validity_days integer;
  v_qr_enabled boolean;
  v_documents jsonb := '[]'::jsonb;
  v_response jsonb;
  v_reference text;
begin
  if not public.can_manage_secretaria_document('contrato_aluno', p_polo_id) then
    raise exception 'Acesso à emissão de contrato não autorizado.' using errcode = '42501';
  end if;

  if p_idempotency_key is null then
    raise exception 'Informe a chave de idempotência da emissão.' using errcode = '22023';
  end if;

  if v_mode not in ('INDIVIDUAL', 'LOTE', 'PERSONALIZADO') then
    raise exception 'Modo de emissão inválido.' using errcode = '22023';
  end if;

  if char_length(coalesce(v_message, '')) > 2000 then
    raise exception 'A mensagem personalizada deve ter no máximo 2000 caracteres.'
      using errcode = '22023';
  end if;

  select array_agg(distinct item order by item)
  into v_ids
  from unnest(coalesce(p_matricula_ids, array[]::uuid[])) item
  where item is not null;

  v_expected_count := coalesce(cardinality(v_ids), 0);
  if v_expected_count = 0 or v_expected_count > 100 then
    raise exception 'Selecione entre 1 e 100 matrículas para a emissão.'
      using errcode = '22023';
  end if;

  if v_mode = 'INDIVIDUAL' and v_expected_count <> 1 then
    raise exception 'A emissão individual exige exatamente uma matrícula.'
      using errcode = '22023';
  end if;

  v_fingerprint := md5(
    p_polo_id::text || '|' || v_mode || '|' || coalesce(v_message, '') || '|'
    || array_to_string(v_ids::text[], ',')
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_idempotency_key::text));

  select replay.*
  into v_replay
  from public.secretaria_documentos_emissao_requisicoes replay
  where replay.request_id = p_idempotency_key;

  if found then
    if v_replay.tipo <> 'CONTRATO_ALUNO' or v_replay.fingerprint <> v_fingerprint then
      raise exception 'A chave de idempotência já foi usada com outra emissão.'
        using errcode = '22023';
    end if;
    return v_replay.resposta;
  end if;

  select count(*)
  into v_found_count
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  join public.cursos course on course.id = class.curso_id
  where enrollment.id = any(v_ids)
    and class.polo_id = p_polo_id
    and upper(coalesce(enrollment.status, '')) = 'ATIVO'
    and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'LIVRE', 'SUPERIOR');

  if v_found_count <> v_expected_count then
    raise exception 'Há matrícula sem vínculo ativo, fora do polo ou sem modalidade contratável.'
      using errcode = '42501';
  end if;

  for v_target in
    select
      enrollment.id as matricula_id,
      enrollment.aluno_id,
      enrollment.data_matricula,
      enrollment.valor_matricula_individual,
      enrollment.valor_rematricula_individual,
      enrollment.valor_parcela_individual,
      enrollment.dia_vencimento_individual,
      enrollment.data_primeiro_vencimento_financeiro,
      enrollment.desconto_pontualidade_individual,
      enrollment.juros_atraso_individual,
      enrollment.multa_atraso_individual,
      enrollment.multa_atraso_percentual_individual,
      student.nome as aluno_nome,
      student.nome_social,
      student.cpf_cnpj,
      student.rg,
      student.tipo_documento,
      student.rg_uf_emissao,
      student.rg_data_emissao,
      student.orgao_emissor,
      student.data_nascimento,
      student.email,
      student.telefone,
      student.cep,
      student.endereco,
      student.numero,
      student.complemento,
      student.bairro,
      student.cidade,
      student.uf,
      student.responsavel_nome,
      student.responsavel_cpf,
      student.responsavel_parentesco,
      student.responsavel_telefone,
      class.id as turma_id,
      class.nome as turma_nome,
      class.codigo as turma_codigo,
      class.turno as turma_turno,
      class.data_inicio,
      class.data_previsao_termino,
      class.qtd_parcelas,
      class.valor_matricula,
      class.valor_rematricula,
      class.valor_parcela,
      class.dia_vencimento_padrao,
      class.desconto_pontualidade,
      class.juros_atraso,
      class.multa_atraso,
      class.multa_atraso_percentual,
      course.nome as curso_nome,
      upper(course.modalidade) as modalidade,
      course.carga_horaria,
      pole.nome as polo_nome,
      pole.cnpj as polo_cnpj,
      pole.watermark_url as polo_watermark_url,
      pole.watermark_opacity as polo_watermark_opacity,
      pole.logo_url as polo_logo_url
    from public.matriculas enrollment
    join public.parceiros student on student.id = enrollment.aluno_id
    join public.turmas class on class.id = enrollment.turma_id
    join public.cursos course on course.id = class.curso_id
    join public.polos pole on pole.id = class.polo_id
    where enrollment.id = any(v_ids)
    order by student.nome, enrollment.id
  loop
    select model.*
    into v_model
    from public.documentos_modelos_configuracoes model
    where model.template_key = 'contrato_aluno'
      and model.modalidade = v_target.modalidade
    for share;

    if not found or v_model.status <> 'ATIVO' then
      raise exception 'O modelo de contrato da modalidade % ainda não está ativo para emissão.',
        v_target.modalidade using errcode = '55000';
    end if;

    v_qr_enabled := lower(coalesce(v_model.conteudo #>> '{qr,habilitado}', 'true')) <> 'false';
    v_validity_days := case
      when v_qr_enabled
        and coalesce(v_model.conteudo #>> '{qr,modoValidade}', 'SEM_VENCIMENTO') = 'POR_DIAS'
        then (v_model.conteudo #>> '{qr,diasValidade}')::integer
      else null
    end;
    v_validity := case
      when v_validity_days is null then null
      else now() + make_interval(days => v_validity_days)
    end;

    v_reference := format(
      'contrato:%s:%s:%s',
      v_model.revisao,
      p_idempotency_key,
      v_target.matricula_id
    );

    select issued.*
    into v_issued
    from public.emitir_documento_validacao_portal(
      'contrato_aluno',
      v_target.matricula_id,
      null,
      v_reference,
      null,
      null,
      false
    ) issued;

    -- A validade vem do modelo versionado, já validado pela RPC de modelos;
    -- nunca de um valor informado pela tela de emissão.
    update public.documentos_validacao validation
    set validade_ate = v_validity,
        updated_at = now()
    where validation.codigo = v_issued.codigo
      and validation.documento = 'contrato_aluno';

    v_snapshot := jsonb_strip_nulls(jsonb_build_object(
      'aluno', jsonb_build_object(
        'id', v_target.aluno_id,
        'nome', v_target.aluno_nome,
        'nomeSocial', v_target.nome_social,
        'cpf', v_target.cpf_cnpj,
        'rg', v_target.rg,
        'orgaoExpedidor', v_target.orgao_emissor,
        'nascimento', v_target.data_nascimento,
        'nascimentoExibicao', case when v_target.data_nascimento is null then null else to_char(v_target.data_nascimento, 'DD/MM/YYYY') end,
        'email', v_target.email,
        'telefone', v_target.telefone,
        'endereco', jsonb_build_object(
          'cep', v_target.cep,
          'logradouro', v_target.endereco,
          'numero', v_target.numero,
          'complemento', v_target.complemento,
          'bairro', v_target.bairro,
          'cidade', v_target.cidade,
          'uf', v_target.uf
        ),
        'responsavel', jsonb_build_object(
          'nome', v_target.responsavel_nome,
          'cpf', v_target.responsavel_cpf,
          'parentesco', v_target.responsavel_parentesco,
          'telefone', v_target.responsavel_telefone
        )
      ),
      'curso', jsonb_build_object(
        'nome', v_target.curso_nome,
        'modalidade', v_target.modalidade,
        'cargaHoraria', v_target.carga_horaria
      ),
      'turma', jsonb_build_object(
        'id', v_target.turma_id,
        'nome', v_target.turma_nome,
        'codigo', v_target.turma_codigo,
        'turno', v_target.turma_turno,
        'inicio', v_target.data_inicio,
        'inicioExibicao', case when v_target.data_inicio is null then null else to_char(v_target.data_inicio, 'DD/MM/YYYY') end,
        'previsaoTermino', v_target.data_previsao_termino,
        'previsaoTerminoExibicao', case when v_target.data_previsao_termino is null then null else to_char(v_target.data_previsao_termino, 'DD/MM/YYYY') end,
        'matriculaEm', v_target.data_matricula
      ),
      'instituicao', jsonb_build_object(
        'nome', v_target.polo_nome,
        'cnpj', v_target.polo_cnpj,
        'poloId', p_polo_id,
        'logoUrl', v_target.polo_logo_url
      ),
      'marcaDagua', jsonb_build_object(
        'url', v_target.polo_watermark_url,
        'opacidade', v_target.polo_watermark_opacity,
        'texto', v_target.polo_nome
      ),
      'financeiro', jsonb_build_object(
        'valorMatricula', coalesce(v_target.valor_matricula_individual, v_target.valor_matricula),
        'valorMatriculaExibicao', public.formatar_valor_brl_documento(coalesce(v_target.valor_matricula_individual, v_target.valor_matricula)),
        'valorRematricula', coalesce(v_target.valor_rematricula_individual, v_target.valor_rematricula),
        'valorRematriculaExibicao', public.formatar_valor_brl_documento(coalesce(v_target.valor_rematricula_individual, v_target.valor_rematricula)),
        'valorParcela', coalesce(v_target.valor_parcela_individual, v_target.valor_parcela),
        'valorParcelaExibicao', public.formatar_valor_brl_documento(coalesce(v_target.valor_parcela_individual, v_target.valor_parcela)),
        'quantidadeParcelas', v_target.qtd_parcelas,
        'diaVencimento', coalesce(v_target.dia_vencimento_individual, v_target.dia_vencimento_padrao),
        'primeiroVencimento', v_target.data_primeiro_vencimento_financeiro,
        'primeiroVencimentoExibicao', case when v_target.data_primeiro_vencimento_financeiro is null then null else to_char(v_target.data_primeiro_vencimento_financeiro, 'DD/MM/YYYY') end,
        'descontoPontualidade', coalesce(v_target.desconto_pontualidade_individual, v_target.desconto_pontualidade),
        'descontoPontualidadeExibicao', public.formatar_valor_brl_documento(coalesce(v_target.desconto_pontualidade_individual, v_target.desconto_pontualidade)),
        'jurosAtraso', coalesce(v_target.juros_atraso_individual, v_target.juros_atraso),
        'jurosAtrasoExibicao', public.formatar_valor_brl_documento(coalesce(v_target.juros_atraso_individual, v_target.juros_atraso)),
        'multaAtraso', coalesce(v_target.multa_atraso_individual, v_target.multa_atraso),
        'multaAtrasoExibicao', public.formatar_valor_brl_documento(coalesce(v_target.multa_atraso_individual, v_target.multa_atraso)),
        'multaAtrasoPercentual', coalesce(v_target.multa_atraso_percentual_individual, v_target.multa_atraso_percentual),
        'titulos', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'descricao', receivable.descricao,
              'valor', receivable.valor,
              'vencimento', receivable.data_vencimento,
              'parcelaNumero', receivable.parcela_numero,
              'status', receivable.status
            ) order by receivable.data_vencimento, receivable.parcela_numero, receivable.id
          )
          from public.contas_receber receivable
          where receivable.matricula_id = v_target.matricula_id
        ), '[]'::jsonb)
      ),
      'mensagemPersonalizada', v_message,
      'emissao', jsonb_build_object(
        'dataExibicao', to_char(clock_timestamp(), 'DD/MM/YYYY')
      ),
      'validacao', jsonb_build_object(
        'codigo', v_issued.codigo,
        'validade', v_validity,
        'validadeExibicao', case when v_validity is null then 'Sem vencimento' else to_char(v_validity, 'DD/MM/YYYY') end,
        'emitidoEm', v_issued.emitido_em
      )
    ));

    -- Congela também ausências explícitas: um cadastro futuro não deve
    -- substituir silenciosamente a identificação de um contrato emitido.
    v_snapshot := jsonb_set(v_snapshot, '{aluno}', (v_snapshot -> 'aluno') || jsonb_build_object(
      'tipoDocumento', v_target.tipo_documento,
      'cpf', v_target.cpf_cnpj,
      'rg', v_target.rg,
      'orgaoExpedidor', v_target.orgao_emissor,
      'rgUfEmissao', v_target.rg_uf_emissao,
      'rgDataEmissao', v_target.rg_data_emissao
    ));

    v_snapshot := public.enriquecer_snapshot_identidade_visual_contrato(v_snapshot);
    v_snapshot := jsonb_set(
      v_snapshot,
      '{instituicao,presentationVersion}',
      to_jsonb(coalesce(nullif(v_model.conteudo ->> 'presentationVersion', ''), 'CONTRATO_A4_INSTITUCIONAL_V2')),
      true
    );

    v_rendered := public.renderizar_contrato_aluno_documento(
      v_model.conteudo,
      v_snapshot,
      v_issued.codigo,
      v_validity
    );

    update public.documentos_validacao validation
    set dados_emissao = jsonb_build_object(
      'templateKey', v_model.template_key,
      'templateRevision', v_model.revisao,
      'templateSnapshot', v_model.conteudo,
      'contractSnapshot', v_snapshot,
      'renderedDocument', v_rendered
    )
    where validation.codigo = v_issued.codigo
      and validation.documento = 'contrato_aluno';

    v_documents := v_documents || jsonb_build_array(jsonb_build_object(
      'emission_id', v_issued.codigo,
      'target_name', v_target.aluno_nome,
      'validation_code', v_issued.codigo,
      'validation_url', '/validador?code=' || v_issued.codigo,
      'valid_until', v_validity,
      'file_url', null,
      'status_label', 'Contrato preparado',
      'render_payload', jsonb_build_object(
        'template', v_model.conteudo,
        'template_revision', v_model.revisao,
        'snapshot', v_snapshot,
        'rendered', v_rendered
      )
    ));
  end loop;

  v_response := jsonb_build_object(
    'documents', v_documents,
    'summary', jsonb_build_object('total', jsonb_array_length(v_documents), 'mode', v_mode),
    'generated_at', clock_timestamp()
  );

  insert into public.secretaria_documentos_emissao_requisicoes (
    request_id, tipo, fingerprint, resposta
  ) values (
    p_idempotency_key, 'CONTRATO_ALUNO', v_fingerprint, v_response
  );

  return v_response;
end;
$function$;

commit;
