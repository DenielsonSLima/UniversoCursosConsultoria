-- Canonical read-only function capture, 2026-10-27. Synthetic tests only.
-- READ-ONLY reference fetched 2026-10-27 11:51 UTC. Not a migration.
CREATE OR REPLACE FUNCTION public.gerar_ciclo_financeiro_tecnico_manual_secure(p_matricula_id uuid, p_ciclo_numero integer, p_primeiro_vencimento date, p_request_id uuid, p_expected_regra_fingerprint text, p_expected_politica_fingerprint text, p_expected_cronograma_fingerprint text, p_revisao jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_turma_id uuid;
  v_aluno_id uuid;
  v_modalidade text;
  v_payload_hash text;
  v_existing record;
  v_preview_envelope jsonb;
  v_preview jsonb;
  v_item jsonb;
  v_receivable public.contas_receber%rowtype;
  v_receivable_ids uuid[] := '{}'::uuid[];
  v_receivables jsonb := '[]'::jsonb;
  v_inserted integer := 0;
  v_value numeric;
  v_due date;
  v_type text;
  v_number integer;
  v_description text;
  v_key text;
  v_snapshot jsonb;
  v_stored_response jsonb;
begin
  if p_request_id is null
    or p_matricula_id is null
    or p_ciclo_numero is null
    or coalesce(p_expected_regra_fingerprint, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_expected_politica_fingerprint, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_expected_cronograma_fingerprint, '') !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Parâmetros de geração manual inválidos.' using errcode = '22023';
  end if;

  select enrollment.turma_id, enrollment.aluno_id, upper(coalesce(course.modalidade, ''))
  into v_turma_id, v_aluno_id, v_modalidade
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  join public.cursos course on course.id = class.curso_id
  where enrollment.id = p_matricula_id;
  if v_turma_id is null or v_modalidade not in ('TECNICO', 'TÉCNICO') then
    raise exception 'Matrícula técnica não encontrada.' using errcode = '22023';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role' and not coalesce(
    public.can_operate_turma_academics(v_turma_id)
    and public.gestor_has_tab('gestao', 'financeiro'), false
  ) then
    raise exception 'Sem permissão financeira nesta turma.' using errcode = '42501';
  end if;

  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    (jsonb_build_object(
      'matriculaId', p_matricula_id,
      'cicloNumero', p_ciclo_numero,
      'primeiroVencimento', p_primeiro_vencimento,
      'regraFingerprint', p_expected_regra_fingerprint,
      'politicaFingerprint', p_expected_politica_fingerprint,
      'cronogramaFingerprint', p_expected_cronograma_fingerprint
    ) || case when p_revisao is null then '{}'::jsonb
      else jsonb_build_object('revisao', p_revisao) end)::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'technical-finance-request:' || p_request_id::text, 0
  ));
  select request.operation, request.actor_id, request.payload_hash,
    request.response
  into v_existing
  from internal_academic.technical_financial_requests request
  where request.request_id = p_request_id;
  if found then
    if v_existing.operation <> 'GERACAO_CICLO_TECNICO_MANUAL'
      or v_existing.actor_id is distinct from auth.uid()
      or v_existing.payload_hash <> v_payload_hash
    then
      raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023';
    end if;
    return jsonb_set(v_existing.response, '{replayed}', 'true'::jsonb, true)
      || jsonb_build_object(
        'cicloManual', internal_academic.technical_manual_cycle_state(p_matricula_id),
        'workspace', public.obter_financeiro_matricula_tecnica_workspace_secure(
          v_turma_id, null
        )
      );
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'technical-manual-cycle-person:' || v_aluno_id::text, 0
  ));
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'technical-manual-cycle-enrollment:' || p_matricula_id::text, 0
  ));
  perform 1 from public.turmas class where class.id = v_turma_id for update;
  perform 1 from public.matriculas enrollment
    where enrollment.id = p_matricula_id for update;
  perform 1 from public.matriculas_tecnicas_financeiro_config config
    where config.matricula_id = p_matricula_id for update;
  perform 1
  from public.contas_receber receivable
  where receivable.matricula_id = p_matricula_id
  order by receivable.id
  for update;

  v_preview_envelope := internal_academic.technical_manual_cycle_reviewed_preview(
    p_matricula_id, p_ciclo_numero, p_primeiro_vencimento, p_revisao
  );
  v_preview := v_preview_envelope -> 'preview';
  if v_preview ->> 'regraEfetivaFingerprint'
      <> p_expected_regra_fingerprint
    or v_preview ->> 'politicaFingerprint'
      <> p_expected_politica_fingerprint
    or v_preview ->> 'cronogramaFingerprint'
      <> p_expected_cronograma_fingerprint
  then
    raise exception 'A configuração ou o cronograma mudou. Gere nova prévia.'
      using errcode = '40001';
  end if;

  if exists (select 1 from jsonb_array_elements(v_preview -> 'itens') i
    where (i ->> 'valor')::numeric <= 0) then
    raise exception 'Revise o valor de cada boleto antes de emitir.' using errcode = '22023';
  end if;

  insert into internal_academic.technical_manual_cycle_runs(
    matricula_id, turma_id, cycle_number, state, request_id,
    rule_fingerprint, policy_fingerprint, schedule_fingerprint,
    first_due_date, item_count, expected_installment_count,
    total_amount, created_by, reviewed_items
  ) values (
    p_matricula_id, v_turma_id, p_ciclo_numero, 'GENERATING', p_request_id,
    p_expected_regra_fingerprint, p_expected_politica_fingerprint,
    p_expected_cronograma_fingerprint,
    (v_preview ->> 'primeiroVencimento')::date,
    (v_preview ->> 'quantidadeItens')::integer,
    (
      select count(*)::integer
      from jsonb_array_elements(v_preview -> 'itens') preview_item
      where preview_item ->> 'tipo' = 'PARCELA'
    ),
    (v_preview ->> 'total')::numeric,
    auth.uid(), v_preview -> 'itens'
  );

  perform set_config(
    'app.technical_manual_cycle_request_id', p_request_id::text, true
  );

  for v_item in select item from jsonb_array_elements(v_preview -> 'itens') item
  loop
    v_type := v_item ->> 'tipo';
    v_number := (v_item ->> 'numero')::integer;
    v_description := v_item ->> 'descricao';
    v_value := (v_item ->> 'valor')::numeric;
    v_due := (v_item ->> 'vencimento')::date;
    v_key := v_item ->> 'chave';
    v_snapshot := internal_academic.manual_cycle_reviewed_snapshot(
      p_matricula_id, v_item
    ) || jsonb_build_object('cicloManual', jsonb_build_object(
      'cicloNumero', p_ciclo_numero,
      'requestId', p_request_id,
      'regraFingerprint', p_expected_regra_fingerprint,
      'politicaFingerprint', p_expected_politica_fingerprint,
      'cronogramaFingerprint', p_expected_cronograma_fingerprint
    ));

    insert into public.contas_receber(
      polo_id, descricao, valor, data_vencimento, status, categoria,
      cliente_id, matricula_id, turma_id, tipo_lancamento,
      parcela_numero, origem_cronograma_id,
      regra_financeira_tecnica_snapshot
    )
    select
      class.polo_id, v_description, v_value, v_due, 'PENDENTE',
      'MENSALIDADE', enrollment.aluno_id, enrollment.id,
      enrollment.turma_id, v_type, v_number, v_key, v_snapshot
    from public.matriculas enrollment
    join public.turmas class on class.id = enrollment.turma_id
    where enrollment.id = p_matricula_id
    returning * into v_receivable;

    v_inserted := v_inserted + 1;
    v_receivable_ids := array_append(v_receivable_ids, v_receivable.id);
    v_receivables := v_receivables || jsonb_build_array(jsonb_build_object(
      'id', v_receivable.id,
      'chave', v_receivable.origem_cronograma_id,
      'tipo', v_receivable.tipo_lancamento,
      'numero', v_receivable.parcela_numero,
      'descricao', v_receivable.descricao,
      'valor', pg_catalog.to_char(v_receivable.valor, 'FM999999990.00'),
      'vencimento', pg_catalog.to_char(v_receivable.data_vencimento, 'YYYY-MM-DD'),
      'status', v_receivable.status,
      'destinoCobranca', coalesce(v_item->>'destinoCobranca','BANESE'),
      'localSemBoletoComprovado', v_item->>'destinoCobranca'='LOCAL',
      'emissaoBanese', case when v_item->>'destinoCobranca'='LOCAL' then 'NAO_APLICAVEL' else 'NAO_EMITIDO' end
    ));
  end loop;

  if v_inserted <> (v_preview ->> 'quantidadeItens')::integer then
    raise exception 'O ciclo não foi criado integralmente.' using errcode = 'P0001';
  end if;

  update internal_academic.technical_manual_cycle_runs run
  set state = 'LOCAL_CREATED', receivable_ids = v_receivable_ids,
      completed_at = pg_catalog.clock_timestamp()
  where run.matricula_id = p_matricula_id
    and run.cycle_number = p_ciclo_numero
    and run.request_id = p_request_id
    and run.state = 'GENERATING';
  if not found then
    raise exception 'Fence do ciclo manual mudou durante a geração.' using errcode = '40001';
  end if;

  perform public.registrar_turma_financeiro_auditoria(
    p_matricula_id,
    'CICLO_TECNICO_MANUAL_CRIADO_LOCAL',
    jsonb_build_object(
      'cicloNumero', p_ciclo_numero,
      'quantidadeItens', v_inserted,
      'total', v_preview ->> 'total',
      'matriculaSemBoleto', v_preview -> 'matriculaSemBoleto',
      'revisao', p_revisao,
      'regraFingerprint', p_expected_regra_fingerprint,
      'politicaFingerprint', p_expected_politica_fingerprint,
      'cronogramaFingerprint', p_expected_cronograma_fingerprint,
      'requestId', p_request_id
    ),
    'Recebíveis locais criados por ação explícita; nenhuma emissão bancária foi executada.'
  );

  v_stored_response := jsonb_build_object(
    'operacao', 'GERACAO_CICLO_TECNICO_MANUAL',
    'requestId', p_request_id,
    'replayed', false,
    'ciclo', jsonb_build_object(
      'numero', p_ciclo_numero,
      'status', 'CRIADO_LOCAL',
      'quantidadeItens', v_inserted,
      'modoMatricula', v_preview->>'modoMatricula',
      'quantidadeBancaria', v_preview->'quantidadeBancaria',
      'quantidadeLocal', v_preview->'quantidadeLocal',
      'total', v_preview ->> 'total',
      'matriculaSemBoleto', v_preview -> 'matriculaSemBoleto',
      'recebiveis', v_receivables
    )
  );
  insert into internal_academic.technical_financial_requests(
    request_id, operation, actor_id, payload_hash, response
  ) values (
    p_request_id, 'GERACAO_CICLO_TECNICO_MANUAL', auth.uid(),
    v_payload_hash, v_stored_response
  );

  return v_stored_response || jsonb_build_object(
    'cicloManual', internal_academic.technical_manual_cycle_state(p_matricula_id),
    'workspace', public.obter_financeiro_matricula_tecnica_workspace_secure(
      v_turma_id, null
    )
  );
