begin;

-- Anchor the existing academic payment predicate to this exact coupon receipt.
-- Another paid attempt of the same enrollment never proves this purchase.
create function internal_contas.ead_coupon_has_own_payment(p_redemption_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.ead_coupon_redemptions r
    join public.contas_receber c on c.id=r.receivable_id and c.matricula_id=r.matricula_id
      and c.cliente_id=r.aluno_id and c.turma_id=r.turma_id and c.polo_id=r.polo_id
    join public.ead_checkout_attempts a on a.id=r.attempt_id and a.receivable_id=c.id
      and a.matricula_id=r.matricula_id and a.aluno_id=r.aluno_id and a.curso_id=r.curso_id and a.turma_id=r.turma_id
    join public.inscricoes_online i on i.id=a.inscription_id and i.receivable_id=c.id
      and i.ead_checkout_attempt_id=a.id and i.matricula_id=r.matricula_id and i.aluno_id=r.aluno_id
      and i.curso_id=r.curso_id and i.turma_id=r.turma_id and i.status='PAGO' and i.valor=r.payable_amount
    where r.id=p_redemption_id and c.valor=r.payable_amount and c.status='PAGO'
      and c.valor_pago>0 and c.data_pagamento is not null
      and internal_academic.ead_has_confirmed_payment(r.matricula_id)
      and (internal_academic.ead_has_own_trust_manual_payment(c.id) or exists(
        select 1 from public.payment_gateway_transactions tx where tx.id=a.transaction_id
          and tx.receivable_id=c.id and tx.inscricao_online_id=i.id and tx.amount=c.valor
          and tx.provider_code='banese_card' and tx.provider_code=c.gateway_provider
          and tx.environment=c.gateway_environment and tx.environment=i.gateway_environment
          and tx.remote_payment_id=c.gateway_payment_id and tx.remote_payment_id=i.gateway_payment_id
          and tx.remote_payment_id=c.gateway_boleto_nosso_numero and tx.bank_slip_our_number=c.gateway_boleto_nosso_numero
          and tx.payment_method='BOLETO' and upper(tx.remote_status) in ('PAID','RECEIVED','CONFIRMED')
          and c.gateway_status='PAID' and c.origem_pagamento='BANESE' and c.gateway_settlement_source='API'
          and c.gateway_settlement_evidence->>'paymentCount' ~ '^[1-9][0-9]{0,5}$'
          and a.state in ('PAID','PAID_REVIEW')
          and (select count(*) from public.payment_gateway_transactions same where same.receivable_id=c.id)=1)))
$$;
revoke all on function internal_contas.ead_coupon_has_own_payment(uuid) from public,anon,authenticated,service_role;

create or replace function internal_contas.ead_coupon_paid_projection()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_r public.ead_coupon_redemptions%rowtype; v_receipt public.contas_receber%rowtype;
begin
  if new.status<>'PAGO' then return new; end if;
  select * into v_r from public.ead_coupon_redemptions where attempt_id=new.ead_checkout_attempt_id;
  if v_r.id is null then return new; end if;
  if tg_when='BEFORE' then
    select * into strict v_receipt from public.contas_receber where id=v_r.receivable_id;
    if new.receivable_id is distinct from v_r.receivable_id
      or new.matricula_id is distinct from v_r.matricula_id or new.aluno_id is distinct from v_r.aluno_id
      or new.curso_id is distinct from v_r.curso_id or new.valor is distinct from v_r.payable_amount
      or v_receipt.valor is distinct from v_r.payable_amount or v_receipt.status is distinct from 'PAGO'
      or v_receipt.valor_pago is null or v_receipt.valor_pago<=0 or v_receipt.data_pagamento is null then
      raise exception 'O curso com cupom exige pagamento canônico da própria cobrança com desconto.' using errcode='PT409';
    end if;
  else
    if not internal_contas.ead_coupon_has_own_payment(v_r.id) then
      raise exception 'Pagamento do cupom sem prova financeira canônica própria.' using errcode='PT409';
    end if;
    if v_r.status='RELEASED' then
      -- Retain a bank-confirmed late receipt and the existing PAID/PAID_REVIEW
      -- recovery result. Campaign capacity never erases a real payment.
      insert into public.ead_payment_reviews(attempt_id,receivable_id,polo_id,reason,evidence)
      values(v_r.attempt_id,v_r.receivable_id,v_r.polo_id,'PAYMENT_EVIDENCE_MISMATCH',
        jsonb_build_object('code','COUPON_PAYMENT_AFTER_RELEASE','couponId',v_r.coupon_id,
          'redemptionId',v_r.id,'releasedAt',v_r.released_at))
      on conflict(attempt_id,reason) do nothing;
    end if;
    update public.ead_coupon_redemptions set status='CONFIRMED',confirmed_at=coalesce(confirmed_at,clock_timestamp())
      where id=v_r.id and status in ('RESERVED','RELEASED');
  end if;
  return new;
