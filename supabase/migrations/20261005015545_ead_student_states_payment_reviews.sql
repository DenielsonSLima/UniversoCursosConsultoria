begin;
alter table public.ead_payment_reviews add column resolution_evidence_reference text;

create function public.ead_get_student_checkout_states(p_aluno_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if coalesce((select auth.role()),'')<>'service_role' and public.current_aluno_id() is distinct from p_aluno_id then
    raise exception 'Compra de outro aluno não autorizada.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('matriculaId',a.matricula_id,'cursoId',a.curso_id,
    'turmaId',a.turma_id,'poloId',c.polo_id,'attemptId',a.id,'receivableId',c.id,'inscricaoId',a.inscription_id,
    'attemptState',a.state,'isCurrent',a.is_current,'hasAccess',m.status in ('ATIVO','CONCLUIDO'),
    'canRebuy',a.state='EXPIRED' and not exists(select 1 from public.contas_receber paid
      where paid.matricula_id=a.matricula_id and paid.status='PAGO')
      and m.status in ('PENDENTE','AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO'),
    'canPay',a.state='OPEN' and c.status='PENDENTE' and c.data_vencimento>=internal_contas.ead_expiration_today()
      and c.gateway_status in ('PENDING','REGISTERED','OVERDUE')
      and c.data_pagamento is null and coalesce(c.valor_pago,0)=0
      and not exists(select 1 from public.payment_gateway_transactions tx where tx.receivable_id=c.id
        and upper(coalesce(tx.remote_status,'')) in ('PAID','RECEIVED','CONFIRMED','APPROVED'))
      and not exists(select 1 from public.inscricoes_online i where i.id=a.inscription_id
        and (i.status='PAGO' or i.pago_em is not null or i.confirmado_em is not null))
      and c.gateway_creation_token is null and c.gateway_payment_id is not null
      and not exists(select 1 from public.banese_ead_checkout_expiration_jobs j where j.receivable_id=c.id
        and j.state in ('PROCESSING','RETRY','REVIEW_REQUIRED')),
    'reviewRequired',exists(select 1 from public.ead_payment_reviews r
      where (r.attempt_id=a.id or r.other_attempt_id=a.id) and r.state='OPEN')) order by a.created_at),'[]'::jsonb)
  into v_result from public.ead_checkout_attempts a join public.contas_receber c on c.id=a.receivable_id
    join public.matriculas m on m.id=a.matricula_id where a.aluno_id=p_aluno_id and a.is_current;
  return v_result;
end; $$;
revoke all on function public.ead_get_student_checkout_states(uuid) from public,anon;
grant execute on function public.ead_get_student_checkout_states(uuid) to authenticated,service_role;

