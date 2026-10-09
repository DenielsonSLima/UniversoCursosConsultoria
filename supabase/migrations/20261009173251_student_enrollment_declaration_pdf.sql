-- The student receives the same saved model and canonical emission as Secretaria.
-- No template-table policy is widened and existing emission snapshots stay intact.
create or replace function public.obter_declaracao_matricula_aluno_pdf(
  p_matricula_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_aluno_id uuid;
  v_enrollment record;
  v_template jsonb;
  v_polo jsonb;
  v_watermark jsonb;
  v_issue record;
  v_emission jsonb;
begin
  if auth.uid() is null then
    raise exception 'Acesso à declaração do aluno não autorizado.'
      using errcode = '42501';
  end if;

  v_aluno_id := public.current_aluno_id();
  if v_aluno_id is null then
    raise exception 'Acesso à declaração do aluno não autorizado.'
      using errcode = '42501';
  end if;

  -- Authorize ownership before reading a model, code, institution or snapshot.
  select enrollment.id, class.polo_id,
    jsonb_build_object(
      'id', enrollment.id,
      'status', enrollment.status,
      'turma', jsonb_build_object(
        'id', class.id, 'nome', class.nome, 'codigo', class.codigo
      )
    ) as matricula,
    jsonb_build_object(
      'id', student.id,
      'nome', student.nome,
      'cpf_cnpj', student.cpf_cnpj,
      'rg', student.rg,
      'tipo_documento', student.tipo_documento,
      'orgao_emissor', student.orgao_emissor,
      'rg_uf_emissao', student.rg_uf_emissao,
      'rg_data_emissao', student.rg_data_emissao,
      'data_nascimento', student.data_nascimento
    ) as aluno
  into v_enrollment
  from public.matriculas as enrollment
  join public.turmas as class on class.id = enrollment.turma_id
  join public.parceiros as student on student.id = enrollment.aluno_id
  where enrollment.id = p_matricula_id
    and enrollment.aluno_id = v_aluno_id
    and upper(coalesce(enrollment.status, '')) = 'ATIVO';

  if not found or v_enrollment.polo_id is null then
    raise exception 'A declaração exige matrícula ativa do próprio aluno.'
      using errcode = '42501';
  end if;

  -- The editor saves the global model. The unit key is legacy compatibility only.
  select model.conteudo
  into v_template
  from public.documentos_templates as model
  where model.id in ('declaracao', 'declaracao_' || v_enrollment.polo_id::text)
  order by case when model.id = 'declaracao' then 0 else 1 end
  limit 1;

  if v_template is null
    or jsonb_typeof(v_template) <> 'object'
    or jsonb_typeof(v_template -> 'textContent') is distinct from 'string'
    or nullif(btrim(v_template ->> 'textContent'), '') is null
    or (v_template ? 'absoluteFields'
      and jsonb_typeof(v_template -> 'absoluteFields') is distinct from 'array')
  then
    raise exception 'O modelo oficial da declaração não foi localizado ou está inválido.'
      using errcode = '55000';
  end if;

  -- Keep the same header fallbacks as polosService.getById. Return only PDF fields.
  select jsonb_build_object(
      'id', unit.id,
      'nome', unit.nome,
      'nomeFantasia', unit.nome,
      'cnpj', unit.cnpj,
      'cidade', unit.cidade,
      'estado', unit.estado,
      'uf', unit.estado,
      'is_matriz', unit.is_matriz,
      'logoUrl', coalesce(nullif(unit.logo_url, ''), nullif(company.logo_url, ''),
        nullif(principal.logo_url, ''), ''),
      'endereco', coalesce(nullif(unit.endereco, ''), company.endereco, ''),
      'numero', coalesce(nullif(unit.numero, ''), company.numero, ''),
      'complemento', coalesce(nullif(unit.complemento, ''), company.complemento, ''),
      'bairro', coalesce(nullif(unit.bairro, ''), company.bairro, ''),
      'cep', coalesce(nullif(unit.cep, ''), company.cep, ''),
      'telefone', coalesce(nullif(unit.telefone, ''), company.telefone, ''),
      'email', coalesce(nullif(unit.email, ''), company.email, '')
    ),
    jsonb_build_object(
      'id', unit.id,
      'nomeFantasia', unit.nome,
      'cidade', unit.cidade,
      'uf', unit.estado,
      'watermarkUrl', unit.watermark_url,
      'watermarkOpacity', coalesce(unit.watermark_opacity, 0.1),
      'watermarkScale', coalesce(unit.watermark_scale, 50),
      'watermarkRotate', unit.watermark_rotate is distinct from false
    )
  into v_polo, v_watermark
  from public.polos as unit
  left join public.empresas as company on company.id = unit.company_id
  left join lateral (
    select enterprise.logo_url
    from public.empresas as enterprise
    order by enterprise.id
    limit 1
  ) as principal on true
  where unit.id = v_enrollment.polo_id;

  if v_polo is null then
    raise exception 'A instituição da matrícula não foi localizada.'
      using errcode = '55000';
  end if;

  -- Keep the established eligibility, validity and stable-code/idempotency rules.
  -- The browser supplies neither identity data, validity, actor nor a template.
  select issued.*
  into v_issue
  from public.emitir_documento_validacao_portal(
    'declaracao_matricula', p_matricula_id, null, null, null, null, false
  ) as issued;

  select jsonb_build_object(
      'id', validation.id,
      'identidade', validation.identidade,
      'codigo', validation.codigo,
      'documento', validation.documento,
      'matricula_id', validation.matricula_id,
      'aluno_id', validation.aluno_id,
      'polo_id', validation.polo_id,
      'periodo_referencia', validation.periodo_referencia,
      'referencia_externa', validation.referencia_externa,
      'status', validation.status,
      'emitido_em', validation.emitido_em,
      'ultima_emissao_em', validation.ultima_emissao_em,
      'validade_ate', validation.validade_ate,
      'validacao_publica', validation.validacao_publica,
      'revogado_em', validation.revogado_em,
      'emitido_por', validation.emitido_por,
      'quantidade_emissoes', validation.quantidade_emissoes,
      'dados_emissao', validation.dados_emissao,
      'aluno', v_enrollment.aluno,
      'matricula', v_enrollment.matricula
    )
  into v_emission
  from public.documentos_validacao as validation
  where validation.codigo = v_issue.codigo
    and validation.documento = 'declaracao_matricula'
    and validation.matricula_id = p_matricula_id
    and validation.aluno_id = v_aluno_id
    and validation.polo_id = v_enrollment.polo_id
    and validation.status = 'ATIVO';

  if v_emission is null then
    raise exception 'A emissão oficial da declaração não foi localizada.'
      using errcode = '55000';
  end if;

  return jsonb_build_object(
    'emission', v_emission,
    'preview', jsonb_build_object(
      'template', v_template,
      'polo', v_polo,
      'watermark', v_watermark,
      'academicData', null,
      'certificate', null
    )
  );
end;
$function$;

revoke all on function public.obter_declaracao_matricula_aluno_pdf(uuid)
  from public, anon, authenticated;
grant execute on function public.obter_declaracao_matricula_aluno_pdf(uuid)
  to authenticated, service_role;

comment on function public.obter_declaracao_matricula_aluno_pdf(uuid) is
  'Declaração canônica do aluno autenticado: matrícula própria ativa, modelo salvo e emissão oficial.';