end; $$;
revoke all on function internal_contas.ead_coupon_paid_projection() from public,anon,authenticated,service_role;

create or replace function public.ead_coupon_quote(p_code text,p_course_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_aluno uuid; v_reserved public.ead_coupon_redemptions%rowtype; v_code text;
begin
  v_aluno:=internal_contas.ead_coupon_student();
  select r.* into v_reserved from public.ead_coupon_redemptions r
    join public.ead_coupons c on c.id=r.coupon_id
    where r.aluno_id=v_aluno and r.curso_id=p_course_id
      and (r.status='RESERVED' or (r.status='CONFIRMED' and r.discount_percent=100))
      and c.code=upper(btrim(p_code)) limit 1;
  if v_reserved.id is not null then
    if v_reserved.discount_percent=100 and not exists(select 1 from public.matriculas m
      where m.id=v_reserved.matricula_id and upper(m.status) in ('ATIVO','CONCLUIDO')) then
      raise exception 'Gratuidade histórica: confira a situação atual da matrícula.' using errcode='PT409';
    end if;
    select code into v_code from public.ead_coupons where id=v_reserved.coupon_id;
    return jsonb_build_object('couponId',v_reserved.coupon_id,'code',v_code,'poloId',v_reserved.polo_id,
      'turmaId',v_reserved.turma_id,'requestId',v_reserved.request_id,'discountPercent',v_reserved.discount_percent,
      'originalAmount',v_reserved.original_amount,'discountAmount',v_reserved.discount_amount,'payableAmount',v_reserved.payable_amount);
  end if;
  return internal_contas.ead_coupon_context(p_code,p_course_id,v_aluno);
end; $$;
revoke all on function public.ead_coupon_quote(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ead_coupon_quote(text,uuid) to authenticated;

create or replace function public.ead_coupons_history(p_polo_id uuid,p_coupon_id uuid,p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_total integer; v_items jsonb;
begin
  if not public.ead_coupons_can_manage(p_polo_id) then
    raise exception 'Secretaria e Financeiro do polo são obrigatórios.' using errcode='42501';
  end if;
  if not exists(select 1 from public.ead_coupons where id=p_coupon_id and polo_id=p_polo_id) then
    raise exception 'Cupom fora do polo autorizado.' using errcode='42501';
  end if;
  if p_page is null or p_page<1 or p_page>100000 then raise exception 'Página inválida.' using errcode='22023'; end if;
  select count(*) into v_total from public.ead_coupon_redemptions where coupon_id=p_coupon_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'studentId',r.aluno_id,'studentName',a.nome,
    'courseId',r.curso_id,'courseName',c.nome,'status',r.status,'originalAmount',r.original_amount,
    'discountAmount',r.discount_amount,'payableAmount',r.payable_amount,'receivableId',r.receivable_id,
    'matriculaId',r.matricula_id,'createdAt',r.created_at,'confirmedAt',r.confirmed_at,'releasedAt',r.released_at,
    'reviewRequired',exists(select 1 from public.ead_payment_reviews review where review.attempt_id=r.attempt_id and review.state='OPEN'),
    'receivedAmount',case when r.receivable_id is null then 0 when ledger.has_ledger then ledger.received
      when receipt.status='PAGO' and receipt.data_pagamento is not null and receipt.valor_pago>0
        then receipt.valor_pago else 0 end)
    order by r.created_at desc,r.id),'[]') into v_items
  from (select * from public.ead_coupon_redemptions where coupon_id=p_coupon_id
    order by created_at desc,id limit 20 offset (p_page-1)*20) r
  join public.parceiros a on a.id=r.aluno_id join public.cursos c on c.id=r.curso_id
  left join public.contas_receber receipt on receipt.id=r.receivable_id
  left join lateral(select count(*)>0 as has_ledger,
    coalesce(sum(e.payment_cents) filter(where e.reversed_at is null),0)::numeric/100 as received
    from public.financial_payment_events e where e.source_kind='RECEIVABLE' and e.source_id=r.receivable_id) ledger on true;
  return jsonb_build_object('items',v_items,'total',v_total,'page',p_page,'pageSize',20);
