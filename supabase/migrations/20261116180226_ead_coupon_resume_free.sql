begin;
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
  v_quote:=internal_contas.ead_coupon_context(p_code,v_t.curso_id,v_aluno,p_turma_id);
  if (v_quote->>'discountPercent')::integer<>100 then
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
commit;
