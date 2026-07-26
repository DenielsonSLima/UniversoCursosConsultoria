-- Fecha autoria canônica e torna a emissão de múltiplas fichas transacional.

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
  v_enrollment record;
  v_model record;
  v_model_id uuid;
  v_template jsonb;
  v_snapshot jsonb;
  v_issue record;
  v_effective_issuer uuid;
begin
  if p_documento not in ('pasta_identificacao', 'ficha_matricula') then
    raise exception 'Documento incompatível com a emissão de ficha cadastral.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_dados_emissao, '{}'::jsonb)) <> 'object' then
    raise exception 'Os dados auxiliares da ficha devem ser um objeto JSON.'
      using errcode = '22023';
  end if;

  select
    m.id as enrollment_id,
    m.status as enrollment_status,
    m.data_matricula as enrollment_date,
    p.nome as student_name,
    p.nome_social as student_social_name,
    p.cpf_cnpj as student_cpf,
    p.data_nascimento as student_birth_date,
    p.foto_url as student_photo_url,
    p.email as student_email,
    p.telefone as student_phone,
    p.sexo as student_sex,
    p.estado_civil as student_marital_status,
    p.raca_cor as student_race_color,
    p.rg as student_rg,
    p.tipo_documento as student_document_type,
    p.orgao_emissor as student_rg_issuer,
    p.rg_uf_emissao as student_rg_state,
    p.rg_data_emissao as student_rg_issue_date,
    p.nacionalidade as student_nationality,
    p.naturalidade as student_birthplace,
    p.titulo_eleitor as student_voter_id,
    p.reservista as student_reservist,
    p.nome_mae as student_mother_name,
    p.nome_pai as student_father_name,
    p.pcd as student_pcd,
    p.pcd_tipo as student_pcd_type,
    p.cep as student_zip_code,
    p.endereco as student_street,
    p.numero as student_address_number,
    p.complemento as student_address_complement,
    p.bairro as student_district,
    p.cidade as student_city,
    p.uf as student_state,
    p.responsavel_nome as student_responsible_name,
    p.responsavel_cpf as student_responsible_cpf,
    p.responsavel_parentesco as student_responsible_relation,
    p.responsavel_telefone as student_responsible_phone,
    p.observacao as student_notes,
    t.polo_id,
    t.nome as class_name,
    t.turno as class_shift,
    c.id as course_id,
    c.nome as course_name,
    c.modalidade as course_modality,
    unit.nome as unit_name
  into v_enrollment
  from public.matriculas as m
  join public.parceiros as p on p.id = m.aluno_id
  join public.turmas as t on t.id = m.turma_id
  join public.cursos as c on c.id = t.curso_id
  left join public.polos as unit on unit.id = t.polo_id
  where m.id = p_matricula_id
  for share of m, p, t, c;

  if not found then
    raise exception 'Matrícula, aluno, turma ou curso não localizado.';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.can_manage_secretaria_document(p_documento, v_enrollment.polo_id)
  then
    raise exception 'Acesso à emissão desta ficha não autorizado.'
      using errcode = '42501';
  end if;

  if p_documento = 'ficha_matricula' then
    if nullif(btrim(coalesce(p_periodo_referencia, '')), '') is null then
      raise exception 'Selecione um modelo ativo de ficha de matrícula.'
        using errcode = '22023';
    end if;

    begin
      v_model_id := p_periodo_referencia::uuid;
    exception
      when invalid_text_representation then
        raise exception 'O identificador do modelo de ficha é inválido.'
          using errcode = '22023';
    end;

    select
      model.id,
      model.nome,
      model.tipo_curso,
      model.status,
      model.requer_assinatura,
      model.texto_contrato,
      model.campos_customizados,
      model.curso_especifico_id,
      model.template_config
    into v_model
    from public.modelos_fichas as model
    where model.id = v_model_id
    for share;

    if not found or upper(coalesce(v_model.status, '')) <> 'ATIVO' then
      raise exception 'O modelo selecionado não está ativo ou foi removido.'
        using errcode = '22023';
    end if;

    if v_model.curso_especifico_id is not null
      and v_model.curso_especifico_id <> v_enrollment.course_id
    then
      raise exception 'O modelo selecionado não pertence ao curso desta matrícula.'
        using errcode = '22023';
    end if;

    if upper(btrim(coalesce(v_model.tipo_curso, 'TODOS'))) <> 'TODOS'
      and upper(btrim(v_model.tipo_curso)) <> upper(btrim(coalesce(v_enrollment.course_modality, '')))
    then
      raise exception 'O modelo selecionado não é compatível com a modalidade desta matrícula.'
        using errcode = '22023';
    end if;

    v_template :=
      coalesce(v_model.template_config, '{}'::jsonb)
      || jsonb_build_object(
        'enrollmentFormTerm', coalesce(v_model.texto_contrato, ''),
        'enrollmentFormCustomFields', coalesce(v_model.campos_customizados, '[]'::jsonb),
        'enrollmentFormRequiresSignature', coalesce(v_model.requer_assinatura, true)
      );

    if jsonb_typeof(v_template) <> 'object'
      or nullif(btrim(coalesce(v_template ->> 'textContent', '')), '') is null
    then
      raise exception 'O modelo selecionado ainda não possui um layout válido.'
        using errcode = '22023';
    end if;
  else
    select template.conteudo
    into v_template
    from public.documentos_templates as template
    where template.id = 'pasta_identificacao_aluno'
    for share;

    if not found
      or jsonb_typeof(v_template) <> 'object'
      or nullif(btrim(coalesce(v_template ->> 'textContent', '')), '') is null
    then
      raise exception 'O modelo geral da Pasta de Identificação não está configurado.'
        using errcode = '22023';
    end if;
  end if;

  v_snapshot := jsonb_build_object(
    'studentName', coalesce(v_enrollment.student_name, ''),
    'studentSocialName', coalesce(v_enrollment.student_social_name, ''),
    'studentCpf', coalesce(v_enrollment.student_cpf, ''),
    'studentBirthDate', coalesce(v_enrollment.student_birth_date::text, ''),
    'studentPhotoUrl', v_enrollment.student_photo_url,
    'studentEmail', coalesce(v_enrollment.student_email, ''),
    'studentPhone', coalesce(v_enrollment.student_phone, ''),
    'studentSex', coalesce(v_enrollment.student_sex, ''),
    'studentMaritalStatus', coalesce(v_enrollment.student_marital_status, ''),
    'studentRaceColor', coalesce(v_enrollment.student_race_color, ''),
    'studentRg', coalesce(v_enrollment.student_rg, ''),
    'studentDocumentType', coalesce(v_enrollment.student_document_type, ''),
    'studentRgIssuer', coalesce(v_enrollment.student_rg_issuer, ''),
    'studentRgState', coalesce(v_enrollment.student_rg_state, ''),
    'studentRgIssueDate', coalesce(v_enrollment.student_rg_issue_date::text, ''),
    'studentNationality', coalesce(v_enrollment.student_nationality, ''),
    'studentBirthplace', coalesce(v_enrollment.student_birthplace, ''),
    'studentVoterId', coalesce(v_enrollment.student_voter_id, ''),
    'studentReservist', coalesce(v_enrollment.student_reservist, ''),
    'studentMotherName', coalesce(v_enrollment.student_mother_name, ''),
    'studentFatherName', coalesce(v_enrollment.student_father_name, ''),
    'studentPcd', case when coalesce(v_enrollment.student_pcd, false) then 'SIM' else 'NÃO' end,
    'studentPcdType', coalesce(v_enrollment.student_pcd_type, ''),
    'studentZipCode', coalesce(v_enrollment.student_zip_code, ''),
    'studentStreet', coalesce(v_enrollment.student_street, ''),
    'studentAddressNumber', coalesce(v_enrollment.student_address_number, ''),
    'studentAddressComplement', coalesce(v_enrollment.student_address_complement, ''),
    'studentDistrict', coalesce(v_enrollment.student_district, ''),
    'studentCity', coalesce(v_enrollment.student_city, ''),
    'studentState', coalesce(v_enrollment.student_state, ''),
    'studentResponsibleName', coalesce(v_enrollment.student_responsible_name, ''),
    'studentResponsibleCpf', coalesce(v_enrollment.student_responsible_cpf, ''),
    'studentResponsibleRelation', coalesce(v_enrollment.student_responsible_relation, ''),
    'studentResponsiblePhone', coalesce(v_enrollment.student_responsible_phone, ''),
    'studentNotes', coalesce(v_enrollment.student_notes, ''),
    'courseName', coalesce(v_enrollment.course_name, ''),
    'courseModality', coalesce(v_enrollment.course_modality, ''),
    'classShift', coalesce(v_enrollment.class_shift, ''),
    'className', coalesce(v_enrollment.class_name, ''),
    'unitName', coalesce(v_enrollment.unit_name, ''),
    'enrollmentStatus', coalesce(v_enrollment.enrollment_status, ''),
    'enrollmentDate', coalesce(v_enrollment.enrollment_date::text, ''),
    'documentTemplateId', case
      when p_documento = 'ficha_matricula' then v_model_id::text
      else 'pasta_identificacao_aluno'
    end,
    'documentTemplateName', case
      when p_documento = 'ficha_matricula' then v_model.nome
      else 'Pasta de Identificação Geral'
    end,
    'documentTemplateSnapshot', v_template
  );

  if coalesce((select auth.role()), '') = 'service_role' then
    v_effective_issuer := p_emitido_por;
  else
    select access_user.id
    into v_effective_issuer
    from auth.users as identity
    join public.usuarios_sistema as access_user
      on lower(access_user.email) = lower(identity.email)
    where identity.id = (select auth.uid())
      and upper(coalesce(access_user.status, '')) in ('ATIVO', 'ACTIVE')
    order by (access_user.id = identity.id) desc
    limit 1;

    if v_effective_issuer is null then
      raise exception 'O usuário autenticado não possui identidade ativa no portal.'
        using errcode = '42501';
    end if;
  end if;

  select issued.*
  into v_issue
  from public.emitir_documento_validacao_portal(
    p_documento,
    p_matricula_id,
    p_periodo_referencia,
    null,
    null,
    v_effective_issuer,
    p_registrar_reemissao
  ) as issued;

  if v_issue.codigo is null then
    raise exception 'A emissão não retornou um código de validação.';
  end if;

  update public.documentos_validacao as validation
  set dados_emissao =
    coalesce(validation.dados_emissao, '{}'::jsonb)
    || v_snapshot
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

create or replace function public.emitir_fichas_validacao_lote_portal(
  p_documento text,
  p_matricula_ids uuid[],
  p_periodo_referencia text default null,
  p_emitido_por uuid default null,
  p_registrar_reemissao boolean default false
)
returns table(
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
  v_request record;
  v_issue record;
begin
  if coalesce(cardinality(p_matricula_ids), 0) = 0 then
    raise exception 'Informe ao menos uma matrícula para emissão.'
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

  for v_request in
    select requested_id, request_order::integer
    from unnest(p_matricula_ids) with ordinality as requested(requested_id, request_order)
    order by request_order
  loop
    select issued.*
    into v_issue
    from public.emitir_ficha_validacao_portal(
      p_documento,
      v_request.requested_id,
      p_periodo_referencia,
      p_emitido_por,
      p_registrar_reemissao,
      '{}'::jsonb
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

revoke all on function public.emitir_fichas_validacao_lote_portal(
  text, uuid[], text, uuid, boolean
) from public, anon;
grant execute on function public.emitir_fichas_validacao_lote_portal(
  text, uuid[], text, uuid, boolean
) to authenticated, service_role;