create function public.ead_list_payment_reviews_secure(p_polo_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.' using errcode='42501'; end if;
  perform public.assert_receivables_filter_scope(p_polo_id);
  select coalesce(jsonb_agg(result.body order by result.created_at desc),'[]'::jsonb) into v_result from (
  select jsonb_build_object('id',r.id,'source','PAYMENT_REVIEW','attemptId',r.attempt_id,
    'otherAttemptId',r.other_attempt_id,'receivableId',r.receivable_id,'matriculaId',a.matricula_id,
    'alunoId',a.aluno_id,'alunoNome',p.nome,'cursoNome',course.nome,'poloId',r.polo_id,'poloNome',polo.nome,
    'reason',r.reason,'state',r.state,'amount',case when c.status='PAGO' then c.valor_pago
      when r.evidence->>'totalAmountCents' ~ '^[0-9]{1,14}$' then (r.evidence->>'totalAmountCents')::numeric/100 else c.valor end,
    'amountKind',case when c.status='PAGO' then 'CONFIRMED'
      when r.evidence->>'totalAmountCents' ~ '^[0-9]{1,14}$' then 'BANK_OBSERVED' else 'EXPECTED' end,
    'paymentDate',case when c.status='PAGO' then c.data_pagamento else null end,
    'bankPaymentDate',case when r.evidence->>'paymentDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then r.evidence->>'paymentDate' else null end,
    'paymentCount',case when r.evidence->>'paymentCount' ~ '^[0-9]{1,6}$' then (r.evidence->>'paymentCount')::integer else null end,
    'evidence',r.evidence,'createdAt',r.created_at,'resolutionAction',r.resolution_action,
    'resolvedAt',r.resolved_at) body,r.created_at
  from public.ead_payment_reviews r join public.ead_checkout_attempts a on a.id=r.attempt_id
  join public.contas_receber c on c.id=r.receivable_id join public.parceiros p on p.id=a.aluno_id
  join public.cursos course on course.id=a.curso_id join public.polos polo on polo.id=r.polo_id
  where (p_polo_id is null or r.polo_id=p_polo_id)
    and (public.gestor_has_any_global_module(array['financeiro'])
      or public.gestor_has_any_module_for_polo(array['financeiro'],r.polo_id))
  union all
  select jsonb_build_object('id',j.id,'source','EXPIRATION_JOB','attemptId',j.attempt_id,
    'receivableId',j.receivable_id,'matriculaId',j.matricula_id,'alunoId',m.aluno_id,
    'alunoNome',p.nome,'cursoNome',course.nome,'poloId',c.polo_id,'poloNome',polo.nome,
    'reason','EXPIRATION_REVIEW','state','OPEN','amount',c.valor,'amountKind','EXPECTED',
    'paymentDate',null,'bankPaymentDate',null,'paymentCount',null,'createdAt',j.created_at,
    'evidence',jsonb_build_object('code',coalesce(j.last_error_code,'EXPIRATION_REVIEW_REQUIRED')),
    'resolutionAction',null,'resolvedAt',null) body,j.created_at
  from public.banese_ead_checkout_expiration_jobs j join public.contas_receber c on c.id=j.receivable_id
  join public.matriculas m on m.id=j.matricula_id join public.turmas t on t.id=m.turma_id
  join public.cursos course on course.id=t.curso_id join public.parceiros p on p.id=m.aluno_id
  join public.polos polo on polo.id=c.polo_id
  where j.state='REVIEW_REQUIRED' and (p_polo_id is null or c.polo_id=p_polo_id)
    and (public.gestor_has_any_global_module(array['financeiro'])
      or public.gestor_has_any_module_for_polo(array['financeiro'],c.polo_id))
    and not exists(select 1 from public.ead_payment_reviews r where r.receivable_id=j.receivable_id and r.state='OPEN')
  ) result;
  return v_result;
end; $$;
revoke all on function public.ead_list_payment_reviews_secure(uuid) from public,anon;
grant execute on function public.ead_list_payment_reviews_secure(uuid) to authenticated;

create function public.ead_list_refund_candidates_secure(p_review_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_r public.ead_payment_reviews%rowtype;v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.' using errcode='42501'; end if;
  select * into strict v_r from public.ead_payment_reviews where id=p_review_id;
  perform public.assert_receivables_filter_scope(v_r.polo_id);
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'descricao',d.descricao,'valor',d.valor_pago,
    'dataPagamento',d.data_pagamento,'comprovanteRef',concat_ws('/',d.anexo_bucket,d.anexo_path)) order by d.data_pagamento desc),'[]'::jsonb)
  into v_result from public.despesas_lancamentos d
  join public.contas_receber c on c.id=v_r.receivable_id
  where v_r.reason='DUPLICATE_PAYMENT' and v_r.state='OPEN' and d.status='PAGO' and c.status='PAGO'
    and d.polo_id=v_r.polo_id and d.fornecedor_id=c.cliente_id
    and d.valor_pago>=c.valor_pago and d.data_pagamento>=c.data_pagamento
    and public.is_financeiro_for_polo(v_r.polo_id)
    and ((d.tipo='OUTRO_DEBITO' and public.gestor_has_financeiro_tab('outros-debitos'))
      or (d.tipo<>'OUTRO_DEBITO' and public.gestor_has_financeiro_tab('despesas')))
    and nullif(d.anexo_bucket,'') is not null and nullif(d.anexo_path,'') is not null
    and not exists(select 1 from public.ead_payment_reviews used where used.refund_expense_id=d.id);
  return v_result;
end; $$;
revoke all on function public.ead_list_refund_candidates_secure(uuid) from public,anon;
grant execute on function public.ead_list_refund_candidates_secure(uuid) to authenticated;

