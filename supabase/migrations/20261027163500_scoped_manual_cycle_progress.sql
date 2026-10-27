begin;
set local lock_timeout='5s';

do $drift$ begin
  if md5(pg_get_functiondef('internal_academic.manual_cycle_issuance_progress(uuid,integer)'::regprocedure))
    <> 'f2d2f8344ebd99e4b616a70612bf8849' then raise exception 'Progresso canônico mudou; revisar extração.'; end if;
end $drift$;

CREATE FUNCTION internal_academic.manual_cycle_issuance_snapshot(p_matricula_id uuid, p_ciclo_numero integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
declare
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_polo_id uuid;
  v_aluno_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_waived numeric := 0;
  v_emitted integer := 0;
  v_review integer := 0;
  v_complete boolean;
  v_paid_issued boolean;
  v_is_local boolean;
  v_local integer:=0;
  v_banking integer;
  v_item_state text;
  v_cycle_status text;
begin
  if p_matricula_id is null or p_ciclo_numero is null
    or p_ciclo_numero not in (1, 2) then
    raise exception 'Matrícula ou ciclo inválido para retomada.'
      using errcode = '22023';
  end if;
  select run.* into strict v_run
  from internal_academic.technical_manual_cycle_runs run
  where run.matricula_id = p_matricula_id
    and run.cycle_number = p_ciclo_numero
    and run.state = 'LOCAL_CREATED';
  select class.polo_id, enrollment.aluno_id into strict v_polo_id, v_aluno_id
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  where enrollment.id = v_run.matricula_id
    and enrollment.turma_id = v_run.turma_id;

  for v_receivable in
    select receivable.* from public.contas_receber receivable
    where receivable.id = any(v_run.receivable_ids)
    order by receivable.data_vencimento, receivable.id
  loop
    v_count := v_count + 1;
    v_is_local:=internal_academic.manual_cycle_has_local_intent(v_receivable);
    if v_is_local then
      if internal_financial_correction.local_waiver_complete(v_receivable) then v_waived:=v_waived+v_receivable.valor; end if;
      if not internal_academic.manual_cycle_local_receivable_complete(v_receivable) then
        raise exception 'Matrícula local do ciclo possui estado divergente; revise a cobrança.' using errcode='23514';
      end if;
      v_local:=v_local+1;
      v_complete:=false;
      v_paid_issued:=false;
      v_item_state:='NAO_APLICAVEL';
    else
    v_complete :=
      internal_academic.technical_manual_banese_receivable_complete(v_receivable);
    v_paid_issued:=
      internal_academic.technical_manual_banese_receivable_paid_issued(v_receivable);
    if v_complete or v_paid_issued then
      v_item_state := 'EMITIDO';
      v_emitted := v_emitted + 1;
    elsif v_receivable.gateway_submission_status = 'API_REVIEW' then
      v_item_state := 'REVISAO_MANUAL'; v_review := v_review + 1;
    elsif v_receivable.gateway_submission_status is not null
      or v_receivable.gateway_creation_token is not null
      or coalesce(v_receivable.gateway_payment_id,
        v_receivable.gateway_boleto_nosso_numero) is not null
      or v_receivable.gateway_boleto_issued_at is not null
      or v_receivable.gateway_boleto_linha_digitavel is not null
      or v_receivable.gateway_boleto_codigo_barras is not null
      or v_receivable.gateway_pix_payload is not null
      or v_receivable.gateway_pix_encoded_image is not null
      or exists (select 1 from public.payment_gateway_transactions transaction
        where transaction.receivable_id = v_receivable.id)
    then
      v_item_state := 'REVISAO';
    else
      v_item_state := 'PENDENTE';
    end if;
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_receivable.id, 'chave', v_receivable.origem_cronograma_id,
      'tipo', v_receivable.tipo_lancamento,
      'numero', v_receivable.parcela_numero,
      'descricao', v_receivable.descricao,
      'valor', pg_catalog.to_char(v_receivable.valor, 'FM999999990.00'),
      'vencimento', pg_catalog.to_char(
        v_receivable.data_vencimento, 'YYYY-MM-DD'
      ), 'status', upper(v_receivable.status),
      'emissaoBanese', v_item_state,
      'emissaoHistoricaComprovada', v_paid_issued,
      'destinoCobranca', case when v_is_local then 'LOCAL' else 'BANESE' end,
      'localSemBoletoComprovado', v_is_local,
      'localFeeWaiverProven', internal_financial_correction.local_waiver_complete(v_receivable)
    ));
  end loop;
  if v_count <> v_run.item_count or v_count <> cardinality(v_run.receivable_ids)
  then
    raise exception 'Run do ciclo perdeu sua cardinalidade canônica.'
      using errcode = '23514';
  end if;
  v_banking:=v_run.item_count-v_local;
  v_cycle_status := case
    when v_emitted = v_banking and v_review = 0 then 'EMITIDO_BANESE'
    when v_review > 0 then 'EMISSAO_EM_REVISAO'
    when v_emitted > 0 then 'EMISSAO_PARCIAL'
    else 'PRONTO_PARA_EMISSAO_BANESE'
  end;
  return jsonb_build_object(
    'requestId', v_run.request_id, 'replayed', true,
    'matriculaId', v_run.matricula_id, 'turmaId', v_run.turma_id,
    'poloId', v_polo_id, 'alunoId', v_aluno_id,
    'regraFingerprint', v_run.rule_fingerprint,
    'politicaFingerprint', v_run.policy_fingerprint,
    'cronogramaFingerprint', v_run.schedule_fingerprint,
    'primeiroVencimento', v_run.first_due_date,
    'ciclo', jsonb_build_object(
      'numero', v_run.cycle_number, 'status', v_cycle_status,
      'quantidadeItens', v_run.item_count,
      'quantidadeBancaria', v_banking, 'quantidadeLocal', v_local,
      'modoMatricula', case when v_local=1 then 'REGISTRO_SEM_BOLETO'
        when v_run.cycle_number=1 and v_run.item_count=12 then 'OMITIR' else 'BOLETO' end,
      'total', pg_catalog.to_char(v_run.total_amount, 'FM999999990.00'),
      'activeTotal', pg_catalog.to_char(v_run.total_amount-v_waived, 'FM999999990.00'),
      'emitidosBanese', v_emitted,
      'pendentesEmissao', greatest(v_banking - v_emitted - v_review, 0),
      'emRevisao', v_review, 'recebiveis', v_items
    )
  );
