begin;

create function public.proesc_create_import_class_service(p_actor_id uuid,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
  v_replay jsonb; v_scope internal_proesc.class_scopes%rowtype; v_batch internal_proesc.import_batches%rowtype;
  v_spec jsonb; v_academic jsonb:=p_payload->'sourceAcademic'; v_class public.turmas%rowtype;
  v_id uuid:=gen_random_uuid(); v_expected jsonb; v_observed timestamptz; v_status text; v_turno text;
begin
  v_replay:=internal_proesc.begin_bootstrap_request('CLASS',p_actor_id,p_request_id,p_payload);
  if v_replay is not null then return v_replay; end if;
  select * into strict v_scope from internal_proesc.class_scopes where id=(p_payload->>'scopeId')::uuid;
  select * into strict v_batch from internal_proesc.import_batches where id=v_scope.batch_id for update;
  select * into strict v_scope from internal_proesc.class_scopes where id=v_scope.id for update;
  if v_batch.status not in ('STAGING','STUDENTS_READY')
    or (select count(*) from internal_proesc.student_staging where batch_id=v_batch.id)<>v_batch.expected_students
    or v_scope.phase<>'STAGED' or v_scope.turma_id is not null
    or v_scope.financial_mode<>'INDIVIDUAL_REVIEW' then
    raise exception 'Conclua alunos antes das turmas; turma existente não pode ser sobrescrita.' using errcode='42501'; end if;
  if p_payload ?| array['financialRule','firstDueDate','financialSourceFingerprint']
    or jsonb_typeof(v_academic) is distinct from 'object'
    or not coalesce(v_academic->>'status' in ('EM_ANDAMENTO','SOURCE_UNKNOWN')
      and v_academic->>'fingerprint' ~ '^[0-9a-f]{64}$',false)
    or v_academic->>'kind' is distinct from 'PROESC_XLS_EXPORT'
    or v_academic->>'fileSha256' is distinct from v_scope.source_academic->>'fileSha256'
    or v_academic->>'classLabel' is distinct from v_scope.source_academic->>'classLabel'
    or (v_academic->>'status'='EM_ANDAMENTO' and
      (v_academic->'verified' is distinct from 'true'::jsonb
       or coalesce((v_scope.source_academic->>'cursandoCount')::integer,0)<1)) then
    raise exception 'Turma exige proveniência acadêmica; esta importação não define plano financeiro.' using errcode='22023'; end if;
  v_observed:=(v_academic->>'observedAt')::timestamptz;
  if v_observed is null or not isfinite(v_observed) or v_observed>now()+interval '5 minutes' then
    raise exception 'Data de observação acadêmica inválida.' using errcode='22023'; end if;
  v_spec:=v_scope.class_spec;
  v_turno:=nullif(v_spec->>'turno','');
  if p_payload ? 'turno' then
    if p_payload->>'sourceTurno' is distinct from 'USER_CONFIRMED'
      or not coalesce(p_payload->>'turno' in ('MATUTINO','VESPERTINO','NOTURNO','INTEGRAL'),false)
      or (v_turno is not null and v_turno is distinct from p_payload->>'turno') then
      raise exception 'Confirmação de turno ausente, inválida ou contraditória.' using errcode='22023'; end if;
    if v_turno is null then
      v_turno:=p_payload->>'turno';
      v_spec:=v_spec||jsonb_build_object('turno',v_turno,'turnoSource','USER_CONFIRMED');
    end if;
  elsif p_payload ? 'sourceTurno' then
    raise exception 'Origem de confirmação exige valor explícito de turno.' using errcode='22023';
  end if;
  if not coalesce(v_turno in ('MATUTINO','VESPERTINO','NOTURNO','INTEGRAL'),false) then
    raise exception 'Turno real da turma ainda não foi informado; não inferir pelo rótulo SEM.' using errcode='22023'; end if;
  if length(btrim(coalesce(v_spec->>'name','')))<2
    or ((v_spec->>'endDate')::date is not null and (v_spec->>'endDate')::date<(v_spec->>'startDate')::date) then
    raise exception 'Nome ou período acadêmico da turma inválido.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('proesc:class-code:'||v_scope.class_code,0));
  if exists(select 1 from public.turmas where codigo=v_scope.class_code) then
    raise exception 'Código de turma já existente; não duplicar o cadastro.' using errcode='40001'; end if;
  update internal_proesc.class_scopes set turma_id=v_id where id=v_scope.id;
  -- Required legacy mirrors are neutral storage, not a sold/issuable plan.
  -- The absence of rule fingerprint/config and private review state is explicit.
  v_expected:=jsonb_build_object('id',v_id,'codigo',v_scope.class_code,'polo_id',v_scope.polo_id,
    'curso_id',(v_spec->>'courseId')::uuid,'status','PLANEJADA','origem_financeira','LEGADO',
    'financeiro_herdado',true,'gerar_cobrancas_futuras',false,'sincronizar_asaas_futuro',false,
    'publicar_no_site',false,'permitir_inscricoes_online',false,'cobrar_matricula',false,
    'valor_matricula',0,'cobrar_rematricula',false,'valor_rematricula',0,'qtd_parcelas',0,
    'valor_parcela',0,'cronograma_financeiro','[]'::jsonb,'regra_financeira_fingerprint',null,
    'primeiro_vencimento_padrao',null,'regra_financeira_revisao',0,
    'desconto_pontualidade',0,'juros_atraso',0,'multa_atraso',0,'multa_atraso_percentual',0,
    'dia_vencimento_padrao',0,'aplicar_desconto_matricula',false,'aplicar_multa_juros_matricula',false,
    'aplicar_desconto_mensalidade',false,'aplicar_multa_juros_mensalidade',false,
    'aplicar_desconto_rematricula',false,'aplicar_multa_juros_rematricula',false);
  insert into internal_proesc.bootstrap_claims(request_id,transaction_id,entity,record_id,expected_new)
  values(p_request_id,txid_current(),'CLASS',v_id,v_expected);
  insert into public.turmas(id,codigo,nome,curso_id,polo_id,turno,status,data_inicio,data_previsao_termino,
    origem_financeira,financeiro_herdado,gerar_cobrancas_futuras,sincronizar_asaas_futuro,
    publicar_no_site,permitir_inscricoes_online,cobrar_matricula,valor_matricula,
    cobrar_rematricula,valor_rematricula,qtd_parcelas,valor_parcela,cronograma_financeiro,
    regra_financeira_fingerprint,regra_financeira_revisao,primeiro_vencimento_padrao,
    desconto_pontualidade,juros_atraso,multa_atraso,multa_atraso_percentual,dia_vencimento_padrao,
    aplicar_desconto_matricula,aplicar_multa_juros_matricula,aplicar_desconto_mensalidade,
    aplicar_multa_juros_mensalidade,aplicar_desconto_rematricula,aplicar_multa_juros_rematricula,instrucao_boleto_carne)
  values(v_id,v_scope.class_code,v_spec->>'name',(v_spec->>'courseId')::uuid,v_scope.polo_id,
    v_spec->>'turno','PLANEJADA',(v_spec->>'startDate')::date,(v_spec->>'endDate')::date,
    'LEGADO',true,false,false,false,false,false,0,false,0,0,0,'[]',null,0,null,
    0,0,0,0,0,false,false,false,false,false,false,
    'Histórico Proesc; condições financeiras pendentes de conferência individual.')
  returning * into v_class;
  if not to_jsonb(v_class) @> v_expected then
    raise exception 'Turma criada divergiu do plano protegido.' using errcode='40001'; end if;
  v_status:=v_academic->>'status';
  if v_status='EM_ANDAMENTO' then
    v_expected:=v_expected||jsonb_build_object('status','EM_ANDAMENTO');
    update internal_proesc.bootstrap_claims set expected_new=v_expected where request_id=p_request_id;
    perform internal_academic.authorize_transition('TURMA_STATUS',v_id,'EM_ANDAMENTO');
    update public.turmas set status='EM_ANDAMENTO' where id=v_id returning * into v_class;
  end if;
  if not to_jsonb(v_class) @> v_expected then
    raise exception 'Transição de turma alterou condições não autorizadas.' using errcode='40001'; end if;
  update internal_proesc.class_scopes set phase='CONFIRMED',class_spec=v_spec,
    source_academic=v_scope.source_academic||v_academic||jsonb_build_object('calendarState',
      case when v_spec->>'endDate' is null then 'REVIEW' else 'SOURCE_DATES' end),
    confirmed_by=p_actor_id,confirmed_at=now() where id=v_scope.id;
  update internal_proesc.bootstrap_claims set completed=true where request_id=p_request_id;
  update internal_proesc.import_batches set status=case when
    (select count(*) from internal_proesc.class_scopes where batch_id=v_batch.id and phase='CONFIRMED')=9
    then 'CLASSES_READY' else 'STUDENTS_READY' end where id=v_batch.id;
  return internal_proesc.finish_bootstrap_request(p_request_id,jsonb_build_object('scopeId',v_scope.id,
    'turmaId',v_id,'status',v_class.status,'financialMode',v_scope.financial_mode,'created',true));
end;
$$;
revoke all on function public.proesc_create_import_class_service(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.proesc_create_import_class_service(uuid,uuid,jsonb) to service_role;
commit;
