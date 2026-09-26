-- A referência explícita alcança o emissor rico; replay e Histórico conservam
-- o mesmo código e snapshot gravados no ledger da solicitação.
begin;

CREATE OR REPLACE FUNCTION public.reemitir_documento_validacao_portal(p_documento text, p_matricula_id uuid, p_idempotency_key text, p_periodo_referencia text DEFAULT NULL::text, p_referencia_externa text DEFAULT NULL::text, p_emitido_por uuid DEFAULT NULL::uuid)
 RETURNS TABLE(codigo text, documento text, emitido_em timestamp with time zone, ultima_emissao_em timestamp with time zone, validade_ate timestamp with time zone, status text, quantidade_emissoes integer, reutilizado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_documento text := nullif(btrim(coalesce(p_documento, '')), '');
  v_periodo text := nullif(btrim(coalesce(p_periodo_referencia, '')), '');
  v_referencia text := nullif(btrim(coalesce(p_referencia_externa, '')), '');
  v_polo_id uuid;
  v_effective_issuer uuid;
  v_fingerprint text;
  v_policy public.documentos_validacao_politicas%rowtype;
  v_stored public.documentos_validacao_reemissoes_idempotencia%rowtype;
  v_issue record;
  v_has_stored boolean := false;
begin
  if char_length(v_key) not between 16 and 128
    or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
  then
    raise exception
      'A chave de idempotência deve ter 16 a 128 caracteres seguros.'
      using errcode = '22023';
  end if;

  select class.polo_id
  into v_polo_id
  from public.matriculas enrollment
  left join public.turmas class on class.id = enrollment.turma_id
  where enrollment.id = p_matricula_id;

  if not found then
    raise exception 'Matrícula não encontrada.'
      using errcode = '22023';
  end if;

  -- Reemissão é uma ação administrativa. A consulta do aluno permanece na
  -- RPC de emissão sem incremento e nunca passa por este endpoint.
  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.can_manage_secretaria_document(v_documento, v_polo_id)
  then
    raise exception 'Acesso à reemissão deste documento não autorizado.'
      using errcode = '42501';
  end if;

  v_effective_issuer :=
    internal_academic.resolve_responsavel(p_emitido_por);

  select policy.*
  into v_policy
  from public.documentos_validacao_politicas policy
  where policy.documento = v_documento
  for share;

  if not found then
    raise exception 'Tipo de documento não permitido: %', v_documento
      using errcode = '22023';
  end if;

  if v_policy.escopo_identidade = 'ANUAL'
    and v_documento = 'declaracao_irpf'
    and v_periodo is null
  then
    v_periodo := (extract(year from current_date)::integer - 1)::text;
  elsif v_policy.escopo_identidade = 'ANUAL' and v_periodo is null then
    v_periodo := extract(year from current_date)::integer::text;
  end if;

  if v_policy.escopo_identidade = 'PROCESSO' and v_referencia is null then
    raise exception 'Este documento exige uma referência de processo ou contrato.'
      using errcode = '22023';
  end if;

  v_fingerprint := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          E'\n',
          v_documento,
          p_matricula_id::text,
          coalesce(v_periodo, '-'),
          coalesce(v_referencia, '-'),
          coalesce(v_effective_issuer::text, '-')
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('document-reissue:' || v_key, 0)
  );

  select ledger.*
  into v_stored
  from public.documentos_validacao_reemissoes_idempotencia ledger
  where ledger.idempotency_key = v_key;
  v_has_stored := found;

  if v_has_stored then
    if v_stored.request_fingerprint <> v_fingerprint then
      raise exception
        'A chave de idempotência já foi usada em outra solicitação.'
        using errcode = '22023';
    end if;

    if v_stored.estado = 'CONFIRMADA' then
      -- Idempotência não pode ressuscitar um documento revogado depois da
      -- primeira resposta. O ledger preserva o resultado da operação, mas o
      -- estado de revogação do registro canônico sempre prevalece.
      if not exists (
        select 1
        from public.documentos_validacao validation
        where upper(btrim(validation.codigo)) =
          upper(btrim(v_stored.codigo))
          and validation.status <> 'REVOGADO'
      ) then
        raise exception
          'Documento revogado ou removido não pode ser reutilizado ou reemitido.'
          using errcode = '55000';
      end if;

      codigo := v_stored.codigo;
      documento := v_stored.documento;
      emitido_em := v_stored.emitido_em;
      ultima_emissao_em := v_stored.ultima_emissao_em;
      validade_ate := v_stored.validade_ate;
      status := v_stored.status;
      quantidade_emissoes := v_stored.quantidade_emissoes;
      reutilizado := v_stored.reutilizado;
      return next;
      return;
    end if;

    if v_stored.politica_versao is distinct from v_policy.versao then
      raise exception
        'A política documental mudou após a preparação. Prepare a segunda via novamente.'
        using errcode = '40001';
    end if;

    perform set_config(
      'app.document_reissue_at',
      v_stored.preparada_em::text,
      true
    );
  else
    -- Evita herdar a preparação de outro item quando a função é chamada
    -- repetidamente dentro de uma mesma transação em lote.
    perform set_config('app.document_reissue_at', '', true);
  end if;

  -- O primeiro certificado só pode nascer no finalizador acadêmico. Esta RPC
  -- aceita somente uma segunda via de certificado já existente.
  if v_documento like 'certificado\_%' escape '\'
    and not exists (
      select 1
      from public.documentos_validacao validation
      where validation.documento = v_documento
        and validation.matricula_id = p_matricula_id
    )
  then
    raise exception
      'A primeira emissão do certificado exige o fluxo acadêmico de finalização.'
      using errcode = '42501';
  end if;

  perform set_config('app.document_reissue_authorized', 'on', true);

  if v_documento = 'ficha_matricula' then
    select issued.*
    into v_issue
    from internal_academic.emitir_ficha_validacao_com_referencia(
      v_documento, p_matricula_id, v_periodo, v_effective_issuer,
      true, '{}'::jsonb, v_referencia
    ) as issued;
  elsif v_documento = 'pasta_identificacao' then
    select issued.*
    into v_issue
    from public.emitir_ficha_validacao_portal(
      v_documento,
      p_matricula_id,
      v_periodo,
      v_effective_issuer,
      true,
      '{}'::jsonb
    ) issued;
  else
    select issued.*
    into v_issue
    from public.emitir_documento_validacao_interno(
      v_documento,
      p_matricula_id,
      v_periodo,
      v_referencia,
      null,
      v_effective_issuer,
      true
    ) issued;
  end if;

  if v_issue.codigo is null then
    raise exception 'A reemissão não retornou um código de validação.'
      using errcode = '55000';
  end if;

  if v_has_stored then
    if v_issue.codigo is distinct from v_stored.codigo
      or v_issue.ultima_emissao_em is distinct from v_stored.ultima_emissao_em
      or v_issue.validade_ate is distinct from v_stored.validade_ate
      or v_issue.quantidade_emissoes is distinct from v_stored.quantidade_emissoes
    then
      raise exception
        'A matrícula ou turma mudou após a preparação. Prepare a segunda via novamente.'
        using errcode = '40001';
    end if;

    update public.documentos_validacao_reemissoes_idempotencia ledger
    set
      codigo = v_issue.codigo,
      documento = v_issue.documento,
      emitido_em = v_issue.emitido_em,
      ultima_emissao_em = v_issue.ultima_emissao_em,
      validade_ate = v_issue.validade_ate,
      status = v_issue.status,
      quantidade_emissoes = v_issue.quantidade_emissoes,
      reutilizado = v_issue.reutilizado,
      estado = 'CONFIRMADA',
      validacao_publica = v_policy.validacao_publica
    where ledger.idempotency_key = v_key;
  else
    insert into public.documentos_validacao_reemissoes_idempotencia (
      idempotency_key,
      request_fingerprint,
      matricula_id,
      codigo,
      documento,
      emitido_em,
      ultima_emissao_em,
      validade_ate,
      status,
      quantidade_emissoes,
      reutilizado,
      estado,
      politica_versao,
      validacao_publica
    )
    values (
      v_key,
      v_fingerprint,
      p_matricula_id,
      v_issue.codigo,
      v_issue.documento,
      v_issue.emitido_em,
      v_issue.ultima_emissao_em,
      v_issue.validade_ate,
      v_issue.status,
      v_issue.quantidade_emissoes,
      v_issue.reutilizado,
      'CONFIRMADA',
      v_policy.versao,
      v_policy.validacao_publica
    );
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

revoke all on function public.reemitir_documento_validacao_portal(
  text, uuid, text, text, text, uuid
) from public, anon;
grant execute on function public.reemitir_documento_validacao_portal(
  text, uuid, text, text, text, uuid
) to authenticated, service_role;

commit;
