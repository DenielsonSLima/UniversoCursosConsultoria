-- Existing contract authorization, branding and snapshot immutability boundaries.

CREATE OR REPLACE FUNCTION public.enriquecer_snapshot_identidade_visual_contrato(p_snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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

CREATE OR REPLACE FUNCTION public.preparar_emissao_contrato_aluno_secure(p_polo_id uuid, p_modo text, p_matricula_ids uuid[], p_mensagem_personalizada text, p_idempotency_key uuid)
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
  v_locked_enrollment_ids uuid[];
  v_class_ids uuid[];
  v_locked_class_ids uuid[];
  v_course_ids uuid[];
  v_locked_course_ids uuid[];
  v_fingerprint text;
  v_replay public.secretaria_documentos_emissao_requisicoes%rowtype;
  v_modalidade text;
  v_model public.documentos_modelos_configuracoes%rowtype;
  v_approval_id uuid;
begin
  -- A autorização continua precedendo inclusive o replay, evitando que uma
  -- chave conhecida exponha um snapshot de outro polo.
  if not public.can_manage_secretaria_document('contrato_aluno', p_polo_id) then
    raise exception 'Acesso à emissão de contrato não autorizado.'
      using errcode = '42501';
  end if;

  if p_idempotency_key is null then
    raise exception 'Informe a chave de idempotência da emissão.'
      using errcode = '22023';
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

  -- Mantém o fingerprint histórico para que requests emitidos antes desta
  -- migração continuem reproduzindo exatamente o snapshot original.
  v_fingerprint := md5(
    p_polo_id::text || '|' || v_mode || '|' || coalesce(v_message, '') || '|'
    || array_to_string(v_ids::text[], ',')
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_idempotency_key::text)
  );

  select replay.*
  into v_replay
  from public.secretaria_documentos_emissao_requisicoes replay
  where replay.request_id = p_idempotency_key;

  if found then
    if v_replay.tipo <> 'CONTRATO_ALUNO'
      or v_replay.fingerprint <> v_fingerprint
    then
      raise exception 'A chave de idempotência já foi usada com outra emissão.'
        using errcode = '22023';
    end if;

    return public.repaginar_resposta_contrato_v3(v_replay.resposta);
  end if;

  -- Somente requests novos dependem da situação acadêmica e do modelo atual.
  -- Matrícula -> turma -> curso é a ordem global deste emissor. Cada conjunto
  -- é materializado e ordenado antes do FOR SHARE; assim a modalidade usada
  -- para escolher o modelo não pode mudar entre a validação e o emissor base.
  select coalesce(
    array_agg(locked_enrollment.id order by locked_enrollment.id),
    array[]::uuid[]
  )
  into v_locked_enrollment_ids
  from (
    select enrollment.id
    from public.matriculas enrollment
    where enrollment.id = any(v_ids)
    order by enrollment.id
    for share
  ) locked_enrollment;

  if v_locked_enrollment_ids <> v_ids then
    raise exception 'Há matrícula inexistente na seleção do contrato.'
      using errcode = '42501';
  end if;

  select coalesce(
    array_agg(distinct enrollment.turma_id order by enrollment.turma_id),
    array[]::uuid[]
  )
  into v_class_ids
  from public.matriculas enrollment
  where enrollment.id = any(v_locked_enrollment_ids);

  select coalesce(
    array_agg(locked_class.id order by locked_class.id),
    array[]::uuid[]
  )
  into v_locked_class_ids
  from (
    select class.id
    from public.turmas class
    where class.id = any(v_class_ids)
    order by class.id
    for share
  ) locked_class;

  if v_locked_class_ids <> v_class_ids then
    raise exception 'Há turma inexistente na seleção do contrato.'
      using errcode = '42501';
  end if;

  select coalesce(
    array_agg(distinct class.curso_id order by class.curso_id),
    array[]::uuid[]
  )
  into v_course_ids
  from public.turmas class
  where class.id = any(v_locked_class_ids);

  select coalesce(
    array_agg(locked_course.id order by locked_course.id),
    array[]::uuid[]
  )
  into v_locked_course_ids
  from (
    select course.id
    from public.cursos course
    where course.id = any(v_course_ids)
    order by course.id
    for share
  ) locked_course;

  if v_locked_course_ids <> v_course_ids then
    raise exception 'Há curso inexistente na seleção do contrato.'
      using errcode = '42501';
  end if;

  -- Revalida somente depois que os três níveis acadêmicos estão travados.
  select count(*)
  into v_found_count
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  join public.cursos course on course.id = class.curso_id
  where enrollment.id = any(v_locked_enrollment_ids)
    and class.id = any(v_locked_class_ids)
    and course.id = any(v_locked_course_ids)
    and class.polo_id = p_polo_id
    and upper(coalesce(enrollment.status, '')) = 'ATIVO'
    and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'LIVRE', 'SUPERIOR');

  if v_found_count <> v_expected_count then
    raise exception 'Há matrícula sem vínculo ativo, fora do polo ou sem modalidade contratável.'
      using errcode = '42501';
  end if;

  -- Ordem determinística evita inversão de locks em lotes multimodalidade.
  for v_modalidade in
    select distinct upper(coalesce(course.modalidade, '')) as modalidade
    from public.matriculas enrollment
    join public.turmas class on class.id = enrollment.turma_id
    join public.cursos course on course.id = class.curso_id
    where enrollment.id = any(v_locked_enrollment_ids)
      and class.id = any(v_locked_class_ids)
      and course.id = any(v_locked_course_ids)
      and class.polo_id = p_polo_id
      and upper(coalesce(enrollment.status, '')) = 'ATIVO'
      and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'LIVRE', 'SUPERIOR')
    order by modalidade
  loop
    select model.*
    into v_model
    from public.documentos_modelos_configuracoes model
    where model.template_key = 'contrato_aluno'
      and model.modalidade = v_modalidade
    for share;

    if not found or v_model.status <> 'ATIVO' then
      raise exception 'O modelo de contrato da modalidade % ainda não está ativo para emissão.',
        v_modalidade using errcode = '55000';
    end if;

    -- O renderizador conserva compatibilidade visual, mas a emissão oficial
    -- falha fechada se a revisão aprovada não trouxer as quatro fontes do
    -- documento. Assim nenhum texto padrão paralelo substitui o modelo ativo.
    if jsonb_typeof(v_model.conteudo) <> 'object'
      or nullif(btrim(v_model.conteudo ->> 'tituloDocumento'), '') is null
      or nullif(btrim(v_model.conteudo ->> 'cabecalho'), '') is null
      or nullif(btrim(v_model.conteudo ->> 'corpo'), '') is null
      or nullif(btrim(v_model.conteudo ->> 'rodape'), '') is null
    then
      raise exception 'A revisão ativa do contrato da modalidade % está incompleta.',
        v_modalidade using errcode = '55000';
    end if;

    select approval.id
    into v_approval_id
    from public.documentos_modelos_aprovacoes approval
    where approval.template_key = 'contrato_aluno'
      and approval.modalidade = v_modalidade
      and approval.revisao = v_model.revisao
      and approval.termo_confirmacao = 'APROVADO_JURIDICAMENTE'
    for share;

    if not found then
      raise exception 'O modelo de contrato da modalidade % não possui aprovação da revisão %.',
        v_modalidade, v_model.revisao using errcode = '55000';
    end if;
  end loop;

  -- O emissor base está sem EXECUTE para todos os papéis clientes. Ele recebe
  -- os mesmos argumentos normalizados e, sob os locks acima, congela o modelo,
  -- o snapshot contratual e o documento já renderizado no ledger de validação.
  return public.preparar_emissao_contrato_aluno_base_secure(
    p_polo_id,
    v_mode,
    v_ids,
    v_message,
    p_idempotency_key
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.preservar_snapshot_contrato_aluno_emitido()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if old.documento = 'contrato_aluno'
    and coalesce(old.dados_emissao, '{}'::jsonb) ? 'templateSnapshot'
    and (
      new.dados_emissao -> 'templateKey'
        is distinct from old.dados_emissao -> 'templateKey'
      or new.dados_emissao -> 'templateRevision'
        is distinct from old.dados_emissao -> 'templateRevision'
      or new.dados_emissao -> 'templateSnapshot'
        is distinct from old.dados_emissao -> 'templateSnapshot'
      or new.dados_emissao -> 'contractSnapshot'
        is distinct from old.dados_emissao -> 'contractSnapshot'
      or new.dados_emissao -> 'renderedDocument'
        is distinct from old.dados_emissao -> 'renderedDocument'
    )
  then
    raise exception 'O snapshot de um contrato já emitido é imutável.'
      using errcode = '55000';
  end if;

  return new;
end;
$function$;

create trigger preserve_contract_snapshot before update on public.documentos_validacao
for each row execute function public.preservar_snapshot_contrato_aluno_emitido();