create function public.ead_resolve_payment_review_secure(
  p_review_id uuid,p_request_id uuid,p_resolution text,p_refund_expense_id uuid,p_evidence_reference text,p_note text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_r public.ead_payment_reviews%rowtype;v_c public.contas_receber%rowtype;v_d public.despesas_lancamentos%rowtype;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.' using errcode='42501'; end if;
  select * into strict v_r from public.ead_payment_reviews where id=p_review_id for update;
  -- Authorize the concrete scope before reading any idempotency result.
  perform public.assert_receivables_filter_scope(v_r.polo_id);
  if not public.is_financeiro_for_polo(v_r.polo_id) then
    raise exception 'Operação financeira não autorizada.' using errcode='42501'; end if;
  if p_request_id is null or p_resolution is distinct from 'LINK_CONFIRMED_REFUND'
    or p_refund_expense_id is null or nullif(trim(p_evidence_reference),'') is null
    or length(p_evidence_reference)>500 or length(coalesce(p_note,''))>2000 then
    raise exception 'Resolução financeira inválida.'; end if;
  if v_r.resolution_request_id=p_request_id then
    if v_r.refund_expense_id is distinct from p_refund_expense_id or v_r.resolution_action<>p_resolution
      or v_r.resolution_evidence_reference is distinct from p_evidence_reference
      or v_r.resolution_notes is distinct from p_note then raise exception 'Request id de resolução reutilizado.'; end if;
    return jsonb_build_object('reviewId',v_r.id,'state',v_r.state,'resolution',v_r.resolution_action,'refundExpenseId',v_r.refund_expense_id);
  end if;
  select * into strict v_c from public.contas_receber where id=v_r.receivable_id for update;
  select * into strict v_d from public.despesas_lancamentos where id=p_refund_expense_id for update;
  if not ((v_d.tipo='OUTRO_DEBITO' and public.gestor_has_financeiro_tab('outros-debitos'))
    or (v_d.tipo<>'OUTRO_DEBITO' and public.gestor_has_financeiro_tab('despesas'))) then
    raise exception 'Operação de devolução não autorizada.' using errcode='42501'; end if;
  if v_r.state<>'OPEN' or v_r.reason<>'DUPLICATE_PAYMENT' or v_c.status<>'PAGO'
    or v_d.status<>'PAGO' or v_d.polo_id is distinct from v_r.polo_id
    or v_d.fornecedor_id is distinct from v_c.cliente_id or coalesce(v_d.valor_pago,0)<v_c.valor_pago
    or v_d.data_pagamento is null or v_d.data_pagamento<v_c.data_pagamento
    or nullif(v_d.anexo_bucket,'') is null or nullif(v_d.anexo_path,'') is null
    or p_evidence_reference is distinct from concat_ws('/',v_d.anexo_bucket,v_d.anexo_path) then
    raise exception 'Devolução paga canônica não comprovada para este aluno/polo.' using errcode='PT409'; end if;
  update public.ead_payment_reviews set state='RESOLVED',resolution_action=p_resolution,
    resolution_request_id=p_request_id,resolved_by=auth.uid(),resolved_at=now(),refund_expense_id=v_d.id,
    resolution_notes=p_note,resolution_evidence_reference=p_evidence_reference,updated_at=now() where id=v_r.id;
  insert into public.sistema_eventos(entidade,entidade_id,acao,descricao,detalhes)
  values('ead_payment_reviews',v_r.id::text,'Vinculou devolução paga','Devolução comprovada de pagamento duplicado EAD.',
    jsonb_build_object('actorUid',auth.uid(),'requestId',p_request_id,'receivableId',v_c.id,
      'expenseId',v_d.id,'evidenceReference',p_evidence_reference,'note',p_note));
  return jsonb_build_object('reviewId',v_r.id,'state','RESOLVED','resolution',p_resolution,'refundExpenseId',v_d.id);
end; $$;
revoke all on function public.ead_resolve_payment_review_secure(uuid,uuid,text,uuid,text,text) from public,anon;
grant execute on function public.ead_resolve_payment_review_secure(uuid,uuid,text,uuid,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