end;
$function$;

-- READ-ONLY reference fetched 2026-10-27 11:51 UTC. Not a migration.
CREATE OR REPLACE FUNCTION public.gerar_ciclo_financeiro_tecnico_manual_secure(p_matricula_id uuid, p_ciclo_numero integer, p_primeiro_vencimento date, p_request_id uuid, p_expected_regra_fingerprint text, p_expected_politica_fingerprint text, p_expected_cronograma_fingerprint text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.gerar_ciclo_financeiro_tecnico_manual_secure(
    p_matricula_id, p_ciclo_numero, p_primeiro_vencimento, p_request_id,
    p_expected_regra_fingerprint, p_expected_politica_fingerprint,
    p_expected_cronograma_fingerprint, null);
$function$;

-- READ-ONLY reference fetched 2026-10-27 11:51 UTC. Not a migration.
CREATE OR REPLACE FUNCTION public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure(p_matricula_id uuid, p_ciclo_numero integer, p_primeiro_vencimento date, p_request_id uuid, p_expected_regra_fingerprint text, p_expected_politica_fingerprint text, p_expected_cronograma_fingerprint text, p_revisao jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb; v_item jsonb; v_receivable public.contas_receber%rowtype;
  v_banking integer:=0; v_local integer:=0;
begin
  v_result:=public.gerar_ciclo_financeiro_tecnico_manual_secure(
    p_matricula_id,p_ciclo_numero,p_primeiro_vencimento,p_request_id,
    p_expected_regra_fingerprint,p_expected_politica_fingerprint,p_expected_cronograma_fingerprint,p_revisao);
  for v_item in select value from jsonb_array_elements(v_result#>'{ciclo,recebiveis}') loop
    select * into strict v_receivable from public.contas_receber
      where id=(v_item->>'id')::uuid and matricula_id=p_matricula_id for update;
    if internal_academic.manual_cycle_has_local_intent(v_receivable) then
      if not internal_academic.manual_cycle_local_receivable_complete(v_receivable) then
        raise exception 'Matrícula local do ciclo possui estado divergente; revise a cobrança.' using errcode='23514';
      end if;
      v_local:=v_local+1;
      continue;
    end if;
    if v_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL' then
      raise exception 'Intenção local da matrícula não foi comprovada.' using errcode='23514';
    end if;
    update public.contas_receber receivable
    set forma_pagamento='BOLETO',gateway_payment_method='BOLETO',
      updated_at=case when receivable.forma_pagamento is distinct from 'BOLETO'
        or receivable.gateway_payment_method is distinct from 'BOLETO'
        then clock_timestamp() else receivable.updated_at end
    where receivable.id=v_receivable.id
      and upper(coalesce(receivable.status,'')) in ('PENDENTE','VENCIDO')
      and coalesce(receivable.forma_pagamento,'BOLETO')='BOLETO'
      and coalesce(receivable.gateway_payment_method,'BOLETO')='BOLETO'
      and receivable.gateway_payment_id is null and receivable.gateway_payment_link_id is null
      and receivable.gateway_submission_status is null;
    if not found and not coalesce((
      internal_academic.technical_manual_banese_receivable_complete(v_receivable)
      or internal_academic.technical_manual_banese_receivable_paid_issued(v_receivable)
      or (v_receivable.forma_pagamento='BOLETO' and v_receivable.gateway_payment_method='BOLETO'
        and v_receivable.gateway_provider='banese_card' and v_receivable.gateway_environment='production'
        and v_receivable.gateway_submission_status='API_REGISTERED')
    ),false) then
      raise exception 'Recebível do ciclo não pode ser preparado para BolePix.' using errcode='40001';
    end if;
    v_banking:=v_banking+1;
  end loop;
  if v_banking+v_local<>(v_result#>>'{ciclo,quantidadeItens}')::integer then
    raise exception 'A preparação não cobriu os recebíveis do ciclo.' using errcode='23514';
  end if;
  perform public.registrar_turma_financeiro_auditoria(p_matricula_id,
    'CICLO_TECNICO_MANUAL_PREPARADO_BANESE',jsonb_build_object(
      'cicloNumero',p_ciclo_numero,'quantidadeItens',v_banking+v_local,
      'quantidadeBancaria',v_banking,'quantidadeLocal',v_local,'requestId',p_request_id,
      'metodo','BOLETO','ambienteExigido','production'),
    'Apenas os itens destinados ao Banese foram preparados para emissão.');
  return v_result||internal_academic.manual_cycle_issuance_progress(p_matricula_id,p_ciclo_numero)
    ||jsonb_build_object('replayed',v_result->'replayed');
end;
$function$;

CREATE OR REPLACE FUNCTION public.preview_ciclo_financeiro_tecnico_manual_secure(p_matricula_id uuid, p_ciclo_numero integer, p_primeiro_vencimento date, p_revisao jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_turma_id uuid;
begin
  select turma_id into v_turma_id from public.matriculas where id = p_matricula_id;
  if v_turma_id is null then
    raise exception 'Matrícula não encontrada.' using errcode = '22023';
  end if;
  if coalesce((select auth.role()), '') <> 'service_role' and not coalesce(
    public.can_operate_turma_academics(v_turma_id)
    and public.gestor_has_tab('gestao', 'financeiro'), false
  ) then
    raise exception 'Sem permissão financeira nesta turma.' using errcode = '42501';
  end if;
  return internal_academic.technical_manual_cycle_reviewed_preview(
    p_matricula_id, p_ciclo_numero, p_primeiro_vencimento, p_revisao);
end;
$function$;

