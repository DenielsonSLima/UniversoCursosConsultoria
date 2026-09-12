begin;

create function public.list_financial_reconciliation_secure(
  p_company_id uuid default null,p_polo_id uuid default null,
  p_payment_start date default null,p_payment_end date default null,
  p_search text default null,p_origin text default 'TODOS',p_environment text default 'production',
  p_page integer default 1,p_page_size integer default 20,
  p_status text default 'TODOS',p_source_system text default 'ALL'
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_polos uuid[];
  v_source text:=upper(coalesce(nullif(btrim(p_source_system),''),'ALL'));
  v_status text:=upper(coalesce(nullif(btrim(p_status),''),'TODOS'));
  v_origin text:=upper(coalesce(nullif(btrim(p_origin),''),'TODOS'));
  v_environment text:=lower(coalesce(nullif(btrim(p_environment),''),'production'));
  v_page integer:=greatest(1,coalesce(p_page,1));
  v_size integer:=greatest(1,least(100,coalesce(p_page_size,20)));
  v_search text:=nullif(public.financeiro_normalize_search_text(left(btrim(coalesce(p_search,'')),120)),'');
  v_digits text:=regexp_replace(left(coalesce(p_search,''),120),'[^0-9]','','g');
  v_today date:=(now() at time zone 'America/Maceio')::date;
  v_result jsonb;
begin
  -- Identical actor/module/tab/polo/company boundary to the existing paid feed.
  if auth.uid() is null or not public.gestor_has_module('financeiro')
    or not public.gestor_has_financeiro_tab('receber') then
    raise exception 'Acesso negado à conciliação financeira.' using errcode='42501'; end if;
  v_polos:=coalesce(public.gestor_allowed_polo_ids(),array[]::uuid[]);
  if cardinality(v_polos)=0 or (p_polo_id is not null and not p_polo_id=any(v_polos)) then
    raise exception 'Polo fora do escopo financeiro autorizado.' using errcode='42501'; end if;
  if p_company_id is not null and not exists(
    select 1 from public.polos p where p.id=any(v_polos) and p.company_id=p_company_id) then
    raise exception 'Empresa fora do escopo financeiro autorizado.' using errcode='42501'; end if;
  if p_company_id is not null and p_polo_id is not null and not exists(
    select 1 from public.polos p where p.id=p_polo_id and p.company_id=p_company_id) then
    raise exception 'Empresa e polo não pertencem ao mesmo escopo.' using errcode='22023'; end if;
  if p_payment_start>p_payment_end then
    raise exception 'Período de recebimentos inválido.' using errcode='22023'; end if;
  if v_source not in ('ALL','PROESC','BANESE')
    or v_status not in ('TODOS','PAGO','PENDENTE','VENCIDO','AGUARDANDO_CONFIRMACAO','AGUARDANDO_PAGAMENTO','SUSPENSO','CANCELADO')
    or v_origin not in ('TODOS','PROESC','AUTOMATICA_BANESE','CNAB240','MANUAL','HISTORICO_MIGRADO','OUTRO','PENDENTE')
    or v_environment not in ('production','sandbox') then
    raise exception 'Filtro de conciliação inválido.' using errcode='22023'; end if;

  with identified as materialized (
    -- Keep scalar records through filtering/counts; hydrate money components
    -- and display data only after LIMIT/OFFSET.
    select c.id,c.polo_id,c.status,c.valor,c.valor_pago,c.data_pagamento,c.data_vencimento,
      c.gateway_last_error,c.gateway_settlement_recorded_at,
      internal_proesc.reconciliation_source_system(c) source_system,
      c.origem_pagamento,c.gateway_environment,c.gateway_provider,c.gateway_status,
      c.gateway_settlement_source,c.gateway_submission_channel,c.manual_settlement_id,
      c.manual_settlement_reversed_at,
      case when c.manual_settlement_id is not null and c.manual_settlement_reversed_at is null
        then manual.completed_at end manual_completed_at
    from public.contas_receber c
    join public.polos p on p.id=c.polo_id
    left join public.matriculas m on m.id=c.matricula_id
    left join public.parceiros student on student.id=m.aluno_id
    left join public.parceiros payer on payer.id=coalesce(c.cliente_id,student.id)
    left join public.turmas t on t.id=coalesce(c.turma_id,m.turma_id)
    left join public.cursos course on course.id=t.curso_id
    left join public.receivable_manual_settlements manual on manual.id=c.manual_settlement_id
      and manual.receivable_id=c.id and c.manual_settlement_reversed_at is null and manual.reversed_at is null
    where c.polo_id=any(v_polos) and (p_polo_id is null or c.polo_id=p_polo_id)
      and (p_company_id is null or p.company_id=p_company_id)
      and (p_payment_start is null or c.data_pagamento>=p_payment_start)
      and (p_payment_end is null or c.data_pagamento<=p_payment_end)
      and not exists(select 1 from public.emprestimos_financeiros loan where loan.conta_receber_id=c.id)
      and (v_search is null
        or position(v_search in public.financeiro_normalize_search_text(payer.nome))>0
        or position(v_search in public.financeiro_normalize_search_text(student.nome))>0
        or position(v_search in public.financeiro_normalize_search_text(c.descricao))>0
        or position(v_search in public.financeiro_normalize_search_text(course.nome))>0
        or position(v_search in public.financeiro_normalize_search_text(concat_ws(' ',t.codigo,t.nome)))>0
        or position(v_search in public.financeiro_normalize_search_text(coalesce(student.matricula_acesso,payer.matricula_acesso)))>0
        or position(v_search in public.financeiro_normalize_search_text(c.gateway_boleto_nosso_numero))>0
        or (length(v_digits) in (11,14) and (v_digits=regexp_replace(coalesce(payer.cpf_cnpj,''),'[^0-9]','','g')
          or v_digits=regexp_replace(coalesce(student.cpf_cnpj,''),'[^0-9]','','g'))))
  ), classified as materialized (
    select x.*,evidence.source_status,evidence.verification,
      case when x.source_system='PROESC' then 'PROESC'
        when upper(coalesce(x.origem_pagamento,''))='SISTEMA_ANTERIOR' then 'HISTORICO_MIGRADO'
        when (x.manual_settlement_id is not null and x.manual_settlement_reversed_at is null)
          or upper(coalesce(x.origem_pagamento,''))='PRESENCIAL' then 'MANUAL'
        when upper(coalesce(x.gateway_settlement_source,'')) in ('CNAB','CNAB240')
          or upper(coalesce(x.origem_pagamento,'')) in ('CNAB','CNAB240')
          then 'CNAB240'
        when x.status='PAGO' and ((x.gateway_provider='banese_card'
          and upper(coalesce(x.gateway_status,'')) in ('PAID','PAGO','RECEIVED','CONFIRMED','LIQUIDATED'))
          or upper(coalesce(x.origem_pagamento,''))='BANESE') then 'AUTOMATICA_BANESE'
        else 'OUTRO' end origem
    from identified x
    left join lateral (
      select f.source_status,f.verification from internal_proesc.obligation_links l
      join internal_proesc.financial_snapshots f on f.link_id=l.id
      where x.source_system='PROESC' and l.receivable_id=x.id
      order by f.observed_at desc,f.recorded_at desc,f.id desc limit 1
    ) evidence on true
    where (x.source_system in ('PROESC','BANESE') or x.status='PAGO')
      and (x.source_system='PROESC' or lower(x.gateway_environment)=v_environment
        or (x.gateway_environment is null and x.gateway_provider is null and v_environment='production')
        or upper(coalesce(x.origem_pagamento,'')) in ('PRESENCIAL','SISTEMA_ANTERIOR')
        or (x.manual_settlement_id is not null and x.manual_settlement_reversed_at is null))
      -- An operational overdue flag is not proof of an unpaid Proesc balance.
      and (v_status<>'VENCIDO' or x.source_system<>'PROESC'
        or (evidence.source_status='OPEN' and evidence.verification='VERIFIED'))
      and ((v_status='TODOS' and x.status in ('PENDENTE','VENCIDO','AGUARDANDO_CONFIRMACAO','AGUARDANDO_PAGAMENTO','PAGO'))
        or (v_status='PENDENTE' and (x.status in ('PENDENTE','AGUARDANDO_CONFIRMACAO','AGUARDANDO_PAGAMENTO')
          or (x.status='VENCIDO' and x.source_system='PROESC'
            and (coalesce(evidence.verification,'REVIEW')<>'VERIFIED' or coalesce(evidence.source_status,'UNKNOWN')<>'OPEN'))))
        or (v_status not in ('TODOS','PENDENTE') and x.status=v_status))
  ), source_filtered as materialized (
    select * from classified where v_source='ALL' or source_system=v_source
  ), origin_filtered as materialized (
    select * from source_filtered x where v_origin='TODOS' or x.origem=v_origin
      or (v_origin='PENDENTE' and x.status in ('PENDENTE','VENCIDO','AGUARDANDO_CONFIRMACAO','AGUARDANDO_PAGAMENTO'))
  ), page_seed as materialized (
    select x.id,x.source_system,x.origem,x.data_pagamento,
      case when x.origem='MANUAL' then x.manual_completed_at
        when x.origem in ('PROESC','HISTORICO_MIGRADO') then null else x.gateway_settlement_recorded_at end recorded_at
    from origin_filtered x
    order by x.data_pagamento desc nulls last,
      case when x.origem='MANUAL' then x.manual_completed_at
        when x.origem in ('PROESC','HISTORICO_MIGRADO') then null else x.gateway_settlement_recorded_at end desc nulls last,
      x.id desc
    limit v_size offset ((v_page::bigint-1)*v_size)
  ), page_items as materialized (
    select p.*,internal_proesc.reconciliation_item(p.id,p.source_system,p.origem) item from page_seed p
  ), channels as (
    select count(*) total,
      count(*) filter(where status in ('PENDENTE','VENCIDO','AGUARDANDO_CONFIRMACAO','AGUARDANDO_PAGAMENTO')) pendente,
      count(*) filter(where origem='PROESC') proesc,
      count(*) filter(where origem='AUTOMATICA_BANESE') automatica_banese,
      count(*) filter(where origem='CNAB240') cnab240,
      count(*) filter(where origem='MANUAL') manual,
      count(*) filter(where origem='HISTORICO_MIGRADO') historico_migrado,
      count(*) filter(where origem='OUTRO') outro
    from source_filtered
  ), totals as (
    select count(*) total,
      count(*) filter(where status in ('PENDENTE','VENCIDO','AGUARDANDO_CONFIRMACAO','AGUARDANDO_PAGAMENTO')) pending,
      coalesce(sum(valor) filter(where status in ('PENDENTE','VENCIDO','AGUARDANDO_CONFIRMACAO','AGUARDANDO_PAGAMENTO')),0) pending_principal,
      count(*) filter(where status='PAGO' and data_pagamento=v_today) paid_today,
      count(*) filter(where status<>'PAGO' and nullif(btrim(gateway_last_error),'') is not null and gateway_last_error<>'-') errors,
      count(*) filter(where source_system='PROESC' and status<>'PAGO'
        and (coalesce(verification,'REVIEW')<>'VERIFIED' or coalesce(source_status,'UNKNOWN')<>'OPEN')) review_candidates
    from origin_filtered
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(item order by data_pagamento desc nulls last,recorded_at desc nulls last,id desc) from page_items),'[]'::jsonb),
    'total_count',totals.total,'page',v_page,'page_size',v_size,
    'total_pages',greatest(1,ceil(totals.total::numeric/v_size)::integer),
    'counts',to_jsonb(channels),
    'source_counts',(select jsonb_build_object('all',count(*),'proesc',count(*) filter(where source_system='PROESC'),
      'banese',count(*) filter(where source_system='BANESE'),'other',count(*) filter(where source_system='OTHER')) from classified),
    'summary',jsonb_build_object('total_pendentes',totals.pending,'valor_pendentes',null,
      'valor_principal_pendente',totals.pending_principal,'total_pago_hoje',totals.paid_today,
      'total_com_erro',totals.errors,'source_review_count',totals.review_candidates),
    'source_system',v_source,'status',v_status
  ) into v_result from channels cross join totals;
  return v_result;
end;
$$;
revoke all on function public.list_financial_reconciliation_secure(uuid,uuid,date,date,text,text,text,integer,integer,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.list_financial_reconciliation_secure(uuid,uuid,date,date,text,text,text,integer,integer,text,text)
  to authenticated;
notify pgrst,'reload schema';
commit;
