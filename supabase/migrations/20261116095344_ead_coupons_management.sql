begin;

create function internal_contas.ead_coupon_json(p_coupon public.ead_coupons)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',p_coupon.id,'poloId',p_coupon.polo_id,'code',p_coupon.code,
    'discountPercent',p_coupon.discount_percent,'totalLimit',p_coupon.total_limit,
    'startsAt',p_coupon.starts_at,'endsAt',p_coupon.ends_at,'perStudentLimit',p_coupon.per_student_limit,
    'active',p_coupon.active,'allCourses',p_coupon.all_courses,'courseIds',to_jsonb(p_coupon.course_ids),
    'createdAt',p_coupon.created_at,'updatedAt',p_coupon.updated_at,
    'reservedCount',(select count(*) from public.ead_coupon_redemptions r where r.coupon_id=p_coupon.id and r.status='RESERVED'),
    'confirmedCount',(select count(*) from public.ead_coupon_redemptions r where r.coupon_id=p_coupon.id and r.status='CONFIRMED'))
$$;
revoke all on function internal_contas.ead_coupon_json(public.ead_coupons) from public,anon,authenticated,service_role;

create function public.ead_coupons_courses(p_polo_id uuid,p_search text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.ead_coupons_can_manage(p_polo_id) then
    raise exception 'Secretaria e Financeiro do polo são obrigatórios.' using errcode='42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.nome) order by c.nome,c.id),'[]')
    from public.cursos c where upper(c.modalidade)='EAD' and upper(c.status)='ATIVO' and c.publicar_site
      and c.nome ilike '%'||left(coalesce(p_search,''),100)||'%'
      and exists(select 1 from public.turmas t where t.curso_id=c.id and t.polo_id=p_polo_id
        and upper(t.status)='EM_ANDAMENTO'));
end; $$;