end;
$function$
;

create or replace function internal_academic.manual_cycle_issuance_progress(p_matricula_id uuid,p_ciclo_numero integer)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $function$
begin
  return internal_academic.manual_cycle_issuance_snapshot(p_matricula_id,p_ciclo_numero)
    || jsonb_build_object('cicloManual',internal_academic.technical_manual_cycle_state(p_matricula_id));
end;
$function$;

create function public.obter_progresso_ciclo_financeiro_tecnico_manual_secure(
  p_matricula_id uuid,p_ciclo_numero integer
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_turma uuid; v_polo uuid; v_snapshot jsonb; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.' using errcode='42501'; end if;
  if p_matricula_id is null or p_ciclo_numero is null or p_ciclo_numero not in (1,2) then
    raise exception 'Matrícula e ciclo inválidos.' using errcode='22023';
  end if;
  select m.turma_id,t.polo_id into v_turma,v_polo
    from public.matriculas m join public.turmas t on t.id=m.turma_id
    join public.cursos c on c.id=t.curso_id
    where m.id=p_matricula_id and upper(c.modalidade) in ('TECNICO','TÉCNICO');
  if not found or not coalesce(public.is_gestor_for_polo(v_polo)
    and public.can_operate_turma_academics(v_turma)
    and public.gestor_has_financeiro_tab('receber'),false) then
    raise exception 'Sem permissão para acompanhar esta emissão.' using errcode='42501';
  end if;
  v_result:=jsonb_build_object('versao',1,'matriculaId',p_matricula_id,'turmaId',v_turma,
    'cicloNumero',p_ciclo_numero,'observadoEm',clock_timestamp(),
    'encontrado',false,'requestId',null,'ciclo',null);
  if not exists(select 1 from internal_academic.technical_manual_cycle_runs r
    where r.matricula_id=p_matricula_id and r.cycle_number=p_ciclo_numero and r.state='LOCAL_CREATED') then
    return v_result;
  end if;
  v_snapshot:=internal_academic.manual_cycle_issuance_snapshot(p_matricula_id,p_ciclo_numero);
  return v_result||jsonb_build_object('encontrado',true,'requestId',v_snapshot->'requestId',
    'ciclo',v_snapshot->'ciclo');
end;
$function$;

revoke all on function internal_academic.manual_cycle_issuance_snapshot(uuid,integer)
  from public,anon,authenticated,service_role;
revoke all on function public.obter_progresso_ciclo_financeiro_tecnico_manual_secure(uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.obter_progresso_ciclo_financeiro_tecnico_manual_secure(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;

