begin;

-- Preserve the released safe-resumption contracts; only percentage dispatch changes.
create or replace function internal_contas.ead_coupon_context(
  p_code text,p_course_id uuid,p_aluno_id uuid,p_turma_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_c public.ead_coupons%rowtype; v_course public.cursos%rowtype; v_t public.turmas%rowtype;
  v_original numeric; v_discount numeric; v_today date;
  v_company uuid; v_student_polo uuid; v_student_polos uuid[];
begin
  perform internal_contas.ead_coupon_assert_enabled();
  select * into v_c from public.ead_coupons where code=upper(btrim(p_code));
  if v_c.id is null or not v_c.active or clock_timestamp()<v_c.starts_at or clock_timestamp()>=v_c.ends_at
    or not exists(select 1 from public.polos owner where owner.id=v_c.polo_id
      and owner.is_matriz is true and owner.company_id is not null and public.is_active_status(owner.status)) then
    raise exception 'Cupom inválido, desativado ou fora da validade.' using errcode='22023';
  end if;
  select * into v_course from public.cursos where id=p_course_id;
  if v_course.id is null or coalesce(upper(v_course.modalidade),'')<>'EAD'
    or coalesce(upper(v_course.status),'')<>'ATIVO'
    or v_course.publicar_site is not true or (not v_c.all_courses and not p_course_id=any(v_c.course_ids)) then
    raise exception 'Este curso não participa do cupom.' using errcode='22023';
  end if;
  select company_id into v_company from public.polos where id=v_c.polo_id;
  select polo_id,polo_ids into v_student_polo,v_student_polos from public.parceiros where id=p_aluno_id;
  v_today:=(clock_timestamp() at time zone 'America/Maceio')::date;
  select t.* into v_t from public.turmas t
    join public.polos target on target.id=t.polo_id and target.company_id=v_company
      and public.is_active_status(target.status)
    where t.curso_id=p_course_id
    and upper(t.status)='EM_ANDAMENTO' and (p_turma_id is null or t.id=p_turma_id)
    and (t.data_inicio_inscricao is null or t.data_inicio_inscricao<=v_today)
    and (t.data_fim_inscricao is null or t.data_fim_inscricao>=v_today)
    and (t.bloquear_matriculas_apos_completar_vagas=false or coalesce(t.vagas_totais,0)<=0
      or (select count(*) from public.matriculas m where m.turma_id=t.id
        and upper(m.status) in ('ATIVO','CONCLUIDO','PENDENTE','AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO'))<t.vagas_totais
      or exists(select 1 from public.matriculas m where m.turma_id=t.id and m.aluno_id=p_aluno_id
        and upper(m.status) in ('PENDENTE','AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO')))
    order by exists(select 1 from public.matriculas m where m.aluno_id=p_aluno_id and m.turma_id=t.id) desc,
      (t.polo_id is not distinct from v_student_polo) desc,coalesce(t.polo_id=any(v_student_polos),false) desc,
      t.data_inicio nulls last,t.id limit 1;
  if v_t.id is null then raise exception 'Não há turma EAD disponível nos polos ativos da instituição.' using errcode='22023'; end if;
  if v_c.total_limit is not null and (select count(*) from public.ead_coupon_redemptions r
    where r.coupon_id=v_c.id and r.status<>'RELEASED')>=v_c.total_limit then
    raise exception 'As utilizações deste cupom se esgotaram.' using errcode='PT409';
  end if;
  if (select count(*) from public.ead_coupon_redemptions r where r.coupon_id=v_c.id
    and r.aluno_id=p_aluno_id and r.status<>'RELEASED')>=v_c.per_student_limit then
    raise exception 'Você atingiu o limite de cursos deste cupom.' using errcode='PT409';
  end if;
  if exists(select 1 from public.ead_coupon_redemptions r where r.coupon_id=v_c.id
    and r.aluno_id=p_aluno_id and r.curso_id=p_course_id and r.status<>'RELEASED') then
    raise exception 'O cupom já foi utilizado neste curso.' using errcode='PT409';
  end if;
  v_original:=round(v_course.valor,2);
  if v_original is null or v_original<=0 or v_original::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Valor do curso EAD indisponível.' using errcode='22023';
  end if;
  v_discount:=round(v_original*v_c.discount_percent/100.0,2);
  if v_c.discount_percent<100 and (v_discount<=0 or v_original-v_discount<=0) then
    raise exception 'Valor insuficiente para aplicar desconto.' using errcode='22023';
  end if;
  return jsonb_build_object('couponId',v_c.id,'code',v_c.code,'poloId',v_t.polo_id,'ownerPoloId',v_c.polo_id,
    'turmaId',v_t.id,'discountPercent',v_c.discount_percent,'originalAmount',v_original,
    'discountAmount',v_discount,'payableAmount',v_original-v_discount);
end; $$;

revoke all on function internal_contas.ead_coupon_context(text,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.ead_coupon_prepare_checkout(
  p_code text,p_aluno_id uuid,p_turma_id uuid,p_request_id uuid,p_provider text,p_environment text,
  p_payment_method text,p_due_date date,p_description text
)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
  v_actor uuid; v_t public.turmas%rowtype; v_coupon public.ead_coupons%rowtype;
  v_r public.ead_coupon_redemptions%rowtype; v_quote jsonb; v_payload jsonb; v_result jsonb;
begin
  perform internal_contas.ead_assert_service_role();
  perform internal_contas.ead_coupon_assert_enabled();
  if p_request_id is null or p_aluno_id is null or p_turma_id is null
    or p_provider is distinct from 'banese_card' or (p_environment is null or p_environment not in ('sandbox','production'))
    or p_payment_method is distinct from 'BOLETO' then
    raise exception 'Checkout de cupom exige boleto Banese no ambiente bancário autorizado.' using errcode='42501';
  end if;
  select auth_user_id into v_actor from public.parceiros where id=p_aluno_id
    and upper(tipo)='ALUNO' and upper(status)='ATIVO';
  if v_actor is null or (select count(*) from public.parceiros where auth_user_id=v_actor
    and upper(tipo)='ALUNO' and upper(status)='ATIVO')<>1 then
    raise exception 'Aluno autenticado ativo e único obrigatório.' using errcode='42501';
  end if;
  v_payload:=jsonb_build_object('code',upper(btrim(p_code)),'alunoId',p_aluno_id,'turmaId',p_turma_id,
    'provider',p_provider,'environment',p_environment,'method',p_payment_method,
    'dueDate',p_due_date,'description',p_description,'mode','PAID');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ead_coupon_redeem:'||p_request_id::text,0));
  select * into v_r from public.ead_coupon_redemptions where request_id=p_request_id;
  if found then
    -- Dates and descriptions are generated by the checkout backend. Preserve
    -- their original snapshot when a pending purchase is resumed on another day.
    v_payload:=v_payload||jsonb_build_object('dueDate',v_r.request_payload->'dueDate',
      'description',v_r.request_payload->'description');
    if v_r.actor_id is distinct from v_actor or v_r.request_payload is distinct from v_payload then
      raise exception 'Request id reutilizado para outro resgate.' using errcode='22023';
    end if;
    if v_r.status='RELEASED' then raise exception 'Reserva encerrada. Inicie uma nova compra.' using errcode='PT409'; end if;
    return public.ead_prepare_checkout_attempt(p_aluno_id,p_turma_id,p_request_id,p_provider,p_environment,
      p_payment_method,v_r.payable_amount,(v_r.request_payload->>'dueDate')::date,
      v_r.request_payload->>'description',null,null,false);
  end if;
  perform internal_contas.ead_coupon_assert_checkout_configuration(p_environment);
  select * into v_coupon from public.ead_coupons where code=upper(btrim(p_code)) for update;
  if v_coupon.id is null then raise exception 'Cupom inválido.' using errcode='22023'; end if;
  select * into v_t from public.turmas where id=p_turma_id for update;
  -- Keep institution/status stable until the redemption transaction commits.
  perform 1 from public.polos where id in (v_coupon.polo_id,v_t.polo_id) order by id for share;
  v_quote:=internal_contas.ead_coupon_context(p_code,v_t.curso_id,p_aluno_id,p_turma_id);
  if (v_quote->>'discountPercent')::numeric<=0 or (v_quote->>'discountPercent')::numeric>=100 then
    raise exception 'Cupom gratuito exige confirmação de gratuidade.' using errcode='22023';
  end if;
  perform public.assert_aluno_sem_matricula_curso_duplicada(p_aluno_id,v_t.curso_id,p_turma_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ead_checkout:'||p_aluno_id::text||':'||v_t.curso_id::text,0));
  if exists(select 1 from public.matriculas m join public.turmas t on t.id=m.turma_id
    where m.aluno_id=p_aluno_id and t.curso_id=v_t.curso_id)
    or exists(select 1 from public.ead_checkout_attempts where aluno_id=p_aluno_id and curso_id=v_t.curso_id)
    or exists(select 1 from public.inscricoes_online where aluno_id=p_aluno_id and curso_id=v_t.curso_id)
    or exists(select 1 from public.contas_receber r left join public.matriculas m on m.id=r.matricula_id
      join public.turmas t on t.id=coalesce(r.turma_id,m.turma_id)
      where (r.cliente_id=p_aluno_id or m.aluno_id=p_aluno_id) and t.curso_id=v_t.curso_id) then
    raise exception 'Aplique o cupom antes de criar matrícula ou cobrança para este curso.' using errcode='PT409';
  end if;
  v_result:=public.ead_prepare_checkout_attempt(p_aluno_id,p_turma_id,p_request_id,p_provider,p_environment,
    p_payment_method,(v_quote->>'payableAmount')::numeric,p_due_date,p_description,null,null,false);
  if v_result->>'action'<>'CREATE' then
    raise exception 'Compra existente exige conferência antes de aplicar cupom.' using errcode='PT409';
  end if;
  insert into public.ead_coupon_redemptions(request_id,actor_id,coupon_id,polo_id,aluno_id,curso_id,turma_id,
    matricula_id,receivable_id,attempt_id,status,original_amount,discount_amount,payable_amount,discount_percent,request_payload)
  values(p_request_id,v_actor,v_coupon.id,v_t.polo_id,p_aluno_id,v_t.curso_id,p_turma_id,
    (v_result->>'matriculaId')::uuid,(v_result->>'receivableId')::uuid,(v_result->>'attemptId')::uuid,'RESERVED',
    (v_quote->>'originalAmount')::numeric,(v_quote->>'discountAmount')::numeric,
    (v_quote->>'payableAmount')::numeric,(v_quote->>'discountPercent')::numeric,v_payload);
  return v_result;
end; $$;
revoke all on function public.ead_coupon_prepare_checkout(text,uuid,uuid,uuid,text,text,text,date,text)
  from public,anon,authenticated,service_role;
grant execute on function public.ead_coupon_prepare_checkout(text,uuid,uuid,uuid,text,text,text,date,text) to service_role;



CREATE OR REPLACE FUNCTION public.ead_coupon_quote(p_code text, p_course_id uuid, p_turma_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_aluno uuid; v_reserved public.ead_coupon_redemptions%rowtype; v_code text; v_owner uuid; v_quote jsonb;
begin
  v_aluno:=internal_contas.ead_coupon_student();
  select r.* into v_reserved from public.ead_coupon_redemptions r
    join public.ead_coupons c on c.id=r.coupon_id
    where r.aluno_id=v_aluno and r.curso_id=p_course_id
      and (r.status='RESERVED' or (r.status='CONFIRMED' and r.discount_percent=100))
      and c.code=upper(btrim(p_code)) limit 1;
  if v_reserved.id is not null then
    if p_turma_id is not null and p_turma_id is distinct from v_reserved.turma_id then
      raise exception 'A utilização anterior do cupom pertence a outra turma. Continue a compra original.' using errcode='PT409';
    end if;
    if v_reserved.discount_percent=100 and not exists(select 1 from public.matriculas m
      where m.id=v_reserved.matricula_id and upper(m.status) in ('ATIVO','CONCLUIDO')) then
      raise exception 'Gratuidade histórica: confira a situação atual da matrícula.' using errcode='PT409';
    end if;
    select code,polo_id into v_code,v_owner from public.ead_coupons where id=v_reserved.coupon_id;
    return jsonb_build_object('couponId',v_reserved.coupon_id,'code',v_code,'poloId',v_reserved.polo_id,'ownerPoloId',v_owner,
      'turmaId',v_reserved.turma_id,'requestId',v_reserved.request_id,'discountPercent',v_reserved.discount_percent,
      'originalAmount',v_reserved.original_amount,'discountAmount',v_reserved.discount_amount,'payableAmount',v_reserved.payable_amount);
  end if;
  v_quote:=internal_contas.ead_coupon_context(p_code,p_course_id,v_aluno,p_turma_id);
  if (v_quote->>'discountPercent')::numeric=100 then
    perform internal_contas.ead_coupon_free_enrollment(v_aluno,(v_quote->>'turmaId')::uuid);
  elsif exists(select 1 from public.ead_checkout_attempts where aluno_id=v_aluno and curso_id=p_course_id)
    or exists(select 1 from public.matriculas m join public.turmas t on t.id=m.turma_id
      where m.aluno_id=v_aluno and t.curso_id=p_course_id)
    or exists(select 1 from public.inscricoes_online where aluno_id=v_aluno and curso_id=p_course_id)
    or exists(select 1 from public.contas_receber r left join public.matriculas m on m.id=r.matricula_id
      join public.turmas t on t.id=coalesce(r.turma_id,m.turma_id)
      where (r.cliente_id=v_aluno or m.aluno_id=v_aluno) and t.curso_id=p_course_id) then
    raise exception 'Compra anterior exige conferência antes de aplicar este desconto.' using errcode='PT409';
  end if;
  return v_quote;
end; $function$
;
revoke all on function public.ead_coupon_quote(text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ead_coupon_quote(text,uuid,uuid) to authenticated;

-- Two signatures without defaults keep PostgREST dispatch unambiguous.
create or replace function public.ead_coupon_quote(p_code text,p_course_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select public.ead_coupon_quote(p_code,p_course_id,null::uuid)
$$;
revoke all on function public.ead_coupon_quote(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ead_coupon_quote(text,uuid) to authenticated;

create or replace function public.ead_coupon_redeem_free(p_code text,p_turma_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
  v_aluno uuid; v_t public.turmas%rowtype; v_m public.matriculas%rowtype;
  v_coupon public.ead_coupons%rowtype; v_r public.ead_coupon_redemptions%rowtype;
  v_payload jsonb; v_quote jsonb; v_resume uuid; v_before jsonb; v_history jsonb; v_flags jsonb;
begin
  v_aluno:=internal_contas.ead_coupon_student();
  if p_request_id is null or p_turma_id is null then
    raise exception 'Identidade de resgate inválida.' using errcode='22023';
  end if;
  v_payload:=jsonb_build_object('code',upper(btrim(p_code)),'alunoId',v_aluno,'turmaId',p_turma_id,'mode','FREE');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ead_coupon_redeem:'||p_request_id::text,0));
  select * into v_r from public.ead_coupon_redemptions where request_id=p_request_id;
  if found then
    if v_r.actor_id is distinct from auth.uid() or (v_r.request_payload - 'resumedHistory') is distinct from v_payload then
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
  -- Keep institution/status stable until the redemption transaction commits.
  perform 1 from public.polos where id in (v_coupon.polo_id,v_t.polo_id) order by id for share;
  v_quote:=internal_contas.ead_coupon_context(p_code,v_t.curso_id,v_aluno,p_turma_id);
  if (v_quote->>'discountPercent')::numeric<>100 then
    raise exception 'Este cupom exige pagamento com desconto.' using errcode='22023';
  end if;
  perform public.assert_aluno_sem_matricula_curso_duplicada(v_aluno,v_t.curso_id,p_turma_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ead_checkout:'||v_aluno::text||':'||v_t.curso_id::text,0));
  -- Enrollment locks serialize callbacks/inserts against the same academic identity.
  perform 1 from public.matriculas m join public.turmas t on t.id=m.turma_id
    where m.aluno_id=v_aluno and t.curso_id=v_t.curso_id order by m.id for update of m;
  perform 1 from public.ead_checkout_attempts where aluno_id=v_aluno and curso_id=v_t.curso_id order by id for update;
  perform 1 from public.contas_receber where matricula_id in
    (select id from public.matriculas where aluno_id=v_aluno and turma_id=p_turma_id) order by id for update;
  perform 1 from public.inscricoes_online where aluno_id=v_aluno and curso_id=v_t.curso_id order by id for update;
  perform 1 from public.payment_gateway_transactions where receivable_id in
    (select receivable_id from public.ead_checkout_attempts where aluno_id=v_aluno and curso_id=v_t.curso_id)
    order by id for update;
  perform 1 from public.banese_ead_checkout_expiration_jobs where matricula_id in
    (select id from public.matriculas where aluno_id=v_aluno and turma_id=p_turma_id) order by id for update;
  v_resume:=internal_contas.ead_coupon_free_enrollment(v_aluno,p_turma_id);
  if v_resume is not null then
    v_before:=internal_contas.ead_coupon_financial_snapshot(v_resume);
    select jsonb_build_object('gerarCobrancaInicial',gerar_cobranca_inicial,
      'sincronizarAsaas',sincronizar_asaas) into v_flags from public.matriculas where id=v_resume;
    select jsonb_build_object('matriculaId',v_resume,'previousStatus','PENDENTE','previousFlags',v_flags,
      'attemptIds',jsonb_agg(id order by id)) into v_history
      from public.ead_checkout_attempts where matricula_id=v_resume;
    perform internal_academic.authorize_enrollment_upsert(v_aluno,p_turma_id,'ATIVO');
    update public.matriculas set status='ATIVO',gerar_cobranca_inicial=false,sincronizar_asaas=false
      where id=v_resume and status='PENDENTE'
      returning * into strict v_m;
  else
    perform internal_academic.authorize_enrollment_upsert(v_aluno,p_turma_id,'ATIVO');
    insert into public.matriculas(aluno_id,turma_id,status,financeiro_herdado,
      gerar_cobranca_inicial,gerar_cobranca_futura,sincronizar_asaas)
    values(v_aluno,p_turma_id,'ATIVO',false,false,false,false) returning * into v_m;
  end if;
  perform public.sync_aluno_polo_scope(v_aluno,v_t.polo_id);
  insert into public.ead_aluno_progresso(aluno_id,curso_id,progress)
  values(v_aluno,v_t.curso_id,jsonb_build_object('completedContentIds','[]'::jsonb,
    'completedActivityIds','[]'::jsonb,'completedVideoIds','[]'::jsonb,
    'activityAnswers','{}'::jsonb,'quizAnswers','{}'::jsonb))
  on conflict(aluno_id,curso_id) do nothing;
  if v_resume is not null then
    if internal_contas.ead_coupon_financial_snapshot(v_resume) is distinct from v_before then
      raise exception 'Retomada gratuita alterou histórico financeiro. Operação revertida.' using errcode='PT409';
    end if;
    v_payload:=v_payload||jsonb_build_object('resumedHistory',v_history);
  elsif exists(select 1 from public.contas_receber where matricula_id=v_m.id)
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

notify pgrst,'reload schema';
commit;
