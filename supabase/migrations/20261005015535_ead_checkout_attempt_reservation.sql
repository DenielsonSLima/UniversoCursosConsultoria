begin;

create function internal_contas.ead_adopt_optional_attempt(p_receivable_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_c public.contas_receber%rowtype;v_i public.inscricoes_online%rowtype;
  v_m public.matriculas%rowtype;v_a public.ead_checkout_attempts%rowtype;v_t uuid;
begin
  select * into strict v_c from public.contas_receber where id=p_receivable_id;
  select * into strict v_m from public.matriculas where id=v_c.matricula_id for update;
  select * into strict v_c from public.contas_receber where id=p_receivable_id for update;
  if v_c.ead_checkout_attempt_id is not null then return v_c.ead_checkout_attempt_id; end if;
  if not internal_contas.ead_checkout_can_expire(v_c.id) then
    raise exception 'Legado EAD não comprovadamente opcional.' using errcode='PT409';
  end if;
  select * into strict v_i from public.inscricoes_online where receivable_id=v_c.id for update;
  if exists(select 1 from public.ead_checkout_attempts where matricula_id=v_m.id and is_current) then
    raise exception 'Outra tentativa EAD corrente já existe.' using errcode='PT409';
  end if;
  select id into v_t from public.payment_gateway_transactions where receivable_id=v_c.id;
  insert into public.ead_checkout_attempts(matricula_id,aluno_id,turma_id,curso_id,
    receivable_id,inscription_id,transaction_id,sequence_number,state)
  values(v_m.id,v_m.aluno_id,v_m.turma_id,v_i.curso_id,v_c.id,v_i.id,v_t,
    coalesce((select max(sequence_number) from public.ead_checkout_attempts where matricula_id=v_m.id),0)+1,'OPEN')
  returning * into v_a;
  update public.contas_receber set ead_checkout_attempt_id=v_a.id where id=v_c.id;
  update public.inscricoes_online set ead_checkout_attempt_id=v_a.id where id=v_i.id;
  return v_a.id;
end; $$;
revoke all on function internal_contas.ead_adopt_optional_attempt(uuid) from public,anon,authenticated,service_role;

create function public.ead_prepare_checkout_attempt(
  p_aluno_id uuid,p_turma_id uuid,p_request_id uuid,p_provider text,p_environment text,
  p_payment_method text,p_amount numeric,p_due_date date,p_description text,
  p_fee_value numeric default null,p_net_value numeric default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_t public.turmas%rowtype;v_m public.matriculas%rowtype;v_c public.contas_receber%rowtype;
  v_a public.ead_checkout_attempts%rowtype;v_request public.ead_checkout_requests%rowtype;
  v_payload jsonb;v_action text;v_token uuid;v_course public.cursos%rowtype;v_id uuid;
begin
  perform internal_contas.ead_assert_service_role();
  if p_aluno_id is null or p_turma_id is null or p_request_id is null
    or p_provider is distinct from 'banese_card' or p_environment is null or p_environment not in ('sandbox','production')
    or p_payment_method is distinct from 'BOLETO' or p_amount is null or p_amount<=0
    or p_amount::text !~ '^[0-9]+([.][0-9]+)?$' or p_amount<>round(p_amount,2)
    or p_due_date is null or p_description is null
    or length(p_description) not between 1 and 500
    or p_fee_value<0 or p_net_value<0 then raise exception 'Parâmetros de compra EAD inválidos.'; end if;
  -- Prices are the sanitized snapshot calculated by the Edge checkout backend.
  -- This RPC is service-only; browser prices never reach this signature.
  v_payload:=jsonb_build_object('aluno',p_aluno_id,'turma',p_turma_id,'provider',p_provider,
    'environment',p_environment,'method',p_payment_method,'amount',p_amount,'due',p_due_date,
    'description',p_description,'fee',p_fee_value,'net',p_net_value);
  select * into strict v_t from public.turmas where id=p_turma_id;
  if v_t.polo_id is null then raise exception 'Turma EAD sem polo financeiro.'; end if;
  if not exists(select 1 from public.parceiros p where p.id=p_aluno_id
    and upper(p.tipo)='ALUNO' and upper(p.status)='ATIVO') then raise exception 'Perfil de aluno indisponível.'; end if;
  select * into strict v_course from public.cursos where id=v_t.curso_id;
  if coalesce(upper(v_course.modalidade),'')<>'EAD' or not coalesce(v_course.publicar_site,false)
    or coalesce(upper(v_course.status),'')<>'ATIVO' then raise exception 'Curso EAD indisponível para compra.'; end if;
  perform public.assert_aluno_sem_matricula_curso_duplicada(p_aluno_id,v_t.curso_id,p_turma_id);
  perform pg_advisory_xact_lock(hashtextextended('ead_checkout:'||p_aluno_id::text||':'||v_t.curso_id::text,0));
  select * into v_m from public.matriculas where aluno_id=p_aluno_id and turma_id=p_turma_id for update;
  if not found then
    perform internal_academic.authorize_enrollment_upsert(p_aluno_id,p_turma_id,'PENDENTE');
    insert into public.matriculas(aluno_id,turma_id,status,financeiro_herdado,
      gerar_cobranca_inicial,gerar_cobranca_futura,sincronizar_asaas)
    values(p_aluno_id,p_turma_id,'PENDENTE',false,false,false,false) returning * into v_m;
  end if;
  if upper(v_m.status) in ('ATIVO','TRANCADO','CONCLUIDO')
    or exists(select 1 from public.contas_receber where matricula_id=v_m.id and status='PAGO') then
    return jsonb_build_object('action','ALREADY_PAID','matriculaId',v_m.id);
  end if;
  if upper(v_m.status) not in ('PENDENTE','AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO') then
    return jsonb_build_object('action','REVIEW','matriculaId',v_m.id);
  end if;
  if exists(select 1 from public.matricula_movimentacoes h where h.matricula_id=v_m.id
      and (upper(h.status_novo) in ('ATIVO','TRANCADO','CONCLUIDO') or upper(h.status_anterior) in ('ATIVO','TRANCADO','CONCLUIDO')))
    or exists(select 1 from public.ead_aluno_progresso p where p.aluno_id=p_aluno_id and p.curso_id=v_t.curso_id
      and (p.started_at is not null or coalesce(p.progress,'{}'::jsonb)<>'{}'::jsonb)) then
    return jsonb_build_object('action','REVIEW','matriculaId',v_m.id);
  end if;
  select * into v_request from public.ead_checkout_requests where request_id=p_request_id;
  if found then
    if v_request.payload is distinct from v_payload then raise exception 'Request id EAD reutilizado com outro payload.'; end if;
    select * into strict v_a from public.ead_checkout_attempts where id=v_request.attempt_id;
    v_action:=case when v_a.state='OPEN' then 'REUSE' else 'AWAITING_CONFIRMATION' end;
  else
    select * into v_a from public.ead_checkout_attempts where matricula_id=v_m.id and is_current for update;
    if v_a.id is null then
      select * into v_c from public.contas_receber where matricula_id=v_m.id
        and tipo_lancamento='MATRICULA' and ead_checkout_attempt_id is null for update;
      if v_c.id is not null then
        if internal_contas.ead_checkout_can_expire(v_c.id) then
          v_id:=internal_contas.ead_adopt_optional_attempt(v_c.id);
          select * into strict v_a from public.ead_checkout_attempts where id=v_id;
        else return jsonb_build_object('action','REVIEW','matriculaId',v_m.id); end if;
      end if;
    end if;
    if v_a.state in ('PAID','PAID_REVIEW') then v_action:='ALREADY_PAID';
    elsif v_a.state='PAYMENT_RECOVERY_FENCED' then v_action:='REVIEW';
    elsif v_a.id is not null and v_a.state<>'EXPIRED' then v_action:='REUSE';
    else
      if v_a.id is not null and not exists(select 1 from public.banese_ead_checkout_expiration_jobs
        where receivable_id=v_a.receivable_id and canceled_at is not null
          and remote_status in ('CANCELED','EXPIRED')) then
        return jsonb_build_object('action','REVIEW','matriculaId',v_m.id);
      end if;
      update public.ead_checkout_attempts set is_current=false,updated_at=now() where id=v_a.id;
      v_token:=gen_random_uuid();
      insert into public.ead_checkout_attempts(matricula_id,aluno_id,turma_id,curso_id,
        receivable_id,inscription_id,sequence_number,state)
      values(v_m.id,p_aluno_id,p_turma_id,v_t.curso_id,gen_random_uuid(),gen_random_uuid(),
        coalesce((select max(sequence_number) from public.ead_checkout_attempts where matricula_id=v_m.id),0)+1,'RESERVED')
      returning * into v_a;
      insert into public.contas_receber(id,ead_checkout_attempt_id,polo_id,descricao,valor,data_vencimento,
        status,cliente_id,matricula_id,turma_id,categoria,tipo_lancamento,origem_cronograma_id,origem_pagamento,
        gateway_provider,gateway_environment,gateway_payment_method,gateway_installments,
        gateway_status,gateway_creation_token,asaas_fee_value,asaas_net_value)
      values(v_a.receivable_id,v_a.id,v_t.polo_id,p_description,p_amount,p_due_date,'PENDENTE',p_aluno_id,
        v_m.id,p_turma_id,'MENSALIDADE','MATRICULA','ead_attempt:'||v_a.id::text,'GATEWAY_EAD',
        p_provider,p_environment,p_payment_method,1,'CREATING',v_token,p_fee_value,p_net_value);
      insert into public.inscricoes_online(id,ead_checkout_attempt_id,curso_id,turma_id,aluno_id,
        matricula_id,receivable_id,status,valor,forma_pagamento,gateway_provider,gateway_environment)
      values(v_a.inscription_id,v_a.id,v_t.curso_id,p_turma_id,p_aluno_id,v_m.id,v_a.receivable_id,
        'AGUARDANDO_PAGAMENTO',p_amount,p_payment_method,p_provider,p_environment);
      v_action:='CREATE';
    end if;
    insert into public.ead_checkout_requests(request_id,aluno_id,turma_id,attempt_id,payload)
    values(p_request_id,p_aluno_id,p_turma_id,v_a.id,v_payload);
  end if;
  select * into strict v_c from public.contas_receber where id=v_a.receivable_id;
  if v_a.state='RESERVED' and v_c.gateway_last_error is not null then
    insert into public.ead_payment_reviews(attempt_id,receivable_id,polo_id,reason,evidence)
    values(v_a.id,v_c.id,v_c.polo_id,'CHECKOUT_CREATION_UNCERTAIN',jsonb_build_object('code','CHECKOUT_CREATION_UNCERTAIN'))
    on conflict(attempt_id,reason) do nothing;
    v_action:='REVIEW';
  end if;
  if v_action='REUSE' and (v_c.gateway_status='CREATING' or v_c.gateway_creation_token is not null
    or coalesce(v_c.gateway_status,'') not in ('PENDING','REGISTERED','OVERDUE')
    or v_c.gateway_payment_id is null or v_c.data_vencimento<internal_contas.ead_expiration_today()
    or v_c.data_pagamento is not null or coalesce(v_c.valor_pago,0)>0
    or exists(select 1 from public.payment_gateway_transactions tx where tx.receivable_id=v_c.id
      and upper(coalesce(tx.remote_status,'')) in ('PAID','RECEIVED','CONFIRMED','APPROVED'))
    or exists(select 1 from public.inscricoes_online i where i.id=v_a.inscription_id
      and (i.status='PAGO' or i.pago_em is not null or i.confirmado_em is not null))
    or exists(select 1 from public.banese_ead_checkout_expiration_jobs j
      where j.receivable_id=v_c.id and j.state in ('PROCESSING','RETRY','REVIEW_REQUIRED'))) then
    v_action:='AWAITING_CONFIRMATION';
  end if;
  return jsonb_build_object('action',v_action,'attemptId',v_a.id,'matriculaId',v_m.id,
    'receivableId',v_c.id,'inscricaoId',v_a.inscription_id,'creationToken',v_token,
    'receivable',to_jsonb(v_c));
end; $$;
revoke all on function public.ead_prepare_checkout_attempt(uuid,uuid,uuid,text,text,text,numeric,date,text,numeric,numeric)
  from public,anon,authenticated;
grant execute on function public.ead_prepare_checkout_attempt(uuid,uuid,uuid,text,text,text,numeric,date,text,numeric,numeric) to service_role;

create function public.ead_bind_checkout_attempt(p_attempt_id uuid,p_receivable_id uuid,p_transaction_id uuid,p_inscription_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_a public.ead_checkout_attempts%rowtype;v_c public.contas_receber%rowtype;v_t public.payment_gateway_transactions%rowtype;
begin
  perform internal_contas.ead_assert_service_role();
  select * into strict v_a from public.ead_checkout_attempts where id=p_attempt_id;
  perform 1 from public.matriculas where id=v_a.matricula_id for update;
  select * into strict v_a from public.ead_checkout_attempts where id=p_attempt_id for update;
  select * into strict v_c from public.contas_receber where id=p_receivable_id for update;
  select * into strict v_t from public.payment_gateway_transactions where id=p_transaction_id for update;
  if v_a.receivable_id is distinct from p_receivable_id or v_a.inscription_id is distinct from p_inscription_id
    or v_a.state not in ('RESERVED','OPEN','PAYMENT_RECOVERY_FENCED') or not v_a.is_current
    or v_a.transaction_id is not null and v_a.transaction_id<>p_transaction_id
    or v_c.ead_checkout_attempt_id is distinct from v_a.id
    or v_c.gateway_payment_id is null or v_c.gateway_environment is null or v_c.gateway_provider is null
    or v_t.receivable_id is distinct from v_c.id or v_t.inscricao_online_id is distinct from p_inscription_id
    or v_t.provider_code is distinct from v_c.gateway_provider or v_t.environment is distinct from v_c.gateway_environment
    or v_t.remote_payment_id is distinct from v_c.gateway_payment_id
    or v_t.amount is distinct from v_c.valor
    or not exists(select 1 from public.inscricoes_online i where i.id=p_inscription_id
      and i.receivable_id=v_c.id and i.ead_checkout_attempt_id=v_a.id
      and i.gateway_payment_id=v_c.gateway_payment_id and i.gateway_environment=v_c.gateway_environment) then
    raise exception 'Ligação da tentativa EAD divergente.' using errcode='PT409';
  end if;
  update public.ead_checkout_attempts set transaction_id=p_transaction_id,
    state=case when state='PAYMENT_RECOVERY_FENCED' then state else 'OPEN' end,updated_at=now() where id=v_a.id;
  return jsonb_build_object('attemptId',v_a.id,'receivableId',v_c.id,'inscricaoId',p_inscription_id,
    'transactionId',p_transaction_id,'state',case when v_a.state='PAYMENT_RECOVERY_FENCED' then v_a.state else 'OPEN' end);
end; $$;
revoke all on function public.ead_bind_checkout_attempt(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ead_bind_checkout_attempt(uuid,uuid,uuid,uuid) to service_role;

commit;
