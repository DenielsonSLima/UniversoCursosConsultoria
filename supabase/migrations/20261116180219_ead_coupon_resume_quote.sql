begin;
CREATE OR REPLACE FUNCTION public.ead_coupon_quote(p_code text, p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_aluno uuid; v_reserved public.ead_coupon_redemptions%rowtype; v_code text; v_quote jsonb;
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
  v_quote:=internal_contas.ead_coupon_context(p_code,p_course_id,v_aluno);
  if (v_quote->>'discountPercent')::integer=100 then
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
commit;
