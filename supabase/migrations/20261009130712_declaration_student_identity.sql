begin;

-- Preserva a identidade individual nas novas declarações e completa a leitura
-- autorizada das emissões legadas, sem reescrever snapshots já emitidos.
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
        case when payload ->> 'documento' = 'contrato_aluno'
          and payload #>> '{dados_emissao,contractSnapshot,instituicao,presentationVersion}'
            = 'CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA' then
          jsonb_set(payload, '{dados_emissao,renderedDocument}',
            public.repaginar_render_contrato_v3(
              payload #> '{dados_emissao,renderedDocument}',
              payload #>> '{dados_emissao,contractSnapshot,instituicao,presentationVersion}'
            )
          ) else payload end
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

CREATE OR REPLACE FUNCTION public.emitir_documento_validacao_interno(p_documento text, p_matricula_id uuid, p_periodo_referencia text DEFAULT NULL::text, p_referencia_externa text DEFAULT NULL::text, p_validade_ate timestamp with time zone DEFAULT NULL::timestamp with time zone, p_emitido_por uuid DEFAULT NULL::uuid, p_registrar_reemissao boolean DEFAULT false)
 RETURNS TABLE(codigo text, documento text, emitido_em timestamp with time zone, ultima_emissao_em timestamp with time zone, validade_ate timestamp with time zone, status text, quantidade_emissoes integer, reutilizado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_matricula record;
  v_periodo text;
  v_referencia text;
  v_identidade text;
  v_prefixo text;
  v_validade timestamptz;
  v_codigo text;
  v_existia boolean;
  v_politica public.documentos_validacao_politicas%rowtype;
  v_status_existente text;
  v_operation_at timestamptz;
begin
  if p_documento = 'diario_classe' then
    raise exception
      'O Diário de Classe usa a emissão canônica por turma e disciplina.'
      using errcode = '22023';
  end if;

  if p_registrar_reemissao
    and coalesce(
      current_setting('app.document_reissue_authorized', true),
      ''
    ) <> 'on'
  then
    raise exception
      'Reemissão exige a RPC idempotente com chave explícita.'
      using errcode = '22023';
  end if;

  begin
    v_operation_at := nullif(
      current_setting('app.document_reissue_at', true),
      ''
    )::timestamptz;
  exception
    when invalid_datetime_format then
      raise exception 'Timestamp interno de reemissão inválido.'
        using errcode = '22007';
  end;
  v_operation_at := coalesce(v_operation_at, now());

  select policy.*
  into v_politica
  from public.documentos_validacao_politicas policy
  where policy.documento = p_documento
  for share;

  if not found then
    raise exception 'Tipo de documento não permitido: %', p_documento
      using errcode = '22023';
  end if;

  select
    enrollment.id,
    enrollment.aluno_id,
    enrollment.status as matricula_status,
    enrollment.data_matricula,
    class.polo_id,
    student.nome as aluno_nome,
    student.cpf_cnpj as aluno_cpf,
    student.tipo_documento as aluno_tipo_documento,
    student.rg as aluno_rg,
    student.orgao_emissor as aluno_rg_orgao,
    student.rg_uf_emissao as aluno_rg_uf,
    student.rg_data_emissao as aluno_rg_data,
    student.data_nascimento as aluno_nascimento,
    student.foto_url as aluno_foto_url,
    class.nome as turma_nome,
    class.codigo as turma_codigo,
    course.nome as curso_nome,
    unit.nome as polo_nome
  into v_matricula
  from public.matriculas enrollment
  join public.parceiros student on student.id = enrollment.aluno_id
  left join public.turmas class on class.id = enrollment.turma_id
  left join public.cursos course on course.id = class.curso_id
  left join public.polos unit on unit.id = class.polo_id
  where enrollment.id = p_matricula_id;

  if not found then
    raise exception 'Matrícula não encontrada.'
      using errcode = '22023';
  end if;

  v_periodo := nullif(btrim(p_periodo_referencia), '');
  v_referencia := nullif(btrim(p_referencia_externa), '');

  if v_politica.escopo_identidade = 'ANUAL'
    and p_documento = 'declaracao_irpf'
    and v_periodo is null
  then
    v_periodo := (extract(year from current_date)::integer - 1)::text;
  elsif v_politica.escopo_identidade = 'ANUAL' and v_periodo is null then
    v_periodo := extract(year from current_date)::integer::text;
  end if;

  if v_politica.escopo_identidade = 'PROCESSO' and v_referencia is null then
    raise exception 'Este documento exige uma referência de processo ou contrato.'
      using errcode = '22023';
  end if;

  v_identidade := concat_ws(
    ':',
    p_documento,
    p_matricula_id::text,
    coalesce(v_periodo, '-'),
    coalesce(v_referencia, '-')
  );

  if not p_registrar_reemissao then
    select
      validation.codigo,
      validation.documento,
      validation.emitido_em,
      validation.ultima_emissao_em,
      validation.validade_ate,
      validation.status,
      validation.quantidade_emissoes
    into
      codigo,
      documento,
      emitido_em,
      ultima_emissao_em,
      validade_ate,
      status,
      quantidade_emissoes
    from public.documentos_validacao validation
    where validation.identidade = v_identidade;

    if found then
      if status = 'REVOGADO' then
        raise exception
          'Documento revogado não pode ser reutilizado ou reemitido.'
          using errcode = '55000';
      end if;

      if validade_ate is not null and validade_ate < now() then
        raise exception
          'Documento expirado exige uma reemissão administrativa explícita.'
          using errcode = '55000';
      end if;

      reutilizado := true;
      return next;
      return;
    end if;
  else
    select validation.status
    into v_status_existente
    from public.documentos_validacao validation
    where validation.identidade = v_identidade
    for update;

    if found and v_status_existente = 'REVOGADO' then
      raise exception
        'Documento revogado não pode ser reutilizado ou reemitido.'
        using errcode = '55000';
    end if;
  end if;

  v_prefixo := v_politica.prefixo;
  -- Validade informada pelo navegador continua ignorada. Na reemissão comum,
  -- o prazo é renovado pela política vigente. O trigger da carteirinha
  -- substitui esta data pelo término acadêmico da turma.
  v_validade := case
    when v_politica.validade_dias is null then null
    else v_operation_at + make_interval(days => v_politica.validade_dias)
  end;

  select exists (
    select 1
    from public.documentos_validacao validation
    where validation.identidade = v_identidade
  ) into v_existia;

  loop
    v_codigo := v_prefixo
      || '-' || upper(substring(encode(extensions.gen_random_bytes(9), 'hex') from 1 for 4))
      || '-' || upper(substring(encode(extensions.gen_random_bytes(9), 'hex') from 1 for 4))
      || '-' || upper(substring(encode(extensions.gen_random_bytes(9), 'hex') from 1 for 4));

    begin
      codigo := null;

      insert into public.documentos_validacao (
        identidade,
        codigo,
        documento,
        matricula_id,
        aluno_id,
        polo_id,
        periodo_referencia,
        referencia_externa,
        validade_ate,
        emitido_por,
        validacao_publica,
        dados_emissao
      )
      values (
        v_identidade,
        v_codigo,
        p_documento,
        p_matricula_id,
        v_matricula.aluno_id,
        v_matricula.polo_id,
        v_periodo,
        v_referencia,
        v_validade,
        p_emitido_por,
        v_politica.validacao_publica,
        jsonb_build_object(
          'studentName', v_matricula.aluno_nome,
          'studentCpf', v_matricula.aluno_cpf,
          'studentBirthDate', v_matricula.aluno_nascimento,
          'studentPhotoUrl', v_matricula.aluno_foto_url,
          'courseName', v_matricula.curso_nome,
          'className', coalesce(v_matricula.turma_nome, v_matricula.turma_codigo),
          'unitName', v_matricula.polo_nome,
          'enrollmentStatus', upper(coalesce(v_matricula.matricula_status, '')),
          'enrollmentDate', v_matricula.data_matricula,
          'institutionName', 'Universo Cursos e Consultoria',
          'validationPublic', v_politica.validacao_publica,
          'validityDays', v_politica.validade_dias
        ) || case when p_documento = 'carteirinha' then
          internal_academic.student_card_identity_snapshot(
            v_matricula.aluno_tipo_documento, v_matricula.aluno_rg, v_matricula.aluno_cpf
          )
          when p_documento in ('declaracao_matricula', 'declaracao_frequencia') then
            jsonb_build_object(
              'studentDocumentType', v_matricula.aluno_tipo_documento,
              'studentRg', v_matricula.aluno_rg,
              'studentRgIssuer', v_matricula.aluno_rg_orgao,
              'studentRgState', v_matricula.aluno_rg_uf,
              'studentRgIssueDate', v_matricula.aluno_rg_data
            )
          else '{}'::jsonb
        end
      )
      on conflict (identidade) do update
      set
        ultima_emissao_em = case
          when p_registrar_reemissao then v_operation_at
          else documentos_validacao.ultima_emissao_em
        end,
        validade_ate = case
          when p_registrar_reemissao then excluded.validade_ate
          else documentos_validacao.validade_ate
        end,
        validacao_publica = case
          when p_registrar_reemissao then excluded.validacao_publica
          else documentos_validacao.validacao_publica
        end,
        emitido_por = coalesce(
          excluded.emitido_por,
          documentos_validacao.emitido_por
        ),
        quantidade_emissoes = documentos_validacao.quantidade_emissoes
          + case when p_registrar_reemissao then 1 else 0 end,
        dados_emissao = case
          when p_registrar_reemissao then
            documentos_validacao.dados_emissao
            || jsonb_build_object(
              'validationPublic', v_politica.validacao_publica,
              'validityDays', v_politica.validade_dias
            )
          else
            (case when p_documento in (
              'carteirinha', 'declaracao_matricula', 'declaracao_frequencia'
            ) then
              documentos_validacao.dados_emissao
            else documentos_validacao.dados_emissao
              || jsonb_strip_nulls(excluded.dados_emissao)
            end)
            || jsonb_build_object(
              'validationPublic', documentos_validacao.validacao_publica,
              'validityDays', case
                when documentos_validacao.validade_ate is null then null
                else greatest(
                  1,
                  ceil(extract(epoch from (
                    documentos_validacao.validade_ate
                    - documentos_validacao.emitido_em
                  )) / 86400)::integer
                )
              end
            )
        end,
        updated_at = now()
      where not p_registrar_reemissao
        or documentos_validacao.status <> 'REVOGADO'
      returning
        documentos_validacao.codigo,
        documentos_validacao.documento,
        documentos_validacao.emitido_em,
        documentos_validacao.ultima_emissao_em,
        documentos_validacao.validade_ate,
        documentos_validacao.status,
        documentos_validacao.quantidade_emissoes
      into
        codigo,
        documento,
        emitido_em,
        ultima_emissao_em,
        validade_ate,
        status,
        quantidade_emissoes;

      if codigo is null then
        raise exception
          'Documento revogado não pode ser reutilizado ou reemitido.'
          using errcode = '55000';
      end if;

      reutilizado := v_existia or codigo <> v_codigo;
      return next;
      return;
    exception
      when unique_violation then
        if exists (
          select 1
          from public.documentos_validacao validation
          where validation.identidade = v_identidade
        ) then
          continue;
        end if;
    end;
  end loop;
end;
$function$;

commit;
