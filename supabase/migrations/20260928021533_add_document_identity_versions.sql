-- A atualização de identidade é explícita: cria outro código e preserva o original.
begin;

create or replace function public.atualizar_identidade_documento_portal(
  p_codigo_origem text, p_request_id uuid
)
returns table (
  emission_id uuid, codigo text, documento text, emitido_em timestamptz,
  ultima_emissao_em timestamptz, validade_ate timestamptz, status text,
  quantidade_emissoes integer, reutilizado boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source public.documentos_validacao%rowtype;
  v_result public.documentos_validacao%rowtype;
  v_ledger public.documentos_validacao_reemissoes_idempotencia%rowtype;
  v_student record;
  v_actor uuid;
  v_key text;
  v_fingerprint text;
  v_reference text;
  v_old_reference text;
  v_issue record;
  v_template jsonb;
  v_academic jsonb;
  v_metadata jsonb;
begin
  if p_request_id is null or nullif(btrim(p_codigo_origem), '') is null then
    raise exception 'Informe o documento de origem e a chave da solicitação.' using errcode = '22023';
  end if;

  select validation.* into v_source
  from public.documentos_validacao validation
  where upper(validation.codigo) = upper(btrim(p_codigo_origem))
  for share;
  if not found then
    raise exception 'Documento de origem não encontrado.' using errcode = '22023';
  end if;
  if v_source.documento not in ('pasta_identificacao', 'ficha_matricula', 'carteirinha') then
    raise exception 'Este documento não admite atualização de identificação.' using errcode = '22023';
  end if;

  select student.tipo_documento, student.rg, student.cpf_cnpj,
    enrollment.aluno_id, class.polo_id, enrollment.status as enrollment_status,
    class.status as class_status, course.modalidade
  into v_student
  from public.matriculas enrollment
  join public.parceiros student on student.id = enrollment.aluno_id
  join public.turmas class on class.id = enrollment.turma_id
  join public.cursos course on course.id = class.curso_id
  where enrollment.id = v_source.matricula_id
  for share of enrollment, student, class, course;
  if not found or v_student.aluno_id is distinct from v_source.aluno_id
    or v_student.polo_id is distinct from v_source.polo_id then
    raise exception 'O vínculo do documento mudou; revise a matrícula antes de atualizar.' using errcode = '55000';
  end if;
  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.can_manage_secretaria_document(v_source.documento, v_source.polo_id) then
    raise exception 'Atualização de identificação não autorizada.' using errcode = '42501';
  end if;
  v_actor := internal_academic.resolve_responsavel(null);
  if v_source.status = 'REVOGADO' then
    raise exception 'Documento revogado não pode originar outra versão.' using errcode = '55000';
  end if;

  v_key := 'identity-refresh:' || p_request_id::text;
  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'source', v_source.id, 'actor', v_actor, 'document', v_source.documento
  )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('document-reissue:' || v_key, 0));

  -- Autoriza antes de acessar o replay; a mesma chave não aceita outra origem/ator.
  select ledger.* into v_ledger
  from public.documentos_validacao_reemissoes_idempotencia ledger
  where ledger.idempotency_key = v_key;
  if found then
    if v_ledger.request_fingerprint is distinct from v_fingerprint
      or v_ledger.estado <> 'CONFIRMADA' then
      raise exception 'A solicitação já foi usada com outro documento ou responsável.' using errcode = '22023';
    end if;
    select validation.* into v_result from public.documentos_validacao validation
    where validation.codigo = v_ledger.codigo;
    if not found or v_result.status = 'REVOGADO' then
      raise exception 'A versão produzida foi removida ou revogada.' using errcode = '55000';
    end if;
    reutilizado := true;
  else
    if nullif(btrim(v_student.tipo_documento), '') is null
      or upper(btrim(v_student.tipo_documento)) = 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO' then
      raise exception 'Confirme CIN ou RG antigo no cadastro antes de atualizar o documento.' using errcode = '22023';
    end if;
    if v_source.documento = 'carteirinha' and not (
      upper(coalesce(v_student.enrollment_status, '')) = 'ATIVO'
      and upper(coalesce(v_student.class_status, '')) = 'EM_ANDAMENTO'
      and upper(coalesce(v_student.modalidade, '')) in ('TECNICO', 'TÉCNICO')
    ) then
      raise exception 'Carteirinha exige matrícula técnica ativa em turma em andamento.' using errcode = '42501';
    end if;
    v_reference := internal_academic.document_identity_reference(
      v_student.tipo_documento, v_student.rg, v_student.cpf_cnpj
    );
    v_old_reference := internal_academic.document_identity_reference(
      v_source.dados_emissao ->> 'studentDocumentType',
      v_source.dados_emissao ->> 'studentRg', v_source.dados_emissao ->> 'studentCpf'
    );
    if v_reference = v_old_reference then
      raise exception 'A identificação deste documento já corresponde ao cadastro atual.' using errcode = '22023';
    end if;
    -- Chaves de pedido distintas também convergem na mesma versão canônica.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      concat_ws(':', 'document-identity-version', v_source.documento,
        v_source.matricula_id::text, coalesce(v_source.periodo_referencia, '-'), v_reference), 0
    ));
    if v_source.documento in ('pasta_identificacao', 'ficha_matricula') then
      select issued.* into v_issue
      from internal_academic.emitir_ficha_validacao_com_referencia(
        v_source.documento, v_source.matricula_id, v_source.periodo_referencia,
        v_actor, false, '{}'::jsonb, v_reference
      ) issued;
    else
      select issued.* into v_issue
      from public.emitir_documento_validacao_interno(
        v_source.documento, v_source.matricula_id, v_source.periodo_referencia,
        v_reference, null, v_actor, false
      ) issued;
    end if;
    select validation.* into v_result from public.documentos_validacao validation
    where validation.codigo = v_issue.codigo;
    if not found or v_result.id = v_source.id then
      raise exception 'Não foi produzida uma nova versão documental.' using errcode = '55000';
    end if;
    if not coalesce(v_issue.reutilizado, false) then
      v_metadata := jsonb_build_object(
        'identitySourceCode', v_source.codigo, 'identitySourceEmissionId', v_source.id
      );
      if v_source.documento = 'carteirinha' then
        select config.conteudo into v_template from public.documentos_templates config
        where config.id = 'carteirinha' for share;
        if not found or jsonb_typeof(v_template) <> 'object' then
          raise exception 'Modelo da carteirinha não configurado.' using errcode = '55000';
        end if;
        select config.conteudo into v_academic from public.documentos_templates config
        where config.id = 'academicos_config' for share;
        v_template := v_template || jsonb_strip_nulls(jsonb_build_object(
          'corPrimaria', nullif(v_academic ->> 'carteirinhaPrimaryColor', ''),
          'corSecundaria', nullif(v_academic ->> 'carteirinhaSecondaryColor', '')
        ));
        v_metadata := v_metadata || jsonb_build_object(
          'documentTemplateId', 'carteirinha', 'documentTemplateSnapshot', v_template
        );
      end if;
      update public.documentos_validacao validation
      set dados_emissao = validation.dados_emissao || v_metadata
      where validation.id = v_result.id
      returning validation.* into v_result;
    end if;
    insert into public.documentos_validacao_reemissoes_idempotencia (
      idempotency_key, request_fingerprint, matricula_id, codigo, documento,
      emitido_em, ultima_emissao_em, validade_ate, status, quantidade_emissoes,
      reutilizado, estado, politica_versao, validacao_publica
    ) values (
      v_key, v_fingerprint, v_result.matricula_id, v_result.codigo, v_result.documento,
      v_result.emitido_em, v_result.ultima_emissao_em, v_result.validade_ate,
      v_result.status, v_result.quantidade_emissoes, v_issue.reutilizado,
      'CONFIRMADA', v_result.politica_versao_emissao, v_result.validacao_publica
    );
    reutilizado := v_issue.reutilizado;
  end if;

  emission_id := v_result.id;
  codigo := v_result.codigo;
  documento := v_result.documento;
  emitido_em := v_result.emitido_em;
  ultima_emissao_em := v_result.ultima_emissao_em;
  validade_ate := v_result.validade_ate;
  status := v_result.status;
  quantidade_emissoes := v_result.quantidade_emissoes;
  return next;
end;
$function$;

revoke all on function public.atualizar_identidade_documento_portal(text, uuid)
  from public, anon;
grant execute on function public.atualizar_identidade_documento_portal(text, uuid)
  to authenticated, service_role;

commit;
