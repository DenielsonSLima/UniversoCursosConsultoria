begin;

create function internal_contas.ead_coupon_assert_enabled()
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if not coalesce((select enabled from internal_contas.ead_coupon_runtime where singleton),false) then
    raise exception 'Cupons EAD disponíveis apenas no ambiente local isolado.' using errcode='42501';
  end if;
end; $$;

create function internal_contas.ead_coupon_student()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_aluno uuid;
begin
  perform internal_contas.ead_coupon_assert_enabled();
  if auth.uid() is null or auth.role() is distinct from 'authenticated' then
    raise exception 'Entre como aluno para aplicar um cupom.' using errcode='42501';
  end if;
  select p.id into v_aluno from public.parceiros p
    where p.auth_user_id=auth.uid() and upper(p.tipo)='ALUNO' and upper(p.status)='ATIVO';
  if v_aluno is null or (select count(*) from public.parceiros p
    where p.auth_user_id=auth.uid() and upper(p.tipo)='ALUNO' and upper(p.status)='ATIVO')<>1 then
    raise exception 'Cadastro de aluno ativo e único obrigatório.' using errcode='42501';
  end if;
  return v_aluno;
end; $$;

create function internal_contas.ead_coupon_context(
  p_code text,p_course_id uuid,p_aluno_id uuid,p_turma_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_c public.ead_coupons%rowtype; v_course public.cursos%rowtype; v_t public.turmas%rowtype;
  v_original numeric; v_discount numeric; v_today date;
begin
  perform internal_contas.ead_coupon_assert_enabled();
  select * into v_c from public.ead_coupons where code=upper(btrim(p_code));
  if v_c.id is null or not v_c.active or clock_timestamp()<v_c.starts_at or clock_timestamp()>=v_c.ends_at then
    raise exception 'Cupom inválido, desativado ou fora da validade.' using errcode='22023';
  end if;
  select * into v_course from public.cursos where id=p_course_id;
  if v_course.id is null or coalesce(upper(v_course.modalidade),'')<>'EAD'
    or coalesce(upper(v_course.status),'')<>'ATIVO'
    or v_course.publicar_site is not true or (not v_c.all_courses and not p_course_id=any(v_c.course_ids)) then
    raise exception 'Este curso não participa do cupom.' using errcode='22023';
  end if;
  v_today:=(clock_timestamp() at time zone 'America/Maceio')::date;
  select * into v_t from public.turmas t where t.curso_id=p_course_id and t.polo_id=v_c.polo_id
    and upper(t.status)='EM_ANDAMENTO' and (p_turma_id is null or t.id=p_turma_id)
    and (t.data_inicio_inscricao is null or t.data_inicio_inscricao<=v_today)
    and (t.data_fim_inscricao is null or t.data_fim_inscricao>=v_today)
    and (t.bloquear_matriculas_apos_completar_vagas=false or coalesce(t.vagas_totais,0)<=0
      or (select count(*) from public.matriculas m where m.turma_id=t.id
        and upper(m.status) in ('ATIVO','CONCLUIDO','PENDENTE','AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO'))<t.vagas_totais
      or exists(select 1 from public.matriculas m where m.turma_id=t.id and m.aluno_id=p_aluno_id
        and upper(m.status) in ('PENDENTE','AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO')))
    order by t.data_inicio nulls last,t.id limit 1;
  if v_t.id is null then raise exception 'Não há turma EAD disponível no polo do cupom.' using errcode='22023'; end if;
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
  if v_c.discount_percent=50 and v_original-v_discount<=0 then
    raise exception 'Valor insuficiente para aplicar desconto.' using errcode='22023';
  end if;
  return jsonb_build_object('couponId',v_c.id,'code',v_c.code,'poloId',v_c.polo_id,
    'turmaId',v_t.id,'discountPercent',v_c.discount_percent,'originalAmount',v_original,
    'discountAmount',v_discount,'payableAmount',v_original-v_discount);
end; $$;

create function public.ead_coupon_quote(p_code text,p_course_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_aluno uuid; v_reserved public.ead_coupon_redemptions%rowtype; v_code text;
begin
  v_aluno:=internal_contas.ead_coupon_student();
  select r.* into v_reserved from public.ead_coupon_redemptions r
    join public.ead_coupons c on c.id=r.coupon_id
    where r.aluno_id=v_aluno and r.curso_id=p_course_id and r.status='RESERVED'
      and c.code=upper(btrim(p_code)) limit 1;
  if v_reserved.id is not null then
    select code into v_code from public.ead_coupons where id=v_reserved.coupon_id;
    return jsonb_build_object('couponId',v_reserved.coupon_id,'code',v_code,'poloId',v_reserved.polo_id,
      'turmaId',v_reserved.turma_id,'requestId',v_reserved.request_id,'discountPercent',v_reserved.discount_percent,
      'originalAmount',v_reserved.original_amount,'discountAmount',v_reserved.discount_amount,'payableAmount',v_reserved.payable_amount);
  end if;
  return internal_contas.ead_coupon_context(p_code,p_course_id,v_aluno);
end; $$;

revoke all on function internal_contas.ead_coupon_assert_enabled(),internal_contas.ead_coupon_student(),
  internal_contas.ead_coupon_context(text,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.ead_coupon_quote(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ead_coupon_quote(text,uuid) to authenticated;

commit;
