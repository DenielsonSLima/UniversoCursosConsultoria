-- Preserva autorização, idempotência e configuração financeira do ingresso.
begin;

CREATE OR REPLACE FUNCTION public.pre_vincular_aluno_tecnico_secure(p_turma_id uuid, p_aluno_id uuid, p_request_id uuid, p_primeiro_vencimento date DEFAULT NULL::date, p_expected_regra_revisao integer DEFAULT NULL::integer, p_expected_regra_fingerprint text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rule jsonb;
  v_turma public.turmas%rowtype;
  v_matricula public.matriculas%rowtype;
  v_existing record;
  v_payload_hash text;
  v_response jsonb;
  v_today date := (pg_catalog.timezone('America/Maceio', now()))::date;
  v_due date;
  v_public_rule jsonb;
  v_admission_id uuid:=gen_random_uuid();
begin
  if p_request_id is null then
    raise exception 'requestId é obrigatório.' using errcode = '22023';
  end if;
  perform set_config('app.technical_financial_request_id', p_request_id::text, true);
  perform set_config('app.technical_financial_origin', 'MUTATION', true);
  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.can_operate_turma_academics(p_turma_id)
    and public.gestor_has_tab('gestao', 'alunos')
  ) then
    raise exception 'Sem permissão para vincular aluno nesta turma.' using errcode = '42501';
  end if;
  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'turmaId', p_turma_id, 'alunoId', p_aluno_id,
      'primeiroVencimento', p_primeiro_vencimento,
      'regraRevisao', p_expected_regra_revisao,
      'regraFingerprint', p_expected_regra_fingerprint
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('technical-finance-request:' || p_request_id::text, 0));
  select request.operation, request.actor_id, request.payload_hash, request.response
  into v_existing
  from internal_academic.technical_financial_requests request
  where request.request_id = p_request_id;
  if found then
    if v_existing.operation <> 'PRE_VINCULO'
      or v_existing.actor_id is distinct from auth.uid()
      or v_existing.payload_hash <> v_payload_hash
    then
      raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023';
    end if;
    return jsonb_set(v_existing.response, '{replayed}', 'true'::jsonb, true);
  end if;

  select class.* into v_turma from public.turmas class where class.id = p_turma_id for update;
  if not found then raise exception 'Turma não encontrada.' using errcode = '22023'; end if;
  v_rule := internal_academic.assert_expected_technical_rule(
    p_turma_id, p_expected_regra_revisao, p_expected_regra_fingerprint
  );
  v_public_rule := jsonb_build_object(
    'revisao', (v_rule->>'revisao')::integer,
    'fingerprint', v_rule->>'fingerprint',
    'primeiroVencimentoSugerido', v_rule->>'primeiroVencimentoSugerido'
  );
  if p_primeiro_vencimento is not null and p_primeiro_vencimento < v_today then
    raise exception 'O primeiro vencimento não pode estar no passado.' using errcode = '22023';
  end if;
  v_due := internal_academic.normalize_technical_first_due(
    coalesce(p_primeiro_vencimento, (v_rule->>'primeiroVencimentoSugerido')::date),
    v_today
  );

  if not exists (
    select 1 from public.parceiros student
    where student.id = p_aluno_id and student.tipo = 'Aluno'
  ) then raise exception 'Aluno não encontrado.' using errcode = '22023'; end if;
  perform internal_academic.authorize_enrollment_upsert(p_aluno_id, p_turma_id, 'PENDENTE');
  perform public.assert_aluno_sem_matricula_curso_duplicada(p_aluno_id, v_turma.curso_id, p_turma_id);
  perform 1
  from public.matriculas enrollment
  where enrollment.aluno_id = p_aluno_id and enrollment.turma_id = p_turma_id
  for update;
  if found then
    raise exception 'Aluno já vinculado. Alterações posteriores pertencem ao módulo Financeiro.'
      using errcode = '22023';
  end if;
  perform internal_academic.authorize_regular_technical_admission(
    v_admission_id,p_aluno_id,p_turma_id,'PENDENTE');
  insert into public.matriculas (
    id, aluno_id, turma_id, status,
    valor_matricula_individual, valor_rematricula_individual,
    valor_parcela_individual, dia_vencimento_individual,
    data_primeiro_vencimento_financeiro, financeiro_herdado,
    gerar_cobranca_inicial, gerar_cobranca_futura, sincronizar_asaas,
    desconto_pontualidade_individual, juros_atraso_individual,
    multa_atraso_individual, multa_atraso_percentual_individual,
    fluxo_operacional
  ) values (
    v_admission_id, p_aluno_id, p_turma_id, 'PENDENTE',
    v_turma.valor_matricula, v_turma.valor_rematricula,
    v_turma.valor_parcela, v_turma.dia_vencimento_padrao,
    v_due, false, false, false, false,
    v_turma.desconto_pontualidade, v_turma.juros_atraso,
    v_turma.multa_atraso, v_turma.multa_atraso_percentual,
    'REGULAR'
  )
  returning * into v_matricula;

  insert into public.matriculas_tecnicas_financeiro_config (
    matricula_id, turma_id, aluno_id, status_financeiro,
    primeiro_vencimento, ativar_em, regra_revisao, regra_fingerprint,
    titulo_matricula_id, last_error
  ) values (
    v_matricula.id, p_turma_id, p_aluno_id, 'PENDENTE',
    v_due, null, (v_rule->>'revisao')::integer, v_rule->>'fingerprint', null, null
  );

  perform internal_academic.activate_started_technical_enrollment(v_matricula.id, false);
  select * into v_matricula from public.matriculas where id = v_matricula.id;

  perform public.sync_aluno_polo_scope(v_matricula.aluno_id, v_turma.polo_id);
  perform public.registrar_turma_financeiro_auditoria(
    v_matricula.id, 'MATRICULA_TECNICA_PRE_VINCULO', v_rule,
    'Aluno vinculado sem criar título ou cobrança externa.'
  );
  insert into public.matricula_movimentacoes (
    matricula_id, aluno_id, tipo, status_anterior, status_novo,
    turma_destino_id, motivo, responsavel_id
  ) values (
    v_matricula.id, v_matricula.aluno_id, 'MATRICULA', null,
    v_matricula.status, v_matricula.turma_id,
    'Matrícula técnica registrada sem geração de cobrança.', null
  ) on conflict do nothing;
  v_response := jsonb_build_object(
    'operacao', 'PRE_VINCULO', 'requestId', p_request_id,
    'replayed', false,
    'matricula', internal_academic.technical_financial_row(v_matricula.id),
    'regraAplicada', v_public_rule, 'cobrancaGerada', false
  );
  insert into internal_academic.technical_financial_requests(
    request_id, operation, actor_id, payload_hash, response
  ) values (p_request_id, 'PRE_VINCULO', auth.uid(), v_payload_hash, v_response);
  return v_response;
end;
$function$
;

commit;