end; $$;
revoke all on function public.ead_coupons_history(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.ead_coupons_history(uuid,uuid,integer) to authenticated;

create or replace function public.ead_coupon_redeem_free(p_code text,p_turma_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
  v_aluno uuid; v_t public.turmas%rowtype; v_m public.matriculas%rowtype;
  v_coupon public.ead_coupons%rowtype; v_r public.ead_coupon_redemptions%rowtype;
  v_payload jsonb; v_quote jsonb;
begin
  v_aluno:=internal_contas.ead_coupon_student();
  if p_request_id is null or p_turma_id is null then
    raise exception 'Identidade de resgate inválida.' using errcode='22023';
  end if;
  v_payload:=jsonb_build_object('code',upper(btrim(p_code)),'alunoId',v_aluno,'turmaId',p_turma_id,'mode','FREE');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ead_coupon_redeem:'||p_request_id::text,0));
  select * into v_r from public.ead_coupon_redemptions where request_id=p_request_id;
  if found then
    if v_r.actor_id is distinct from auth.uid() or v_r.request_payload is distinct from v_payload then
      raise exception 'Request id reutilizado para outro resgate.' using errcode='22023';
    end if;
    if not exists(select 1 from public.matriculas m where m.id=v_r.matricula_id
      and upper(m.status) in ('ATIVO','CONCLUIDO')) then
      raise exception 'Gratuidade histórica: confira a situação atual da matrícula.' using errcode='PT409';
    end if;
    return jsonb_build_object('matriculaId',v_r.matricula_id,'couponId',v_r.coupon_id,'status',v_r.status,
      'originalAmount',v_r.original_amount,'discountAmount',v_r.discount_amount,'payableAmount',v_r.payable_amount);
  end if;
  select * into v_coupon from public.ead_coupons where code=upper(btrim(p_code)) for update;
  if v_coupon.id is null then raise exception 'Cupom inválido.' using errcode='22023'; end if;
  select * into v_t from public.turmas where id=p_turma_id for update;
  v_quote:=internal_contas.ead_coupon_context(p_code,v_t.curso_id,v_aluno,p_turma_id);
  if (v_quote->>'discountPercent')::integer<>100 then
    raise exception 'Este cupom exige pagamento com desconto.' using errcode='22023';
  end if;
  perform public.assert_aluno_sem_matricula_curso_duplicada(v_aluno,v_t.curso_id,p_turma_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ead_checkout:'||v_aluno::text||':'||v_t.curso_id::text,0));
  if exists(select 1 from public.turmas_plano_financeiro_unico where turma_id=p_turma_id)
    or exists(select 1 from public.ead_checkout_attempts where aluno_id=v_aluno and curso_id=v_t.curso_id)
    or exists(select 1 from public.matriculas m join public.turmas t on t.id=m.turma_id
      where m.aluno_id=v_aluno and t.curso_id=v_t.curso_id)
    or exists(select 1 from public.inscricoes_online where aluno_id=v_aluno and curso_id=v_t.curso_id)
    or exists(select 1 from public.contas_receber r left join public.matriculas m on m.id=r.matricula_id
      join public.turmas t on t.id=coalesce(r.turma_id,m.turma_id)
      where (r.cliente_id=v_aluno or m.aluno_id=v_aluno) and t.curso_id=v_t.curso_id) then
    raise exception 'Aplique o cupom antes de criar matrícula ou cobrança para este curso.' using errcode='PT409';
  end if;
  perform internal_academic.authorize_enrollment_upsert(v_aluno,p_turma_id,'ATIVO');
  insert into public.matriculas(aluno_id,turma_id,status,financeiro_herdado,
    gerar_cobranca_inicial,gerar_cobranca_futura,sincronizar_asaas)
  values(v_aluno,p_turma_id,'ATIVO',false,false,false,false) returning * into v_m;
  perform public.sync_aluno_polo_scope(v_aluno,v_t.polo_id);
  insert into public.ead_aluno_progresso(aluno_id,curso_id,progress)
  values(v_aluno,v_t.curso_id,jsonb_build_object('completedContentIds','[]'::jsonb,
    'completedActivityIds','[]'::jsonb,'completedVideoIds','[]'::jsonb,
    'activityAnswers','{}'::jsonb,'quizAnswers','{}'::jsonb))
  on conflict(aluno_id,curso_id) do nothing;
  if exists(select 1 from public.contas_receber where matricula_id=v_m.id)
    or exists(select 1 from public.inscricoes_online where matricula_id=v_m.id) then
    raise exception 'Gratuidade gerou vínculo financeiro inesperado.' using errcode='PT409';
  end if;
  insert into public.ead_coupon_redemptions(request_id,actor_id,coupon_id,polo_id,aluno_id,curso_id,turma_id,
    matricula_id,status,original_amount,discount_amount,payable_amount,discount_percent,request_payload,confirmed_at)
  values(p_request_id,auth.uid(),v_coupon.id,v_t.polo_id,v_aluno,v_t.curso_id,p_turma_id,
    v_m.id,'CONFIRMED',(v_quote->>'originalAmount')::numeric,(v_quote->>'discountAmount')::numeric,
    0,100,v_payload,clock_timestamp()) returning * into v_r;
  return jsonb_build_object('matriculaId',v_m.id,'couponId',v_coupon.id,'status','CONFIRMED',
    'originalAmount',v_r.original_amount,'discountAmount',v_r.discount_amount,'payableAmount',0);
end; $$;
revoke all on function public.ead_coupon_redeem_free(text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ead_coupon_redeem_free(text,uuid,uuid) to authenticated;


commit;
