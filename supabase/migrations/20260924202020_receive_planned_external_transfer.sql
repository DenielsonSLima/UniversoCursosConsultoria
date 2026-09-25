-- Atomic admission + academic credits + financial intent; no receivable creation.
begin;
create function public.receber_transferencia_tecnica_planejada_secure(
  p_request_id uuid,p_aluno_id uuid,p_turma_destino_id uuid,
  p_instituicao_origem text,p_curso_origem text,p_motivo text,p_observacao text,
  p_data_transferencia date,p_aproveitamentos jsonb,p_financeiro jsonb,
  p_expected_regra_fingerprint text
)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $function$
declare
  v_payload_hash text; v_existing record; v_preview jsonb; v_plan jsonb;
  v_enrollment uuid:=gen_random_uuid(); v_transfer uuid; v_course uuid; v_credits jsonb; v_responsavel uuid;
  v_response jsonb; v_today date:=timezone('America/Maceio',now())::date;
begin
  -- Authorization precedes any request lookup or historical response.
  perform internal_academic.assert_transfer_entry_access(p_aluno_id,p_turma_destino_id);
  if p_request_id is null then raise exception 'requestId obrigatório.' using errcode='22023'; end if;
  v_payload_hash:=encode(extensions.digest(jsonb_build_object(
    'alunoId',p_aluno_id,'turmaId',p_turma_destino_id,'instituicao',p_instituicao_origem,
    'curso',p_curso_origem,'motivo',p_motivo,'observacao',p_observacao,
    'dataTransferencia',p_data_transferencia,'aproveitamentos',p_aproveitamentos,
    'financeiro',p_financeiro,'regraFingerprint',p_expected_regra_fingerprint)::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('technical-finance-request:'||p_request_id::text,0));
  select * into v_existing from internal_academic.technical_financial_requests where request_id=p_request_id;
  if found then
    if v_existing.operation<>'RECEBER_TRANSFERENCIA_PLANEJADA'
      or v_existing.actor_id is distinct from auth.uid() or v_existing.payload_hash<>v_payload_hash then
      raise exception 'requestId já utilizado com outra intenção.' using errcode='22023';
    end if;
    return v_existing.response||jsonb_build_object('replayed',true);
  end if;
  if nullif(btrim(p_instituicao_origem),'') is null or nullif(btrim(p_motivo),'') is null
    or p_data_transferencia is null or p_data_transferencia>v_today
    or p_financeiro is null or jsonb_typeof(p_aproveitamentos) is distinct from 'array'
    or jsonb_array_length(p_aproveitamentos)>100
    or coalesce(p_expected_regra_fingerprint,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'Revise os dados acadêmicos e o plano financeiro da entrada.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('technical-manual-cycle-person:'||p_aluno_id::text,0));
  select curso_id into strict v_course from public.turmas where id=p_turma_destino_id for update;
  perform 1 from public.parceiros where id=p_aluno_id for update;
  v_preview:=public.preview_recebimento_transferencia_tecnica_secure(p_aluno_id,p_turma_destino_id,p_financeiro);
  if v_preview->>'regraFingerprint' is distinct from p_expected_regra_fingerprint then
    raise exception 'A regra da turma mudou. Revise novamente a entrada.' using errcode='40001';
  end if;
  v_plan:=v_preview->'financeiro';
  v_responsavel:=internal_academic.resolve_responsavel(null);
  if exists(select 1 from public.matriculas where aluno_id=p_aluno_id and turma_id=p_turma_destino_id) then
    raise exception 'Aluno já vinculado ao destino. Use o fluxo de continuidade da matrícula existente.' using errcode='23514';
  end if;
  perform public.assert_aluno_sem_matricula_curso_duplicada(p_aluno_id,v_course,p_turma_destino_id);
  perform internal_academic.authorize_enrollment_upsert(p_aluno_id,p_turma_destino_id,'ATIVO');
  perform internal_academic.authorize_regular_technical_admission(v_enrollment,p_aluno_id,p_turma_destino_id,'ATIVO');
  insert into public.matriculas(id,aluno_id,turma_id,status,data_matricula,
    fluxo_operacional,financeiro_herdado,gerar_cobranca_inicial,gerar_cobranca_futura,
    sincronizar_asaas,data_primeiro_vencimento_financeiro)
  values(v_enrollment,p_aluno_id,p_turma_destino_id,'ATIVO',p_data_transferencia::timestamptz,
    'REGULAR',false,false,false,false,(v_plan->>'primeiroVencimento')::date);
  insert into public.transferencias_academicas(aluno_id,matricula_destino_id,tipo,turma_destino_id,
    instituicao_origem,curso_origem,motivo,observacao,data_transferencia,responsavel_id)
  values(p_aluno_id,v_enrollment,'EXTERNA_RECEBIDA',p_turma_destino_id,btrim(p_instituicao_origem),
    nullif(btrim(p_curso_origem),''),btrim(p_motivo),nullif(btrim(p_observacao),''),p_data_transferencia,v_responsavel)
  returning id into v_transfer;
  insert into public.matricula_movimentacoes(matricula_id,aluno_id,tipo,status_anterior,status_novo,
    turma_destino_id,motivo,observacao,data_movimentacao,responsavel_id,metadados)
  values(v_enrollment,p_aluno_id,'TRANSFERENCIA_EXTERNA_RECEBIDA',null,'ATIVO',p_turma_destino_id,
    btrim(p_motivo),nullif(btrim(p_observacao),''),p_data_transferencia,v_responsavel,
    jsonb_build_object('transferencia_id',v_transfer,'requestId',p_request_id,'planoFinanceiro',v_plan));
  v_credits:=public.salvar_aproveitamentos_transferencia_externa(v_enrollment,p_aproveitamentos,p_observacao);
  insert into internal_academic.technical_transfer_entry_plans(matricula_id,transferencia_id,
    request_id,actor_id,initial_cycle,installment_count,first_due_date,cycle_two_reason,
    financial_plan,rule_snapshot,rule_fingerprint)
  values(v_enrollment,v_transfer,p_request_id,auth.uid(),(v_plan->>'cicloNumero')::integer,
    (v_plan->>'quantidadeParcelas')::integer,(v_plan->>'primeiroVencimento')::date,
    v_plan->>'justificativaCiclo2',v_plan,v_preview->'regra',p_expected_regra_fingerprint);
  v_response:=jsonb_build_object('versao',1,'requestId',p_request_id,'replayed',false,
    'matriculaId',v_enrollment,'transferenciaId',v_transfer,'financeiro',v_preview,
    'aproveitamentosSalvos',coalesce((v_credits->>'aproveitamentosSalvos')::integer,0),
    'cobrancaGerada',false);
  insert into internal_academic.technical_financial_requests(request_id,operation,actor_id,payload_hash,response)
    values(p_request_id,'RECEBER_TRANSFERENCIA_PLANEJADA',auth.uid(),v_payload_hash,v_response);
  return v_response;
end;
$function$;
revoke all on function public.receber_transferencia_tecnica_planejada_secure(
  uuid,uuid,uuid,text,text,text,text,date,jsonb,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.receber_transferencia_tecnica_planejada_secure(
  uuid,uuid,uuid,text,text,text,text,date,jsonb,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;