create function public.ead_coupons_list(p_polo_id uuid,p_search text default '',p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_total integer; v_items jsonb;
begin
  if not public.ead_coupons_can_manage(p_polo_id) then
    raise exception 'Secretaria e Financeiro do polo são obrigatórios.' using errcode='42501';
  end if;
  if p_page is null or p_page<1 or p_page>100000 then raise exception 'Página inválida.' using errcode='22023'; end if;
  select count(*) into v_total from public.ead_coupons c where c.polo_id=p_polo_id
    and c.code ilike '%'||left(coalesce(p_search,''),100)||'%';
  select coalesce(jsonb_agg(internal_contas.ead_coupon_json(page) order by page.created_at desc,page.id),'[]')
  into v_items from (select c.* from public.ead_coupons c where c.polo_id=p_polo_id
    and c.code ilike '%'||left(coalesce(p_search,''),100)||'%'
    order by c.created_at desc,c.id limit 20 offset (p_page-1)*20) page;
  return jsonb_build_object('items',v_items,'total',v_total,'page',p_page,'pageSize',20);
end; $$;

create function public.ead_coupons_save(p_polo_id uuid,p_coupon jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
  v_c public.ead_coupons%rowtype; v_old public.ead_coupons%rowtype;
  v_request internal_contas.ead_coupon_management_requests%rowtype;
  v_payload jsonb; v_courses uuid[]; v_id uuid; v_response jsonb; v_count integer;
begin
  -- Authorization must precede request lookup and replay.
  if not public.ead_coupons_can_manage(p_polo_id) then
    raise exception 'Secretaria e Financeiro do polo são obrigatórios.' using errcode='42501';
  end if;
  if p_request_id is null or jsonb_typeof(p_coupon) is distinct from 'object' then
    raise exception 'Dados de cupom inválidos.' using errcode='22023';
  end if;
  v_payload:=jsonb_build_object('poloId',p_polo_id,'coupon',p_coupon);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ead_coupon_save:'||p_request_id::text,0));
  select * into v_request from internal_contas.ead_coupon_management_requests where request_id=p_request_id;
  if found then
    if v_request.actor_id is distinct from auth.uid() or v_request.payload is distinct from v_payload then
      raise exception 'Request id reutilizado com outro cupom.' using errcode='22023';
    end if;
    return v_request.response;
  end if;
  v_id:=coalesce(nullif(p_coupon->>'id','')::uuid,gen_random_uuid());
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ead_coupon_id:'||v_id::text,0));
  select * into v_old from public.ead_coupons where id=v_id for update;
  if found and v_old.polo_id<>p_polo_id then
    raise exception 'Cupom fora do polo autorizado.' using errcode='42501';
  end if;
  if v_old.id is not null and (p_coupon->>'updatedAt')::timestamptz is distinct from v_old.updated_at then
    raise exception 'O cupom foi alterado. Feche e abra o formulário novamente para revisar a versão atual.' using errcode='PT409';
  end if;
  if jsonb_typeof(p_coupon->'courseIds') is distinct from 'array'
    or jsonb_typeof(p_coupon->'active') is distinct from 'boolean'
    or jsonb_typeof(p_coupon->'allCourses') is distinct from 'boolean' then
    raise exception 'Seleção de cursos ou situação inválida.' using errcode='22023';
  end if;
  select coalesce(array_agg(distinct course_id),'{}') into v_courses
    from (select jsonb_array_elements_text(p_coupon->'courseIds')::uuid course_id) s;
  v_c.id:=v_id; v_c.polo_id:=p_polo_id; v_c.code:=upper(btrim(p_coupon->>'code'));
  v_c.discount_percent:=(p_coupon->>'discountPercent')::integer;
  v_c.total_limit:=nullif(p_coupon->>'totalLimit','')::integer;
  v_c.starts_at:=(p_coupon->>'startsAt')::timestamptz; v_c.ends_at:=(p_coupon->>'endsAt')::timestamptz;
  v_c.per_student_limit:=(p_coupon->>'perStudentLimit')::integer;
  v_c.active:=(p_coupon->>'active')::boolean; v_c.all_courses:=(p_coupon->>'allCourses')::boolean;
  v_c.course_ids:=case when v_c.all_courses then '{}'::uuid[] else v_courses end;
  if v_c.code is null or v_c.code !~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'
    or v_c.discount_percent is null or v_c.discount_percent not in (50,100)
    or v_c.starts_at is null or v_c.ends_at is null or v_c.ends_at<=v_c.starts_at
    or v_c.per_student_limit is null or v_c.per_student_limit<=0
    or v_c.total_limit<=0 or (not v_c.all_courses and cardinality(v_courses)=0) then
    raise exception 'Código, benefício, limites ou validade inválidos.' using errcode='22023';
  end if;
  if exists(select 1 from unnest(v_c.course_ids) cid where not exists(select 1 from public.cursos c
    where c.id=cid and upper(c.modalidade)='EAD' and
      (cid=any(coalesce(v_old.course_ids,'{}')) or (upper(c.status)='ATIVO' and c.publicar_site
        and exists(select 1 from public.turmas t where t.curso_id=c.id and t.polo_id=p_polo_id
          and upper(t.status)='EM_ANDAMENTO'))))) then
    raise exception 'Curso EAD fora do polo ou indisponível.' using errcode='42501';
  end if;
  select count(*) into v_count from public.ead_coupon_redemptions where coupon_id=v_id and status<>'RELEASED';
  if v_count>0 and (v_c.code<>v_old.code or v_c.discount_percent<>v_old.discount_percent) then
    raise exception 'Código e benefício com utilizações são imutáveis.' using errcode='PT409';
  end if;
  if v_c.total_limit<v_count or exists(select 1 from public.ead_coupon_redemptions
    where coupon_id=v_id and status<>'RELEASED' group by aluno_id having count(*)>v_c.per_student_limit) then
    raise exception 'Limite inferior às utilizações já reservadas ou confirmadas.' using errcode='PT409';
  end if;
  insert into public.ead_coupons(id,polo_id,code,discount_percent,total_limit,starts_at,ends_at,
    per_student_limit,active,all_courses,course_ids,created_by,updated_by)
  values(v_id,p_polo_id,v_c.code,v_c.discount_percent,v_c.total_limit,v_c.starts_at,v_c.ends_at,
    v_c.per_student_limit,v_c.active,v_c.all_courses,v_c.course_ids,auth.uid(),auth.uid())
  on conflict(id) do update set code=excluded.code,discount_percent=excluded.discount_percent,
    total_limit=excluded.total_limit,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
    per_student_limit=excluded.per_student_limit,active=excluded.active,all_courses=excluded.all_courses,
    course_ids=excluded.course_ids,updated_by=auth.uid(),updated_at=clock_timestamp()
  returning * into v_c;
  v_response:=internal_contas.ead_coupon_json(v_c);
  insert into internal_contas.ead_coupon_management_requests(request_id,actor_id,polo_id,payload,response)
    values(p_request_id,auth.uid(),p_polo_id,v_payload,v_response);
  return v_response;
end; $$;

create function public.ead_coupons_history(p_polo_id uuid,p_coupon_id uuid,p_page integer default 1)
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
    'matriculaId',r.matricula_id,'createdAt',r.created_at,'confirmedAt',r.confirmed_at,
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

revoke all on function public.ead_coupons_courses(uuid,text),public.ead_coupons_list(uuid,text,integer),
  public.ead_coupons_save(uuid,jsonb,uuid),public.ead_coupons_history(uuid,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.ead_coupons_courses(uuid,text),public.ead_coupons_list(uuid,text,integer),
  public.ead_coupons_save(uuid,jsonb,uuid),public.ead_coupons_history(uuid,uuid,integer) to authenticated;

commit;
