-- Somente uma nova solicitação de Ficha resolve a foto atual. Retries usam a
-- referência do documento já confirmado; documentos anteriores não mudam.
begin;

create or replace function public.reemitir_fichas_validacao_lote_portal(
  p_documento text, p_matricula_ids uuid[], p_idempotency_key text,
  p_periodo_referencia text default null, p_emitido_por uuid default null
)
returns table (
  matricula_id uuid, ordem_solicitacao integer, codigo text, documento text,
  emitido_em timestamptz, ultima_emissao_em timestamptz, validade_ate timestamptz,
  status text, quantidade_emissoes integer, reutilizado boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_periodo text := nullif(btrim(coalesce(p_periodo_referencia, '')), '');
  v_lock record;
  v_request record;
  v_issue record;
  v_polo_id uuid;
  v_effective_issuer uuid;
  v_referencia text;
  v_photo text;
  v_base record;
  v_stored record;
  v_fingerprint text;
begin
  if p_documento not in ('pasta_identificacao', 'ficha_matricula') then
    raise exception 'A reemissão transacional em lote é exclusiva das fichas cadastrais.'
      using errcode = '22023';
  end if;

  if char_length(v_key) not between 16 and 90
    or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
  then
    raise exception 'A chave do lote deve ter 16 a 90 caracteres seguros.'
      using errcode = '22023';
  end if;

  if coalesce(cardinality(p_matricula_ids), 0) = 0 then
    raise exception 'Informe ao menos uma matrícula para reemissão.'
      using errcode = '22023';
  end if;

  if cardinality(p_matricula_ids) > 500 then
    raise exception 'O lote pode conter no máximo 500 matrículas.'
      using errcode = '22023';
  end if;

  if (
    select count(*) <> count(distinct requested_id)
    from unnest(p_matricula_ids) as requested(requested_id)
  ) or array_position(p_matricula_ids, null) is not null then
    raise exception 'O lote contém matrículas duplicadas ou inválidas.'
      using errcode = '22023';
  end if;

  -- A autorização de cada matrícula precede qualquer consulta ao ledger.
  -- Locks da identidade base têm ordem estável também entre chaves distintas.
  for v_lock in
    select requested_id
    from unnest(p_matricula_ids) as requested(requested_id)
    order by requested_id::text
  loop
    select class.polo_id into v_polo_id
    from public.matriculas as enrollment
    join public.turmas as class on class.id = enrollment.turma_id
    where enrollment.id = v_lock.requested_id
    for share of enrollment, class;

    if not found then
      raise exception 'Matrícula ou turma não encontrada.' using errcode = '22023';
    end if;
    if coalesce((select auth.role()), '') <> 'service_role'
      and not public.can_manage_secretaria_document(p_documento, v_polo_id)
    then
      raise exception 'Acesso à reemissão desta ficha não autorizado.'
        using errcode = '42501';
    end if;

    if p_documento = 'ficha_matricula' then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        concat_ws(':', 'ficha-photo', v_lock.requested_id::text,
          coalesce(v_periodo, '-')), 0
      ));
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'document-reissue:' || v_key || ':' || v_lock.requested_id::text, 0
    ));
  end loop;

  v_effective_issuer := internal_academic.resolve_responsavel(p_emitido_por);

  for v_request in
    select requested_id, request_order::integer
    from unnest(p_matricula_ids) with ordinality
      as requested(requested_id, request_order)
    order by request_order
  loop
    v_referencia := null;
    if p_documento = 'ficha_matricula' then
      select ledger.request_fingerprint, validation.codigo as canonical_code,
        validation.referencia_externa
      into v_stored
      from public.documentos_validacao_reemissoes_idempotencia as ledger
      left join public.documentos_validacao as validation
        on validation.codigo = ledger.codigo
      where ledger.idempotency_key = v_key || ':' || v_request.requested_id::text;

      if found then
        if v_stored.canonical_code is null then
          raise exception 'O documento da solicitação anterior não foi localizado.'
            using errcode = '55000';
        end if;
        v_referencia := v_stored.referencia_externa;
        v_fingerprint := encode(extensions.digest(convert_to(concat_ws(
          E'\n', p_documento, v_request.requested_id::text,
          coalesce(v_periodo, '-'), coalesce(v_referencia, '-'),
          coalesce(v_effective_issuer::text, '-')
        ), 'UTF8'), 'sha256'), 'hex');
        if v_stored.request_fingerprint <> v_fingerprint then
          raise exception 'A chave de idempotência já foi usada em outra solicitação.'
            using errcode = '22023';
        end if;
      else
        -- O bloqueio impede que uma troca de foto se intercale entre o hash e
        -- a captura do snapshot pelo emissor rico, inclusive em lotes.
        select student.foto_url into v_photo
        from public.matriculas as enrollment
        join public.parceiros as student on student.id = enrollment.aluno_id
        where enrollment.id = v_request.requested_id
        for share of student;
        if not found then
          raise exception 'Aluno da matrícula não encontrado.' using errcode = '22023';
        end if;

        select validation.status, validation.dados_emissao ->> 'studentPhotoUrl' as photo
        into v_base
        from public.documentos_validacao as validation
        where validation.identidade = concat_ws(':', p_documento,
          v_request.requested_id::text, coalesce(v_periodo, '-'), '-')
        for share;

        if found then
          if v_base.status = 'REVOGADO' then
            raise exception 'A ficha original foi revogada e não pode ser reemitida.'
              using errcode = '55000';
          end if;
          if internal_academic.ficha_student_photo_reference(v_base.photo)
            <> internal_academic.ficha_student_photo_reference(v_photo)
          then
            v_referencia := internal_academic.ficha_student_photo_reference(v_photo);
          end if;
        end if;
      end if;
    end if;

    select issued.* into v_issue
    from public.reemitir_documento_validacao_portal(
      p_documento, v_request.requested_id,
      v_key || ':' || v_request.requested_id::text,
      p_periodo_referencia, v_referencia, p_emitido_por
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

revoke all on function public.reemitir_fichas_validacao_lote_portal(
  text, uuid[], text, text, uuid
) from public, anon;
grant execute on function public.reemitir_fichas_validacao_lote_portal(
  text, uuid[], text, text, uuid
) to authenticated, service_role;

commit;
